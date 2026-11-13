/**
 * Thermal receipts (58 or 80 mm) as plain text lines, so the same layout
 * shows on screen, prints from the browser and can later go to an ESC/POS
 * printer unchanged.
 */
import { amount, qtyLabel } from '../domain/money';
import type { ZReport } from '../domain/reports';
import { VAT_CODE, type Sale, type Settings } from '../domain/types';
import { fiscalModule } from '../fiscal';

export type Line = { l: string; r?: string; bold?: boolean; big?: boolean; center?: boolean } | 'rule' | { qr: string };

const date = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const receiptNo = (s: Pick<Sale, 'number' | 'till_no'>, settings: Settings) => `${s.till_no ?? settings.till_no}-${String(s.number).padStart(4, '0')}`;

function header(settings: Settings): Line[] {
  const out: Line[] = [{ l: settings.store_name.toUpperCase(), bold: true, big: true, center: true }];
  const sub = [settings.address, settings.business_no ? `Tax no. ${settings.business_no}` : ''].filter(Boolean).join(' · ');
  if (sub) out.push({ l: sub, center: true });
  out.push('rule');
  return out;
}

/** A customer receipt or refund receipt. */
export function receiptLines(sale: Sale, settings: Settings, copy = false): Line[] {
  const out = header(settings);
  const refund = sale.kind === 'return';
  if (refund) out.push({ l: 'REFUND RECEIPT', bold: true, center: true });
  if (copy) out.push({ l: 'COPY', bold: true, center: true });
  out.push({ l: `Receipt ${receiptNo(sale, settings)}  Till ${sale.till_no ?? settings.till_no}`, r: date(sale.created_at) });
  out.push({ l: `Cashier: ${sale.cashier_name}` });
  if (refund && sale.ref_number != null) out.push({ l: `For receipt ${sale.till_no ?? settings.till_no}-${String(sale.ref_number).padStart(4, '0')}` });
  out.push('rule');
  for (const x of sale.lines) {
    const code = VAT_CODE[x.vat_rate];
    const gross = Math.round(x.price * x.qty);
    if (x.unit === 'kg') out.push({ l: x.name }, { l: `  ${qtyLabel(Math.abs(x.qty), 'kg')} x ${amount(x.price)}`, r: `${amount(gross)} ${code}` });
    else if (Math.abs(x.qty) !== 1) out.push({ l: x.name }, { l: `  ${x.qty} x ${amount(x.price)}`, r: `${amount(gross)} ${code}` });
    else out.push({ l: x.name, r: `${amount(gross)} ${code}` });
    if (x.discount) out.push({ l: '  Discount', r: amount(-x.discount) });
  }
  out.push('rule');
  out.push({ l: `TOTAL ${settings.currency === '€' ? 'EUR' : settings.currency}`, r: amount(sale.total), bold: true, big: true });
  for (const p of sale.payments) out.push({ l: p.method === 'cash' ? 'Cash' : 'Card', r: amount(p.method === 'cash' && sale.cash_given ? sale.cash_given : p.amount) });
  if (sale.change) out.push({ l: 'Change', r: amount(sale.change) });
  out.push('rule');
  out.push({ l: 'VAT       Net     VAT    Gross' });
  for (const v of sale.vat) out.push({ l: `${VAT_CODE[v.rate]} ${String(v.rate).padStart(2)}%  ${amount(v.net).padStart(8)} ${amount(v.vat).padStart(7)} ${amount(v.gross).padStart(8)}` });
  out.push('rule');
  const mod = fiscalModule(sale.fiscal.provider);
  if (sale.fiscal.status === 'off') out.push({ l: 'NOT A FISCAL RECEIPT', bold: true, center: true });
  else {
    if (mod.test) out.push({ l: 'TEST MODE · NOT REGISTERED', bold: true, center: true });
    if (sale.fiscal.code) out.push({ l: `${mod.codeLabel} ${sale.fiscal.code}`, center: true });
    else out.push({ l: 'Fiscal code follows when online', center: true });
    if (sale.fiscal.qr) out.push({ qr: sale.fiscal.qr });
  }
  if (!refund && settings.returns_days > 0) out.push({ l: `Returns within ${settings.returns_days} days with this receipt`, center: true });
  if (settings.receipt_footer) out.push({ l: settings.receipt_footer, center: true });
  return out;
}

