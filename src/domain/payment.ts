/** Taking the money: cash with change, card, or both. All amounts in cents. */
import type { Payment } from './types';

export interface Tender {
  /** Cash handed over (may be more than the total). */
  cash: number;
  /** Charged on the card terminal. */
  card: number;
}

export interface Settled {
  ok: boolean;
  /** Still to pay, when not ok. */
  due: number;
  change: number;
  payments: Payment[];
}

/**
 * Card is applied first (it is exact), then cash; anything over is change.
 * Change only ever comes out of cash: a card is never charged more than due.
 */
export function settle(total: number, t: Tender): Settled {
  const card = Math.max(0, Math.round(t.card));
  const cash = Math.max(0, Math.round(t.cash));
  if (card > total) return { ok: false, due: 0, change: 0, payments: [] };
  const cashApplied = Math.min(cash, total - card);
  const paid = card + cashApplied;
  const payments: Payment[] = [];
  if (cashApplied > 0) payments.push({ method: 'cash', amount: cashApplied });
  if (card > 0) payments.push({ method: 'card', amount: card });
  if (total === 0) return { ok: true, due: 0, change: cash, payments };
  return { ok: paid >= total, due: Math.max(0, total - paid), change: Math.max(0, cash - cashApplied), payments };
}

/**
 * Quick cash buttons: the exact amount, then the next round notes above it
 * (5, 10, 20, 50, 100, 200), at most four, none repeated.
 */
export function quickCash(total: number): number[] {
  const notes = [500, 1000, 2000, 5000, 10000, 20000];
  const out = [total];
  for (const n of notes) {
    const v = Math.ceil(total / n) * n;
    if (v > total && !out.includes(v)) out.push(v);
    if (out.length >= 4) break;
  }
  return out;
}
