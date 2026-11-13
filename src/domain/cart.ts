/**
 * The basket at the till, as pure functions: every screen and test goes
 * through these, so the total on screen, on the receipt and in the reports is
 * always the same number.
 */
import type { Cart, CartDiscount, CartLine, Product, SaleLine, VatLine, VatRate } from './types';

export const emptyCart = (): Cart => ({ lines: [], discount: null });

let seq = 0;
const lineKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Price × quantity, in cents, before any discount. */
export const lineGross = (l: Pick<CartLine, 'price' | 'qty'>): number => Math.round(l.price * l.qty);

/** After the line's own discount. Never below zero. */
export const lineAfterDiscount = (l: CartLine): number => Math.max(0, lineGross(l) - l.discount);

/**
 * Add a product. A piece item scanned again adds one to its line (unless that
 * line has its own discount, so the discount stays on what it was given for);
 * a weighed item always gets its own line, as each bag has its own weight.
 */
export function addProduct(cart: Cart, p: Product, qty = 1, label?: { cents: number }): Cart {
  // a price label (a pre-packed tray of cheese) is one line at the printed price
  if (label) {
    const kg = p.unit === 'kg' && p.price > 0 ? Math.round((label.cents / p.price) * 1000) / 1000 : 1;
    const line: CartLine = { key: lineKey(), product_id: p.id, name: p.name, barcode: p.barcode, unit: 'pcs', qty: 1, price: label.cents, cost: Math.round(p.cost * kg), vat_rate: p.vat_rate, discount: 0, stock_qty: kg };
    return { ...cart, lines: [line, ...cart.lines] };
  }
  const unitPrice = p.price;
  if (p.unit === 'pcs') {
    const i = cart.lines.findIndex((l) => l.product_id === p.id && l.discount === 0 && l.price === unitPrice);
    if (i >= 0) {
      const lines = cart.lines.slice();
      lines[i] = { ...lines[i], qty: lines[i].qty + qty };
      // the line just touched moves to the top, where the cashier is looking
      const [touched] = lines.splice(i, 1);
      return { ...cart, lines: [touched, ...lines] };
    }
  }
  const line: CartLine = {
    key: lineKey(),
    product_id: p.id,
    name: p.name,
    barcode: p.barcode,
    unit: p.unit,
    qty,
    price: unitPrice,
    cost: p.cost,
    vat_rate: p.vat_rate,
    discount: 0,
  };
  return { ...cart, lines: [line, ...cart.lines] };
}

/** A quantity of 0 or less removes the line. */
export function setQty(cart: Cart, key: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, key);
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.key === key ? { ...l, qty, discount: Math.min(l.discount, lineGross({ price: l.price, qty })) } : l)),
  };
}

export const removeLine = (cart: Cart, key: string): Cart => ({ ...cart, lines: cart.lines.filter((l) => l.key !== key) });

/** Discount on one line, as cents off or a percent. */
export function setLineDiscount(cart: Cart, key: string, d: CartDiscount): Cart {
  return {
    ...cart,
    lines: cart.lines.map((l) => {
      if (l.key !== key) return l;
      const gross = lineGross(l);
      const off = d == null ? 0 : d.kind === 'percent' ? Math.round((gross * clampPct(d.value)) / 100) : Math.min(Math.max(0, Math.round(d.value)), gross);
      return { ...l, discount: off };
    }),
  };
}

export const setCartDiscount = (cart: Cart, d: CartDiscount): Cart => ({ ...cart, discount: d });

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

/** The basket discount in cents, given what the lines come to after their own discounts. */
export function basketDiscount(d: CartDiscount, afterLines: number): number {
  if (!d) return 0;
  if (d.kind === 'percent') return Math.round((afterLines * clampPct(d.value)) / 100);
  return Math.min(Math.max(0, Math.round(d.value)), afterLines);
}

/**
 * Split `total` cents across parts in proportion to their weights, so the
 * pieces add up exactly (largest remainder). Used to share a basket discount
 * over the lines, which keeps the VAT on each rate correct.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1;
  return out;
}

/** VAT included in a gross amount: 18% of net is 18/118 of gross. Works on negative amounts (returns). */
export function vatOf(gross: number, rate: VatRate): number {
  const v = Math.round((Math.abs(gross) * rate) / (100 + rate));
  return gross < 0 ? -v : v;
}

