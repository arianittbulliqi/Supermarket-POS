/**
 * Thermal receipts (58 or 80 mm) as plain text lines, so the same layout
 * shows on screen, prints from the browser and can later go to an ESC/POS
 * printer unchanged.
 */
import { amount, qtyLabel } from '../domain/money';
import type { ZReport } from '../domain/reports';
import { VAT_CODE, type Sale, type Settings } from '../domain/types';
import { fiscalModule, isTestMode } from '../fiscal';
import { sefId, xkConfig } from '../fiscal/xk/coupon';
import { qrSvg } from './qr';

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

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const dmy = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
};

/**
 * Kosovo fiscal receipt (e-kupon), in Albanian, laid out as ATK's examples in
 * the technical requirements (Shtojca F) with every item Article 7 of
 * Administrative Instruction MF 01/2026 asks for.
 */
function kosovoReceipt(sale: Sale, settings: Settings, copy: boolean): Line[] {
  const cfg = xkConfig(settings);
  const refund = sale.kind === 'return';
  const sign = refund ? -1 : 1;
  const f = sale.fiscal;
  const out: Line[] = [{ l: settings.store_name.toUpperCase(), bold: true, big: true, center: true }];
  out.push({ l: `TATIMPAGUESI: ${cfg.business_name || settings.store_name}`, center: true });
  out.push({ l: `EMRI I NJËSISË: ${settings.store_name}`, center: true });
  if (settings.address) out.push({ l: `ADRESA E NJËSISË: ${settings.address}`, center: true });
  if (cfg.location) out.push({ l: `VENDI: ${cfg.location}`, center: true });
  out.push({ l: `NF-NUI: ${cfg.nui}`, bold: true, center: true });
  if (cfg.vat_no) out.push({ l: `NUMRI I TVSH-SË: ${cfg.vat_no}`, bold: true, center: true });
  out.push('rule');
  out.push({ l: '', r: `EMRI I PUNËTORIT: ${sale.cashier_name} · ID ${sale.cashier_id.slice(-6).toUpperCase()}` });
  out.push({ l: refund ? 'KUPON FISKAL KTHIMI' : 'KUPON FISKAL', bold: true, big: true, center: true });
  if (copy) out.push({ l: 'KOPJE E KUPONIT', bold: true, center: true });
  if (isTestMode(fiscalModule(f.provider), settings)) out.push({ l: 'AMBIENTI TESTUES · JO FISKAL', bold: true, center: true });
  if (refund && sale.ref_number != null) out.push({ l: `KUPON FISKAL NR. ${pad(sale.ref_number, 10)}`, center: true });
  if (refund && sale.reason) out.push({ l: `ARSYEJA: ${sale.reason}`, center: true });
  out.push({ l: 'ARTIKULLI · SASIA X ÇMIMI', r: 'SHUMA' }, 'rule');
  for (const x of sale.lines) {
    const q = Math.abs(x.qty);
    const gross = Math.round(x.price * x.qty);
    out.push({ l: x.name });
    out.push({ l: `  ${x.unit === 'kg' ? q.toFixed(3) : q} X ${amount(x.price)}`, r: `${amount(gross)} ${VAT_CODE[x.vat_rate]}` });
    if (x.discount) out.push({ l: '  Ulje', r: amount(-sign * Math.abs(x.discount)) });
  }
  out.push('rule');
  if (sale.discount) {
    out.push({ l: 'NËNTOTALI', r: amount(sale.subtotal), bold: true });
    out.push({ l: 'ULJE', r: amount(-sign * Math.abs(sale.discount)) });
  }
  out.push({ l: refund ? 'TOTALI I KTHIMIT' : 'TOTALI PËR PAGESË', r: `${amount(sale.total)}€`, bold: true, big: true });
  out.push({ l: 'MËNYRA E PAGESËS' });
  for (const p of sale.payments) out.push({ l: p.method === 'cash' ? '  KESH' : '  KARTELË', r: amount(sign * p.amount) });
  if (sale.cash_given && sale.change) out.push({ l: '  KESH I DHËNË', r: amount(sale.cash_given) }, { l: '  KUSURI', r: amount(sale.change) });
  const vat = [...sale.vat].sort((a, b) => VAT_CODE[a.rate].localeCompare(VAT_CODE[b.rate]));
  for (const v of vat) out.push({ l: `TVSH ${VAT_CODE[v.rate]} ${v.rate}%`, r: `${amount(v.vat)}€` });
  out.push({ l: 'TOTALI PA TVSH', r: `${amount(vat.reduce((a, v) => a + v.net, 0))}€` });
  out.push({ l: '', r: `${refund ? 'ARTIKUJ TË KTHYER' : 'ARTIKUJ'} - ${sale.lines.length}` }, 'rule');
  out.push({ l: pad(sale.number, 10) });
  out.push({ l: 'DATA DHE ORA', r: dmy(sale.created_at) });
  out.push({ l: 'NR. IDENTIFIKUES I SEF', r: sefId(cfg) });
  if (f.code) out.push({ l: `NUIKF: ${f.code}`, bold: true });
  if (f.offline) out.push({ l: 'OFFLINE', bold: true, center: true });
  if (sale.daily_no) out.push({ l: `KUPON FISKAL DITOR NR. ${pad(sale.daily_no, 4)}`, center: true });
  if (f.qr) out.push({ qr: f.qr });
  else out.push({ l: f.error ? `Kuponi nuk u nënshkrua: ${f.error}` : 'Kuponi po nënshkruhet…', center: true });
  out.push({ l: 'RKS · MF', bold: true, big: true, center: true });
  out.push({ l: 'e-kupon', bold: true, center: true });
  if (settings.receipt_footer) out.push({ l: settings.receipt_footer, center: true });
  return out;
}