/** X report (shift so far) or Z report (shift closed). */
export function reportLines(z: ZReport, settings: Settings, kind: 'X' | 'Z', zNumber?: number | null): Line[] {
  const out = header(settings);
  const s = z.summary;
  out.push({ l: kind === 'Z' ? `Z REPORT ${zNumber != null ? '#' + String(zNumber).padStart(4, '0') : ''}` : 'X REPORT · SHIFT SO FAR', bold: true, center: true });
  out.push({ l: `Till ${settings.till_no} · ${z.cashier ?? ''}` });
  out.push({ l: 'From', r: date(z.from) }, { l: 'To', r: date(z.to) });
  if (z.first_number != null) out.push({ l: 'Receipts', r: `${z.first_number} to ${z.last_number}` });
  out.push('rule', { l: 'SALES', bold: true });
  out.push({ l: `Gross sales · ${s.receipts}`, r: amount(s.gross) });
  out.push({ l: `Discounts · ${s.discounted}`, r: amount(-s.discounts) });
  out.push({ l: `Returns · ${s.returns}`, r: amount(-s.refunded) });
  out.push({ l: `Voided lines · ${z.voids}`, r: amount(z.voids_value) });
  out.push({ l: 'Net sales', r: amount(s.takings), bold: true });
  out.push('rule', { l: 'VAT', bold: true });
  for (const v of z.vat) out.push({ l: `${VAT_CODE[v.rate]} ${v.rate}% · gross ${amount(v.gross)}`, r: amount(v.vat) });
  out.push('rule', { l: 'PAYMENTS', bold: true });
  out.push({ l: 'Cash', r: amount(s.cash) }, { l: 'Card', r: amount(s.card) });
  out.push('rule', { l: 'CASH DRAWER', bold: true });
  out.push({ l: 'Opening float', r: amount(z.opening_cash) });
  out.push({ l: 'Cash sales less refunds', r: amount(s.cash) });
  out.push({ l: `Cash in · ${z.cash_in_count}`, r: amount(z.cash_in) });
  out.push({ l: `Cash out · ${z.cash_out_count}`, r: amount(-z.cash_out) });
  out.push({ l: 'Should be in drawer', r: amount(z.expected_cash), bold: true });
  if (z.counted_cash != null) {
    out.push({ l: 'Counted', r: amount(z.counted_cash) });
    out.push({ l: 'Difference', r: amount(z.difference ?? 0), bold: true });
  }
  out.push('rule', { l: 'Internal report', center: true });
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A printable page for the browser's print dialog (or kiosk printing). */
export function linesToHtml(lines: Line[], width: 58 | 80): string {
  const body = lines
    .map((x) => {
      if (x === 'rule') return '<hr/>';
      if ('qr' in x) return `<div class="c qr">Scan to check<br/>${esc(x.qr.slice(0, 48))}…</div>`;
      const cls = [x.bold && 'b', x.big && 'big', x.center && 'c'].filter(Boolean).join(' ');
      return x.r != null ? `<div class="l ${cls}"><span>${esc(x.l)}</span><span>${esc(x.r)}</span></div>` : `<div class="${cls}">${esc(x.l)}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${width}mm auto;margin:0}
body{width:${width}mm;margin:0;padding:4mm 3mm 8mm;box-sizing:border-box;font:600 11px/1.35 ui-monospace,Menlo,Consolas,'Courier New',monospace;color:#000}
.l{display:flex;justify-content:space-between;gap:1ch;white-space:pre}.l span:first-child{overflow:hidden}
.b{font-weight:800}.big{font-size:14px}.c{text-align:center}hr{border:0;border-top:1px dashed #000;margin:2mm 0}
.qr{border:2px solid #000;margin:2mm auto;padding:2mm;width:70%;font-size:9px;word-break:break-all}
</style></head><body>${body}</body></html>`;
}

/** Print through a hidden frame, so the till screen stays as it is. */
export function printLines(lines: Line[], width: 58 | 80): void {
  if (typeof document === 'undefined') return;
  const f = document.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const doc = f.contentWindow?.document;
  if (!doc) return void f.remove();
  doc.open();
  doc.write(linesToHtml(lines, width));
  doc.close();
  setTimeout(() => {
    try {
      f.contentWindow?.focus();
      f.contentWindow?.print();
    } finally {
      setTimeout(() => f.remove(), 1500);
    }
  }, 200);
}