/** One row per VAT rate used, highest rate first. */
export function vatBreakdown(lines: Pick<SaleLine, 'vat_rate' | 'total'>[]): VatLine[] {
  const by = new Map<VatRate, number>();
  for (const l of lines) by.set(l.vat_rate, (by.get(l.vat_rate) ?? 0) + l.total);
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => {
      const vat = vatOf(gross, rate);
      return { rate, gross, net: gross - vat, vat };
    });
}

export interface Totals {
  /** Before any discount. */
  subtotal: number;
  /** Line discounts plus the basket discount. */
  discount: number;
  total: number;
  vat: VatLine[];
  /** Pieces, plus one for each weighed line: what the customer sees as "items". */
  items: number;
  lines: SaleLine[];
}

/** Everything the till, the receipt and the sale record need. */
export function totals(cart: Cart): Totals {
  const after = cart.lines.map(lineAfterDiscount);
  const afterSum = after.reduce((a, b) => a + b, 0);
  const shares = allocate(basketDiscount(cart.discount, afterSum), after);
  const lines: SaleLine[] = cart.lines.map((l, i) => ({
    product_id: l.product_id,
    name: l.name,
    barcode: l.barcode,
    unit: l.unit,
    qty: l.qty,
    price: l.price,
    cost: l.cost,
    vat_rate: l.vat_rate,
    discount: lineGross(l) - after[i] + shares[i],
    total: after[i] - shares[i],
    ...(l.stock_qty != null ? { stock_qty: l.stock_qty } : {}),
  }));
  const subtotal = cart.lines.reduce((a, l) => a + lineGross(l), 0);
  const total = lines.reduce((a, l) => a + l.total, 0);
  return {
    subtotal,
    discount: subtotal - total,
    total,
    vat: vatBreakdown(lines),
    items: cart.lines.reduce((a, l) => a + (l.unit === 'kg' ? 1 : l.qty), 0),
    lines,
  };
}

/** The largest percent off any line or the basket has, for the approval check. */
export function maxDiscountPercent(cart: Cart): number {
  const t = totals(cart);
  if (t.subtotal <= 0) return 0;
  let max = 0;
  for (const l of t.lines) {
    const gross = lineGross(l);
    if (gross > 0) max = Math.max(max, (l.discount / gross) * 100);
  }
  return Math.round(max * 100) / 100;
}

export interface ReturnPick {
  /** Index into the original sale's lines. */
  index: number;
  qty: number;
}

/**
 * Lines for a refund: each picked line at the price the customer actually
 * paid (discounts included), negative, so totals and VAT subtract cleanly.
 * `already` is what earlier returns took back per line, so a line is never
 * refunded twice.
 */
export function returnLines(original: SaleLine[], picks: ReturnPick[], already: number[] = []): SaleLine[] {
  const out: SaleLine[] = [];
  for (const p of picks) {
    const l = original[p.index];
    if (!l || p.qty <= 0) continue;
    const left = Math.round((l.qty - (already[p.index] ?? 0)) * 1000) / 1000;
    const qty = Math.min(p.qty, left);
    if (qty <= 0) continue;
    // cumulative shares, so several partial returns of one line add up to
    // exactly what was paid for it, never a cent more
    const before = l.qty - left;
    const part = (c: number) => Math.round((c * (before + qty)) / l.qty) - Math.round((c * before) / l.qty);
    out.push({
      ...l,
      qty: -qty,
      discount: -part(l.discount),
      total: -part(l.total),
      ...(l.stock_qty != null ? { stock_qty: -Math.round(l.stock_qty * (qty / l.qty) * 1000) / 1000 } : {}),
    });
  }
  return out;
}

/** How much of each line of a sale earlier returns already took back. */
export function returnedSoFar(original: SaleLine[], returns: { lines: SaleLine[] }[]): number[] {
  const used = original.map(() => 0);
  for (const r of returns) {
    for (const rl of r.lines) {
      // match by product and unit price, filling the earliest line first
      let need = -rl.qty;
      for (let i = 0; i < original.length && need > 0; i++) {
        const o = original[i];
        if (o.product_id !== rl.product_id || o.price !== rl.price) continue;
        const take = Math.min(o.qty - used[i], need);
        if (take <= 0) continue;
        used[i] = Math.round((used[i] + take) * 1000) / 1000;
        need = Math.round((need - take) * 1000) / 1000;
      }
    }
  }
  return used;
}
