/**
 * Kosovo · ATK fiscal software (SEF), following github.com/fiskalizimi and
 * Administrative Instruction MF 01/2026.
 *
 * Each receipt is built and signed on the till the moment it is paid, so it
 * prints with its QR code and verification number even without internet.
 * The signed coupon is kept on the receipt and sent to ATK right away, or by
 * the queue as soon as the connection is back, always with the same bytes.
 */
import type { FiscalContext, FiscalModule } from '../index';
import { sendCoupon } from './api';
import { buildCoupons, guessItemType, missing, newVerificationNo, xkConfig } from './coupon';
import { signText } from './keys';
import { encodeCitizenCoupon, encodePosCoupon, toBase64 } from './pb';

export const kosovo: FiscalModule = {
  id: 'xk-atk',
  name: 'Kosovo · ATK fiscal software (SEF)',
  country: 'Kosovo',
  how: 'The till signs every receipt with its own ATK certificate and sends it to ATK straight away. Receipts made offline print with OFFLINE and their QR code, and are sent when the connection is back.',
  codeLabel: 'NUIKF',
  fields: [
    { key: 'vat_no', label: 'VAT number', placeholder: '330000000' },
    { key: 'fiscal_no', label: 'Fiscalization number (from EDI)', placeholder: '[FISCAL NO]' },
    { key: 'unit_no', label: 'Business unit number', placeholder: '5130484' },
    { key: 'branch_id', label: 'Branch ID', placeholder: '1' },
    { key: 'pos_id', label: 'POS ID', placeholder: '1' },
    { key: 'app_id', label: 'Application ID (from ATK)', placeholder: '[APPLICATION ID]' },
    { key: 'location', label: 'Town (sent with every receipt)', placeholder: 'Prishtinë' },
    { key: 'relay', label: 'Relay address (only if ATK blocks the browser)', placeholder: 'https://pos.example.com/atk' },
  ],
  test: false,
  isTest: (settings) => xkConfig(settings).env === 'test',

  async sign(sale, settings, ctx: FiscalContext) {
    const cfg = xkConfig(settings);
    const gaps = missing(cfg);
    if (gaps.length) throw new Error(`Missing in Settings: ${gaps.join(', ')}.`);
    if (!cfg.cert) throw new Error('This till is not connected to ATK yet (Settings › Tax and fiscal › Connect to ATK).');
    let referenceNo: bigint | null = null;
    if (sale.kind === 'return') {
      const original = sale.ref_sale_id ? ctx.sale(sale.ref_sale_id) : undefined;
      if (!original?.fiscal.coupon_id) throw new Error('The original receipt has no ATK coupon number yet.');
      referenceNo = BigInt(original.fiscal.coupon_id);
    }
    const verificationNo = sale.fiscal.code || newVerificationNo();
    const { pos, citizen } = buildCoupons({
      sale,
      settings,
      verificationNo,
      referenceNo,
      itemType: (id) => {
        const p = ctx.product(id);
        return p?.item_type || guessItemType(p?.category ?? '');
      },
    });
    const details = toBase64(encodePosCoupon(pos));
    const signature = await signText(details);
    const qrData = toBase64(encodeCitizenCoupon(citizen));
    const qrSig = await signText(qrData);
    return { code: verificationNo, qr: `${qrData}|${qrSig}`, payload: { details, signature }, coupon_id: String(pos.CouponId), error: null };
  },

  async send(sale, settings) {
    if (!sale.fiscal.payload) throw new Error('The receipt is not signed yet.');
    const r = await sendCoupon(xkConfig(settings), sale.fiscal.payload.details, sale.fiscal.payload.signature);
    return { status: 'done', transaction_id: r.transaction_id ?? null, sent_at: new Date().toISOString(), error: null };
  },
};
