/**
 * Report maths, from the sales list alone. Returns are sales with negative
 * lines, so adding everything up gives the true takings.
 */
import { vatOf } from './cart';
import type { CashMove, Product, Sale, Shift, VatLine, VatRate } from './types';

export type Period = 'day' | 'week' | 'month';

/** Start of the day, the week (Monday) or the month that `d` falls in, local time. */
export function periodStart(period: Period, d = new Date()): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'week') s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  if (period === 'month') s.setDate(1);
  return s;
}

export function inRange(sales: Sale[], from: Date, to: Date = new Date(8.64e15)): Sale[] {
  const a = from.getTime();
  const b = to.getTime();
  return sales.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= a && t < b;
  });
}

export interface Summary {
  /** Sales before discounts and returns, in cents. */
  gross: number;
  /** Receipts that had a discount. */
  discounted: number;
  /** What customers paid, less refunds, in cents. */
  takings: number;
  net: number;
  vat: number;
  /** Receipts (sales only, not returns). */
  receipts: number;
  returns: number;
  refunded: number;
  discounts: number;
  /** Average basket of the sales, in cents. */
  basket: number;
  /** Takings without VAT, less the cost of the goods sold. */
  margin: number;
  cash: number;
  card: number;
}

const net = (gross: number, rate: VatRate) => gross - vatOf(gross, rate);

export function summary(sales: Sale[]): Summary {
  let gross = 0, discounted = 0, takings = 0, vat = 0, receipts = 0, returns = 0, refunded = 0, discounts = 0, sold = 0, margin = 0, cash = 0, card = 0;
  for (const s of sales) {
    takings += s.total;
    if (s.kind === 'sale') {
      gross += s.subtotal;
      if (s.discount > 0) discounted++;
    }
    vat += s.vat.reduce((a, v) => a + v.vat, 0);
    discounts += s.kind === 'sale' ? s.discount : 0;
    if (s.kind === 'sale') {
      receipts++;
      sold += s.total;
    } else {
      returns++;
      refunded += -s.total;
    }
    for (const l of s.lines) margin += net(l.total, l.vat_rate) - Math.round(l.cost * l.qty);
    for (const p of s.payments) {
      if (p.method === 'cash') cash += p.amount;
      else card += p.amount;
    }
  }
  return { gross, discounted, takings, net: takings - vat, vat, receipts, returns, refunded, discounts, basket: receipts ? Math.round(sold / receipts) : 0, margin, cash, card };
}

export interface Bucket {
  label: string;
  start: Date;
  value: number;
}

/** Takings per hour (day view), per day (week and month views). */
export function buckets(sales: Sale[], period: Period, now = new Date()): Bucket[] {
  const start = periodStart(period, now);
  const out: Bucket[] = [];
  if (period === 'day') {
    for (let h = 0; h < 24; h++) out.push({ label: String(h).padStart(2, '0'), start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), h), value: 0 });
    for (const s of sales) {
      const d = new Date(s.created_at);
      if (d >= start) out[d.getHours()].value += s.total;
    }
    // trim the quiet hours at both ends, keeping 8:00-20:00 at least
    let a = out.findIndex((b) => b.value !== 0);
    let b = 23 - [...out].reverse().findIndex((x) => x.value !== 0);
    if (a < 0) [a, b] = [8, 20];
    return out.slice(Math.min(a, 8), Math.max(b, 20) + 1);
  }
  const days = period === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ label: period === 'week' ? WD[i] : String(d.getDate()), start: d, value: 0 });
  }
  for (const s of sales) {
    const d = new Date(s.created_at);
    const i = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 864e5 + 0.5);
    if (i >= 0 && i < out.length) out[i].value += s.total;
  }
  return out;
}

export interface ProductRow {
  product_id: string;
  name: string;
  unit: 'pcs' | 'kg';
  qty: number;
  /** Gross takings for this product, in cents. */
  revenue: number;
  /** Net of VAT, less cost. */
  margin: number;
  /** Margin as a share of net takings, 0..1. */
  marginRate: number;
}

