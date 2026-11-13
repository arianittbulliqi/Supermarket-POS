/**
 * Kosovo ATK fiscalization. The byte-level expectations come from the
 * official Go library (github.com/fiskalizimi/pos-golang, proto.Marshal), so
 * the coupons ATK receives are exactly what its own sample code produces.
 */
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addProduct, emptyCart, returnLines, setLineDiscount, totals } from '../src/domain/cart';
import { settle } from '../src/domain/payment';
import { FiscalQueue } from '../src/fiscal/queue';
import { setFetch } from '../src/fiscal/xk/api';
import { csrInfo, rawSigToDer } from '../src/fiscal/xk/asn1';
import { buildCoupons, couponId, xkConfig } from '../src/fiscal/xk/coupon';
import { makeCsr, memoryKeyStore, setKeyStore, signText } from '../src/fiscal/xk/keys';
import { CouponType, PaymentType, encodeCitizenCoupon, encodePosCoupon, fromBase64, toBase64 } from '../src/fiscal/xk/pb';
import { receiptLines, reportLines } from '../src/print/receipt';
import { zReport } from '../src/domain/reports';
import { Store } from '../src/store/store';

// from proto.Marshal in the official Go library (generator: tests/fixtures/atk-vectors.go)
const GO = {
  citizen: 'CMTVAxAKIAEwATjx98i3BkCcDkoGCgFDEMIDSggKAUQQqAIYGEoJCgFFEPkGGKEBULkBWOMM',
  pos: 'CMTVAxAKGAEiClByaXNodGluw6sqCUt1c2h0cmltaTABONIJQhAxMjM0NTY3ODkwMTIzNDU2SAFQ8ffItwZaJAoKdWplIHJ1Z292ZRCYdRoEY29wZSUAAEBAKMIDMgFDOgJUVFoiCghxdW3Dq3NodBCw6gEaA0tHTiUAAMA+KNgEMgFFOgJBVWIFCAEQ9ANiBQgCEOgHaJwOcgYKAUMQwgNyCAoBRBCoAhgYcgkKAUUQ+QYYoQF4uQGAAeMMmAEZ',
  ret: 'CIC9noIDEKrI14yrr9GxARgBMAE4Y0IEQUJDREgDUPH3yLcGaGOIAanI14yrr9GxAQ==',
};
const T = 1727151089;
const TG = [
  { TaxRate: 'C', TotalForTax: 450, TotalTax: 0 },
  { TaxRate: 'D', TotalForTax: 296, TotalTax: 24 },
  { TaxRate: 'E', TotalForTax: 889, TotalTax: 161 },
];

