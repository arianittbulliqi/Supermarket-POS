/** Whole cents, formatted for people. Kept free of React so tests and receipts can use it. */

export const cents = (euros: number): number => Math.round(euros * 100);

/** "12.50" from 1250. Negative amounts keep their sign: "-3.00". */
export function amount(c: number): string {
  const sign = c < 0 ? '-' : '';
  const a = Math.abs(Math.round(c));
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** "€12.50" */
export const money = (c: number, symbol = '€'): string => (c < 0 ? `-${symbol}${amount(-c)}` : `${symbol}${amount(c)}`);

/**
 * Cents from what a person typed: "12", "12.5", "12,50", "€ 3". Null when it is
 * not an amount, so a typo never turns into a zero price.
 */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[€\s]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

/** Kilograms or pieces from what a person typed: "1,250" → 1.25. Null if not a number. */
export function parseQty(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{0,3})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 1000) / 1000;
}

/** "1.250 kg" or "3" */
export const qtyLabel = (qty: number, unit: 'pcs' | 'kg'): string => (unit === 'kg' ? `${qty.toFixed(3)} kg` : String(Math.round(qty * 1000) / 1000));
