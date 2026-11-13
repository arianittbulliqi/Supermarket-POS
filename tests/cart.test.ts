import { describe, expect, it } from 'vitest';
import { addProduct, allocate, emptyCart, returnLines, returnedSoFar, setCartDiscount, setLineDiscount, setQty, totals, vatOf } from '../src/domain/cart';
import type { Product } from '../src/domain/types';

const P = (o: Partial<Product>): Product => ({ id: 'p1', name: 'Milk 1L', barcode: '3800000000017', plu: null, category: 'Dairy', unit: 'pcs', price: 119, cost: 80, vat_rate: 8, stock: 10, min_stock: 0, active: true, updated_at: '', ...o });

describe('cart', () => {
  it('scanning the same piece item twice adds to one line', () => {
    let c = addProduct(emptyCart(), P({}));
    c = addProduct(c, P({}));
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0].qty).toBe(2);
    expect(totals(c).total).toBe(238);
  });

  it('weighed items get a line each and round to the cent', () => {
    const apples = P({ id: 'a', name: 'Apples', unit: 'kg', price: 149 });
    let c = addProduct(emptyCart(), apples, 1.235);
    c = addProduct(c, apples, 0.5);
    expect(c.lines).toHaveLength(2);
    expect(totals(c).total).toBe(184 + 75); // 1.84015 → 184, 0.745 → 75
    expect(totals(c).items).toBe(2);
  });

  it('a price label is one line at the printed price and takes its weight off stock', () => {
    const cheese = P({ id: 'c', name: 'Cheese', unit: 'kg', price: 800, cost: 500 });
    const c = addProduct(emptyCart(), cheese, 1, { cents: 412 });
    const t = totals(c);
    expect(t.total).toBe(412);
    expect(t.lines[0].stock_qty).toBe(0.515);
  });

  it('quantity 0 removes the line', () => {
    const c = addProduct(emptyCart(), P({}));
    expect(setQty(c, c.lines[0].key, 0).lines).toHaveLength(0);
  });

  it('VAT is taken out of the gross price per rate', () => {
    expect(vatOf(118, 18)).toBe(18);
    expect(vatOf(108, 8)).toBe(8);
    expect(vatOf(-118, 18)).toBe(-18);
    let c = addProduct(emptyCart(), P({ price: 118, vat_rate: 18 }));
    c = addProduct(c, P({ id: 'b', price: 108, vat_rate: 8 }));
    const t = totals(c);
    expect(t.vat).toEqual([
      { rate: 18, gross: 118, net: 100, vat: 18 },
      { rate: 8, gross: 108, net: 100, vat: 8 },
    ]);
  });

  it('a basket discount is shared over the lines and adds up exactly', () => {
    let c = addProduct(emptyCart(), P({ price: 100 }));
    c = addProduct(c, P({ id: 'b', price: 100 }));
    c = addProduct(c, P({ id: 'c', price: 100 }));
    c = setCartDiscount(c, { kind: 'amount', value: 100 });
    const t = totals(c);
    expect(t.total).toBe(200);
    expect(t.discount).toBe(100);
    expect(t.lines.reduce((a, l) => a + l.total, 0)).toBe(200);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('line and percent discounts stack, never below zero', () => {
    let c = addProduct(emptyCart(), P({ price: 1000 }));
    c = setLineDiscount(c, c.lines[0].key, { kind: 'percent', value: 10 });
    c = setCartDiscount(c, { kind: 'percent', value: 50 });
    expect(totals(c).total).toBe(450);
    c = setLineDiscount(c, c.lines[0].key, { kind: 'amount', value: 5000 });
    expect(totals(c).total).toBe(0);
  });
});

describe('returns', () => {
  it('refunds what was paid, and partial returns never add up to more', () => {
    let c = addProduct(emptyCart(), P({ price: 5 }), 2);
    c = setCartDiscount(c, { kind: 'amount', value: 0 });
    const sold = totals(c).lines;
    const r1 = returnLines(sold, [{ index: 0, qty: 1 }]);
    const r2 = returnLines(sold, [{ index: 0, qty: 1 }], returnedSoFar(sold, [{ lines: r1 }]));
    expect(-(r1[0].total + r2[0].total)).toBe(10);
    const r3 = returnLines(sold, [{ index: 0, qty: 1 }], returnedSoFar(sold, [{ lines: r1 }, { lines: r2 }]));
    expect(r3).toHaveLength(0);
  });

  it('includes the discount the customer had', () => {
    let c = addProduct(emptyCart(), P({ price: 1000 }), 2);
    c = setCartDiscount(c, { kind: 'percent', value: 10 });
    const r = returnLines(totals(c).lines, [{ index: 0, qty: 1 }]);
    expect(r[0].total).toBe(-900);
  });
});