// the sample key from ATK's Go example (SEC1 PEM), turned into a WebCrypto key
const ATK_SAMPLE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEINiuodwPKwrI8CeAJaf7IITux/c/6h1EhWTs7p1LzRfcoAoGCCqGSM49
AwEHoUQDQgAE9tA2vnPqhZu3ZtwERTWUvM4UTR4c3S0S5AOlKtVp5euUiklHB+S8
jIknSTa+If/STSuM3sA8RJEYB5iqkvQUSQ==
-----END EC PRIVATE KEY-----`;
const nodeKey = createPrivateKey(ATK_SAMPLE_KEY);
const pubKey = createPublicKey(nodeKey);
async function sampleKeys(): Promise<CryptoKeyPair> {
  const alg = { name: 'ECDSA', namedCurve: 'P-256' };
  const privateKey = await crypto.subtle.importKey('pkcs8', nodeKey.export({ format: 'der', type: 'pkcs8' }), alg, false, ['sign']);
  const publicKey = await crypto.subtle.importKey('spki', pubKey.export({ format: 'der', type: 'spki' }), alg, true, ['verify']);
  return { privateKey, publicKey };
}
const atkVerifies = (text: string | Uint8Array, sigB64: string) => verify('sha256', typeof text === 'string' ? Buffer.from(text) : text, { key: pubKey, dsaEncoding: 'der' }, Buffer.from(sigB64, 'base64'));

describe('ATK protobuf', () => {
  it('encodes the citizen coupon byte for byte like the Go library', () => {
    const b = encodeCitizenCoupon({ BusinessId: 60100n, CouponId: 10n, BranchId: 0n, PosId: 1n, VerificationNo: '', Type: CouponType.Sale, Time: T, Total: 1820, TaxGroups: TG, TotalTax: 185, TotalNoTax: 1635 });
    expect(toBase64(b)).toBe(GO.citizen);
  });

  it('encodes the POS coupon (UTF-8 text, kg as float, payments, discount) like the Go library', () => {
    const b = encodePosCoupon({
      BusinessId: 60100n, CouponId: 10n, BranchId: 1n, Location: 'Prishtinë', OperatorId: 'Kushtrimi', PosId: 1n, ApplicationId: 1234n,
      VerificationNo: '1234567890123456', Type: CouponType.Sale, Time: T,
      Items: [
        { Name: 'uje rugove', Price: 15000, Unit: 'cope', Quantity: 3, Total: 450, TaxRate: 'C', Type: 'TT' },
        { Name: 'qumësht', Price: 30000, Unit: 'KGN', Quantity: 0.375, Total: 600, TaxRate: 'E', Type: 'AU' },
      ],
      Payments: [{ Type: PaymentType.Cash, Amount: 500 }, { Type: PaymentType.CreditCard, Amount: 1000 }],
      Total: 1820, TaxGroups: TG, TotalTax: 185, TotalNoTax: 1635, ReferenceNo: 0n, TransactionNo: 0n, TotalDiscount: 25,
    });
    expect(toBase64(b)).toBe(GO.pos);
  });

  it('encodes a refund with 64-bit coupon numbers like the Go library', () => {
    const b = encodePosCoupon({
      BusinessId: 810000000n, CouponId: 100000010000000042n, BranchId: 1n, Location: '', OperatorId: '', PosId: 1n, ApplicationId: 99n,
      VerificationNo: 'ABCD', Type: CouponType.Return, Time: T, Items: [], Payments: [], Total: 99, TaxGroups: [], TotalTax: 0, TotalNoTax: 0,
      ReferenceNo: 100000010000000041n, TransactionNo: 0n, TotalDiscount: 0,
    });
    expect(toBase64(b)).toBe(GO.ret);
    expect(fromBase64(GO.ret)).toEqual(b);
  });
});

describe('ATK signing', () => {
  beforeEach(async () => setKeyStore(memoryKeyStore(await sampleKeys())));

  it('signs the base64 text with ECDSA P-256 / SHA-256 in DER, which ATK verifies', async () => {
    const sig = await signText(GO.pos);
    expect(atkVerifies(GO.pos, sig)).toBe(true);
    expect(atkVerifies(GO.citizen, sig)).toBe(false);
  });

  it('turns raw r||s into DER with the sign-bit padding', () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x80;
    raw[32] = 0;
    raw[33] = 0x01;
    const der = rawSigToDer(raw);
    expect(der[0]).toBe(0x30);
    expect(Array.from(der.slice(2, 5))).toEqual([0x02, 33, 0x00]);
    expect(Array.from(der.slice(-33, -31))).toEqual([0x02, 31]);
  });

  it('builds a certificate request ATK can check', async () => {
    const csr = await makeCsr({ organization: '810000000', unit: '1', locality: '2', commonName: 'Market Ëmri' });
    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----\n/);
    const der = new Uint8Array(Buffer.from(csr.replace(/-----[^-]+-----|\n/g, ''), 'base64'));
    // CertificationRequest = SEQUENCE { info, algorithm, BIT STRING signature }
    const read = (b: Uint8Array, at: number) => {
      let n = b[at + 1];
      let h = 2;
      if (n & 0x80) {
        const k = n & 0x7f;
        n = 0;
        for (let i = 0; i < k; i++) n = (n << 8) | b[at + 2 + i];
        h += k;
      }
      return { start: at, body: at + h, end: at + h + n };
    };
    const outer = read(der, 0);
    const info = read(der, outer.body);
    const alg = read(der, info.end);
    const bits = read(der, alg.end);
    expect(bits.end).toBe(der.length);
    const spki = pubKey.export({ format: 'der', type: 'spki' });
    const expected = csrInfo({ organization: '810000000', unit: '1', locality: '2', commonName: 'Market Ëmri' }, new Uint8Array(spki));
    expect(der.slice(info.start, info.end)).toEqual(expected);
    const sig = der.slice(bits.body + 1, bits.end);
    expect(verify('sha256', der.slice(info.start, info.end), { key: pubKey, dsaEncoding: 'der' }, sig)).toBe(true);
  });
});

function memory() {
  let saved: string | null = null;
  return { load: async () => saved, save: async (j: string) => void (saved = j) };
}

async function kosovoStore() {
  const s = new Store(memory());
  await s.load();
  const boss = s.signIn('0000')!;
  s.saveSettings({ store_name: 'Market Test', business_no: '810000000', fiscal_provider: 'xk-atk', fiscal_config: { env: 'test', vat_no: '330000000', unit_no: '5130484', branch_id: '2', pos_id: '11', app_id: '1234', location: 'Prishtinë', cert: '-----BEGIN CERTIFICATE-----x', business_name: 'Market Test' } }, boss);
  const milk = s.saveProduct({ name: 'Qumësht 1L', barcode: '3800000000017', plu: null, category: 'Dairy', unit: 'pcs', price: 119, cost: 80, vat_rate: 8, stock: 10, min_stock: 0, active: true });
  const apples = s.saveProduct({ name: 'Mollë', barcode: null, plu: '42', category: 'Fruit', unit: 'kg', price: 149, cost: 90, vat_rate: 8, stock: 20, min_stock: 0, active: true });
  const cola = s.saveProduct({ name: 'Cola 0.5L', barcode: '3800000000024', plu: null, category: 'Drinks', unit: 'pcs', price: 100, cost: 50, vat_rate: 18, stock: 20, min_stock: 0, active: true });
  const shift = s.startShift(boss, 0);
  return { s, boss, milk, apples, cola, shift };
}

describe('Kosovo sale to ATK coupon', () => {
  it('maps a sale: ATK letters and units, price in 1/10000 €, net per tax group, discount', async () => {
    const { s, boss, milk, apples, cola, shift } = await kosovoStore();
    let c = addProduct(emptyCart(), milk, 2);
    c = addProduct(c, apples, 1.25);
    c = addProduct(c, cola, 1);
    c = setLineDiscount(c, c.lines.find((l) => l.product_id === cola.id)!.key, { kind: 'amount', value: 10 });
    const t = totals(c);
    const pay = settle(t.total, { cash: 1000, card: 0 });
    const sale = s.recordSale({ totals: t, payments: pay.payments, cash_given: 1000, change: pay.change, cashier: boss, shift_id: shift.id });
    const { pos, citizen } = buildCoupons({ sale, settings: s.settings, verificationNo: 'V'.repeat(16), referenceNo: null, itemType: () => 'AU' });
    expect(pos.CouponId).toBe(couponId(xkConfig(s.settings), sale.number));
    expect(pos.CouponId).toBe(2n * 10n ** 14n + 11n * 10n ** 10n + 1n);
    expect(pos.Items.map((i) => [i.TaxRate, i.Unit, i.Price, i.Quantity, i.Total]).sort((a, b) => Number(b[2]) - Number(a[2]))).toEqual([
      ['D', 'KGN', 14900, 1.25, 186],
      ['D', 'CP', 11900, 2, 238],
      ['E', 'CP', 10000, 1, 100],
    ]);
    expect(pos.TotalDiscount).toBe(10);
    expect(pos.Total).toBe(238 + 186 + 90);
    expect(pos.Items.reduce((a, i) => a + i.Total, 0) - pos.TotalDiscount).toBe(pos.Total);
    expect(pos.TotalNoTax + pos.TotalTax).toBe(pos.Total);
    expect(pos.TaxGroups.map((g) => g.TaxRate)).toEqual(['D', 'E']);
    expect(pos.Payments).toEqual([{ Type: PaymentType.Cash, Amount: pos.Total }]);
    // the QR coupon repeats the POS coupon's figures exactly
    for (const k of ['BusinessId', 'CouponId', 'BranchId', 'PosId', 'VerificationNo', 'Type', 'Time', 'Total', 'TaxGroups', 'TotalTax', 'TotalNoTax'] as const) expect(citizen[k]).toEqual(pos[k]);
  });
});

describe('Kosovo fiscal queue', () => {
  let sent: { url: string; body: { details: string; signature: string } }[] = [];
  let up = true;
  beforeEach(async () => {
    sent = [];
    up = true;
    setKeyStore(memoryKeyStore(await sampleKeys()));
    setFetch(async (url, init) => {
      if (!up) throw new TypeError('Failed to fetch');
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ message: 'ok', transaction_id: `tx-${sent.length}` }), { status: 200 });
    });
  });

  it('signs offline, prints the QR with OFFLINE, and sends the same signed coupon when back online', async () => {
    const { s, boss, milk, shift } = await kosovoStore();
    let online = false;
    const q = new FiscalQueue(s, () => online);
    const t = totals(addProduct(emptyCart(), milk, 1));
    const sale = s.recordSale({ totals: t, payments: [{ method: 'card', amount: t.total }], cash_given: 0, change: 0, cashier: boss, shift_id: shift.id });
    await q.settle(sale.id, 2000);
    let live = s.sale(sale.id)!;
    expect(live.fiscal.status).toBe('pending');
    expect(live.fiscal.offline).toBe(true);
    expect(live.fiscal.code).toMatch(/^[A-Z2-9]{16}$/);
    const [qrData, qrSig] = live.fiscal.qr!.split('|');
    expect(atkVerifies(qrData, qrSig)).toBe(true);
    expect(atkVerifies(live.fiscal.payload!.details, live.fiscal.payload!.signature)).toBe(true);
    expect(sent).toHaveLength(0);

    const text = receiptLines(live, s.settings).map((l) => (typeof l === 'object' && 'l' in l ? `${l.l} ${l.r ?? ''}` : '')).join('\n');
    expect(text).toContain('OFFLINE');
    expect(text).toContain('NUIKF: ' + live.fiscal.code);
    expect(text).toContain('5130484-810000000-11');
    expect(text).toContain('KUPON FISKAL DITOR NR. 0001');

    online = true;
    expect(await q.run()).toBe(1);
    live = s.sale(sale.id)!;
    expect(live.fiscal.status).toBe('done');
    expect(live.fiscal.transaction_id).toBe('tx-1');
    expect(sent[0].url).toBe('https://fiskalizimi-test.atk-ks.org/pos/coupon');
    expect(sent[0].body).toEqual(live.fiscal.payload);
  });

  it('sends a refund as a Return that points to the original coupon', async () => {
    const { s, boss, milk, shift } = await kosovoStore();
    const q = new FiscalQueue(s, () => true);
    const t = totals(addProduct(emptyCart(), milk, 2));
    const sale = s.recordSale({ totals: t, payments: [{ method: 'cash', amount: t.total }], cash_given: t.total, change: 0, cashier: boss, shift_id: shift.id });
    await q.settle(sale.id);
    const r = s.recordReturn({ original: s.sale(sale.id)!, lines: returnLines(sale.lines, [{ index: 0, qty: 1 }]), method: 'cash', cashier: boss, shiftId: shift.id, approvedBy: null, reason: 'Damaged', restock: false });
    await q.settle(r.id);
    expect(s.sale(r.id)!.fiscal.status).toBe('done');
    expect(sent).toHaveLength(2);
    const orig = BigInt(s.sale(sale.id)!.fiscal.coupon_id!);
    const { pos } = buildCoupons({ sale: s.sale(r.id)!, settings: s.settings, verificationNo: s.sale(r.id)!.fiscal.code!, referenceNo: orig, itemType: () => 'AU' });
    expect(pos.Type).toBe(CouponType.Return);
    expect(pos.Total).toBe(119);
    expect(pos.ReferenceNo).toBe(orig);
    expect(sent[1].body.details).toBe(toBase64(encodePosCoupon(pos)));
    expect(atkVerifies(sent[1].body.details, sent[1].body.signature)).toBe(true);
  });

  it('keeps a receipt ATK refused, with the reason, and retries it', async () => {
    const { s, boss, milk, shift } = await kosovoStore();
    setFetch(async () => new Response(JSON.stringify({ error: 'invalid signature' }), { status: 400 }));
    const q = new FiscalQueue(s, () => true);
    const t = totals(addProduct(emptyCart(), milk, 1));
    const sale = s.recordSale({ totals: t, payments: [{ method: 'cash', amount: t.total }], cash_given: t.total, change: 0, cashier: boss, shift_id: shift.id });
    await q.run();
    expect(s.sale(sale.id)!.fiscal).toMatchObject({ status: 'failed', error: 'ATK: invalid signature' });
    expect(s.pendingFiscal().map((x) => x.id)).toContain(sale.id);
  });

  it('will not sign until the till is connected to ATK', async () => {
    const { s, boss, milk, shift } = await kosovoStore();
    s.saveSettings({ fiscal_config: { ...s.settings.fiscal_config, cert: '' } }, boss);
    const q = new FiscalQueue(s, () => true);
    const t = totals(addProduct(emptyCart(), milk, 1));
    const sale = s.recordSale({ totals: t, payments: [{ method: 'cash', amount: t.total }], cash_given: t.total, change: 0, cashier: boss, shift_id: shift.id });
    await q.run();
    expect(s.sale(sale.id)!.fiscal.error).toMatch(/not connected to ATK/);
    expect(sent).toHaveLength(0);
  });

  it('prints the Z report as RAPORTI TATIMOR', async () => {
    const { s, shift } = await kosovoStore();
    const z = zReport(s.shiftSales(shift.id), { ...shift, counted_cash: 0 }, s.cashMoves(shift.id));
    const text = reportLines(z, s.settings, 'Z', 1).map((l) => (typeof l === 'object' && 'l' in l ? `${l.l} ${l.r ?? ''}` : '')).join('\n');
    expect(text).toContain('RAPORTI TATIMOR');
  });
});
