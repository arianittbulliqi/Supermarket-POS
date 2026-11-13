/**
 * Turns a sale or refund into ATK's two messages: the POS coupon sent to
 * ATK, and the citizen coupon that goes into the receipt's QR code. The
 * citizen coupon repeats the POS coupon's figures exactly, or the receipt
 * fails verification.
 */
import type { Sale, Settings, Unit, VatRate } from '../../domain/types';
import { CouponType, PaymentType, type CitizenCoupon, type PosCoupon, type TaxGroup } from './pb';

/** ATK tax letters: A is exempt, C 0%, D 8%, E 18%. */
export const XK_TAX: Record<VatRate, string> = { 0: 'C', 8: 'D', 18: 'E' };
/** ATK unit codes (NJËSITË MATËSE): pieces are CP, loose goods are sold by net kg. */
export const XK_UNIT: Record<Unit, string> = { pcs: 'CP', kg: 'KGN' };

/** ATK item categories most groceries use, for the product form. */
export const XK_ITEM_TYPES: [code: string, label: string][] = [
  ['AU', 'AU · Food from retail shops'],
  ['PP', 'PP · Fruit and vegetables'],
  ['MPM', 'MPM · Meat and meat products'],
  ['PM', 'PM · Flour products, bread, burek'],
  ['PJA', 'PJA · Soft drinks'],
  ['PAL', 'PAL · Alcoholic drinks'],
  ['DUH', 'DUH · Tobacco'],
  ['KO', 'KO · Cosmetics'],
  ['BM', 'BM · Medicine'],
  ['PS', 'PS · Household goods'],
  ['TT', 'TT · Other'],
];

/** A sensible ATK category from the store's own category name, until one is set on the product. */
export function guessItemType(category: string): string {
  const c = category.toLowerCase();
  if (/fruit|veg|produce|pem|perim/.test(c)) return 'PP';
  if (/meat|butcher|deli|mish/.test(c)) return 'MPM';
  if (/bak|bread|buk|flour/.test(c)) return 'PM';
  if (/beer|wine|spirit|alcohol|alkool/.test(c)) return 'PAL';
  if (/drink|water|juice|soda|pije/.test(c)) return 'PJA';
  if (/tobacco|cigar|duhan/.test(c)) return 'DUH';
  if (/cosmetic|beauty|personal|hygien/.test(c)) return 'KO';
  if (/clean|household|home/.test(c)) return 'PS';
  return 'AU';
}

export interface XkConfig {
  env: 'test' | 'prod';
  nui: string;
  vat_no: string;
  fiscal_no: string;
  unit_no: string;
  branch_id: string;
  pos_id: string;
  app_id: string;
  location: string;
  relay: string;
  cert: string;
  business_name: string;
}

export function xkConfig(settings: Settings): XkConfig {
  const c = settings.fiscal_config;
  const g = (k: string) => (c[k] ?? '').trim();
  return {
    env: g('env') === 'prod' ? 'prod' : 'test',
    nui: settings.business_no.trim(),
    vat_no: g('vat_no'),
    fiscal_no: g('fiscal_no'),
    unit_no: g('unit_no'),
    branch_id: g('branch_id'),
    pos_id: g('pos_id'),
    app_id: g('app_id'),
    location: g('location'),
    relay: g('relay'),
    cert: g('cert'),
    business_name: g('business_name'),
  };
}

const num = (label: string, v: string): bigint => {
  if (!/^\d{1,19}$/.test(v)) throw new Error(`${label} is missing or not a number (Settings › Tax and fiscal).`);
  return BigInt(v);
};

/** What is missing before this till can sign receipts, as plain sentences. */
export function missing(cfg: XkConfig): string[] {
  const out: string[] = [];
  if (!/^\d+$/.test(cfg.nui)) out.push('Business number (NUI) in Store details');
  if (!/^\d+$/.test(cfg.branch_id)) out.push('Branch ID');
  if (!/^\d+$/.test(cfg.pos_id)) out.push('POS ID');
  if (!/^\d+$/.test(cfg.app_id)) out.push('Application ID');
  return out;
}