/** A customer receipt or refund receipt. */
export function receiptLines(sale: Sale, settings: Settings, copy = false): Line[] {
  if (sale.fiscal.provider === 'xk-atk' && sale.fiscal.status !== 'off') return kosovoReceipt(sale, settings, copy);
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
    if (isTestMode(mod, settings)) out.push({ l: 'TEST MODE · NOT REGISTERED', bold: true, center: true });
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
  if (kind === 'Z' && settings.fiscal_provider === 'xk-atk') {
    // Article 28: the daily Z report closes with the fiscal logo and RAPORTI TATIMOR in bold
    const cfg = xkConfig(settings);
    out.push('rule', { l: `NF-NUI: ${cfg.nui}` });
    if (cfg.vat_no) out.push({ l: `NUMRI I TVSH-SË: ${cfg.vat_no}` });
    out.push({ l: 'NR. IDENTIFIKUES I SEF', r: sefId(cfg) });
    out.push({ l: 'RKS · MF', bold: true, big: true, center: true }, { l: 'RAPORTI TATIMOR', bold: true, big: true, center: true });
  } else out.push('rule', { l: kind === 'X' ? 'Not a fiscal report' : 'Internal report', center: true });
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A printable page for the browser's print dialog (or kiosk printing). */
export function linesToHtml(lines: Line[], width: 58 | 80): string {
  const body = lines
    .map((x) => {
      if (x === 'rule') return '<hr/>';
      if ('qr' in x) return `<div class="qr">${qrSvg(x.qr)}</div>`;
      const cls = [x.bold && 'b', x.big && 'big', x.center && 'c'].filter(Boolean).join(' ');
      return x.r != null ? `<div class="l ${cls}"><span>${esc(x.l)}</span><span>${esc(x.r)}</span></div>` : `<div class="${cls}">${esc(x.l)}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${width}mm auto;margin:0}
body{width:${width}mm;margin:0;padding:4mm 3mm 8mm;box-sizing:border-box;font:600 11px/1.35 ui-monospace,Menlo,Consolas,'Courier New',monospace;color:#000}
.l{display:flex;justify-content:space-between;gap:1ch;white-space:pre}.l span:first-child{overflow:hidden}
.b{font-weight:800}.big{font-size:14px}.c{text-align:center}hr{border:0;border-top:1px dashed #000;margin:2mm 0}
.qr{margin:2mm auto;width:34mm}.qr svg{display:block;width:100%;height:auto}
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