/** Per product, best sellers first (by takings). Returns count against the product. */
export function byProduct(sales: Sale[]): ProductRow[] {
  const m = new Map<string, ProductRow & { netRev: number }>();
  for (const s of sales)
    for (const l of s.lines) {
      const r = m.get(l.product_id) ?? { product_id: l.product_id, name: l.name, unit: l.unit, qty: 0, revenue: 0, margin: 0, marginRate: 0, netRev: 0 };
      const n = net(l.total, l.vat_rate);
      r.qty = Math.round((r.qty + l.qty) * 1000) / 1000;
      r.revenue += l.total;
      r.netRev += n;
      r.margin += n - Math.round(l.cost * l.qty);
      m.set(l.product_id, r);
    }
  return [...m.values()]
    .map(({ netRev, ...r }) => ({ ...r, marginRate: netRev > 0 ? r.margin / netRev : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ZReport {
  from: string;
  to: string;
  cashier: string | null;
  summary: Summary;
  vat: VatLine[];
  opening_cash: number;
  cash_in: number;
  cash_in_count: number;
  cash_out: number;
  cash_out_count: number;
  voids: number;
  voids_value: number;
  /** Opening cash, plus cash taken and cash put in, less refunds and cash taken out. */
  expected_cash: number;
  counted_cash: number | null;
  /** counted - expected; negative means the drawer is short. */
  difference: number | null;
  first_number: number | null;
  last_number: number | null;
}

type ShiftLike = Pick<Shift, 'opened_at' | 'closed_at' | 'opening_cash' | 'counted_cash' | 'cashier_name'> & Partial<Pick<Shift, 'voids' | 'voids_value'>>;

/** The end-of-shift report (or, for an open shift, the X report): totals, VAT per rate, payments and the cash check. */
export function zReport(sales: Sale[], shift: ShiftLike | null, cashMoves: CashMove[] = [], now = new Date(), counted?: number | null): ZReport {
  const sum = summary(sales);
  const vat = new Map<VatRate, VatLine>();
  for (const s of sales)
    for (const v of s.vat) {
      const r = vat.get(v.rate) ?? { rate: v.rate, gross: 0, net: 0, vat: 0 };
      r.gross += v.gross;
      r.net += v.net;
      r.vat += v.vat;
      vat.set(v.rate, r);
    }
  const ins = cashMoves.filter((m) => m.kind === 'in');
  const outs = cashMoves.filter((m) => m.kind === 'out');
  const cashIn = ins.reduce((a, m) => a + m.amount, 0);
  const cashOut = outs.reduce((a, m) => a + m.amount, 0);
  const opening = shift?.opening_cash ?? 0;
  const expected = opening + sum.cash + cashIn - cashOut;
  const c = counted !== undefined ? counted : shift?.counted_cash ?? null;
  const numbers = sales.map((s) => s.number);
  return {
    from: shift?.opened_at ?? (sales[0]?.created_at ?? now.toISOString()),
    to: shift?.closed_at ?? now.toISOString(),
    cashier: shift?.cashier_name ?? null,
    summary: sum,
    vat: [...vat.values()].sort((a, b) => b.rate - a.rate),
    opening_cash: opening,
    cash_in: cashIn,
    cash_in_count: ins.length,
    cash_out: cashOut,
    cash_out_count: outs.length,
    voids: shift?.voids ?? 0,
    voids_value: shift?.voids_value ?? 0,
    expected_cash: expected,
    counted_cash: c,
    difference: c == null ? null : c - expected,
    first_number: numbers.length ? Math.min(...numbers) : null,
    last_number: numbers.length ? Math.max(...numbers) : null,
  };
}

/** Sales per category with margin, biggest first. */
export function byCategory(sales: Sale[], products: Product[]): { category: string; revenue: number; margin: number; marginRate: number }[] {
  const cat = new Map(products.map((p) => [p.id, p.category]));
  const m = new Map<string, { revenue: number; net: number; margin: number }>();
  for (const s of sales)
    for (const l of s.lines) {
      const k = cat.get(l.product_id) ?? 'Other';
      const r = m.get(k) ?? { revenue: 0, net: 0, margin: 0 };
      const n = net(l.total, l.vat_rate);
      r.revenue += l.total;
      r.net += n;
      r.margin += n - Math.round(l.cost * l.qty);
      m.set(k, r);
    }
  return [...m.entries()].map(([category, r]) => ({ category, revenue: r.revenue, margin: r.margin, marginRate: r.net > 0 ? r.margin / r.net : 0 })).sort((a, b) => b.revenue - a.revenue);
}

/** Sales per cashier. */
export function byCashier(sales: Sale[]): { name: string; receipts: number; takings: number; returns: number }[] {
  const m = new Map<string, { name: string; receipts: number; takings: number; returns: number }>();
  for (const s of sales) {
    const r = m.get(s.cashier_id) ?? { name: s.cashier_name, receipts: 0, takings: 0, returns: 0 };
    r.takings += s.total;
    if (s.kind === 'sale') r.receipts++;
    else r.returns++;
    m.set(s.cashier_id, r);
  }
  return [...m.values()].sort((a, b) => b.takings - a.takings);
}

/** Products at or under their alert level, emptiest first. */
export function lowStock(products: Product[]): Product[] {
  return products
    .filter((p) => p.active && p.min_stock > 0 && p.stock <= p.min_stock)
    .sort((a, b) => a.stock / a.min_stock - b.stock / b.min_stock);
}

/** Stock value at cost, in cents (pieces and kilos on hand above zero). */
export const stockValue = (products: Product[]): number =>
  products.reduce((a, p) => a + (p.active && p.stock > 0 ? Math.round(p.cost * p.stock) : 0), 0);