/** The SEF's identification number printed on receipts: [unit no.]-[NUI]-[POS ID]. */
export const sefId = (cfg: XkConfig) => [cfg.unit_no, cfg.nui, cfg.pos_id].filter(Boolean).join('-');

/**
 * The coupon number sent to ATK. It must be unique across the whole business,
 * and each till numbers its receipts on its own, so it carries the branch and
 * POS: branch × 10^14 + POS × 10^10 + the till's receipt number.
 */
export function couponId(cfg: XkConfig, number: number): bigint {
  const branch = num('Branch ID', cfg.branch_id);
  const pos = num('POS ID', cfg.pos_id);
  if (pos >= 10_000n) throw new Error('POS ID must be below 10000.');
  return branch * 10n ** 14n + pos * 10n ** 10n + BigInt(number);
}

const VERIFY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The receipt's unique verification number (NUIKF): 16 letters and digits, no lookalikes. */
export function newVerificationNo(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => VERIFY_CHARS[x % VERIFY_CHARS.length]).join('');
}

export interface CouponInput {
  sale: Sale;
  settings: Settings;
  verificationNo: string;
  /** For a refund: the original receipt's ATK coupon number. */
  referenceNo: bigint | null;
  /** ATK item category for a product. */
  itemType: (productId: string) => string;
}

export function buildCoupons({ sale, settings, verificationNo, referenceNo, itemType }: CouponInput): { pos: PosCoupon; citizen: CitizenCoupon } {
  const cfg = xkConfig(settings);
  const refund = sale.kind === 'return';
  if (refund && referenceNo == null) throw new Error('A refund must point to the original fiscal receipt.');
  const abs = Math.abs;
  // ATK takes amounts as positive numbers; the coupon type says it is a refund
  const taxGroups: TaxGroup[] = [...sale.vat]
    .sort((a, b) => XK_TAX[a.rate].localeCompare(XK_TAX[b.rate]))
    .map((v) => ({ TaxRate: XK_TAX[v.rate], TotalForTax: abs(v.net), TotalTax: abs(v.vat) }));
  const totalTax = taxGroups.reduce((a, g) => a + g.TotalTax, 0);
  const totalNoTax = taxGroups.reduce((a, g) => a + g.TotalForTax, 0);
  const base = {
    BusinessId: num('Business number (NUI)', cfg.nui),
    CouponId: couponId(cfg, sale.number),
    BranchId: num('Branch ID', cfg.branch_id),
    PosId: num('POS ID', cfg.pos_id),
    VerificationNo: verificationNo,
    Type: refund ? CouponType.Return : CouponType.Sale,
    Time: Math.floor(new Date(sale.created_at).getTime() / 1000),
    Total: abs(sale.total),
    TaxGroups: taxGroups,
    TotalTax: totalTax,
    TotalNoTax: totalNoTax,
  };
  const pos: PosCoupon = {
    ...base,
    Location: cfg.location,
    OperatorId: sale.cashier_name,
    ApplicationId: num('Application ID', cfg.app_id),
    Items: sale.lines.map((l) => ({
      Name: l.name,
      Price: l.price * 100,
      Unit: XK_UNIT[l.unit],
      Quantity: abs(l.qty),
      Total: abs(Math.round(l.price * l.qty)),
      TaxRate: XK_TAX[l.vat_rate],
      Type: itemType(l.product_id),
    })),
    Payments: sale.payments.map((p) => ({ Type: p.method === 'cash' ? PaymentType.Cash : PaymentType.CreditCard, Amount: abs(p.amount) })),
    ReferenceNo: referenceNo ?? 0n,
    TransactionNo: 0n,
    TotalDiscount: abs(sale.discount),
  };
  return { pos, citizen: base };
}
