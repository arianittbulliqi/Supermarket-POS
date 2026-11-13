import { describe, expect, it } from 'vitest';
import { checkDigit, isValidGtin, parseScan, withCheckDigit } from '../src/domain/barcode';
import { amount, money, parseMoney, parseQty } from '../src/domain/money';
import { quickCash, settle } from '../src/domain/payment';
import { can } from '../src/domain/permissions';
import { exportProducts, importProducts, parseCsv } from '../src/domain/csv';
import { sha256 } from '../src/domain/sha256';

const rules = { weight_prefixes: ['21', '22'], price_prefixes: ['20'] };

describe('barcodes', () => {
  it('checks EAN-13 and EAN-8 check digits', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true);
    expect(checkDigit('400638133393')).toBe(1);
  });
  it('reads weight and price labels from the scale', () => {
    const w = withCheckDigit('210004201250'); // PLU 42, 1250 g
    expect(parseScan(w, rules)).toEqual({ kind: 'weight', plu: '42', grams: 1250, code: w });
    const p = withCheckDigit('200004200399'); // PLU 42, €3.99
    expect(parseScan(p, rules)).toEqual({ kind: 'price', plu: '42', cents: 399, code: p });
    expect(parseScan(' 4006381333931 ', rules)).toEqual({ kind: 'code', code: '4006381333931' });
  });
});

describe('money', () => {
  it('formats and parses cents', () => {
    expect(amount(1250)).toBe('12.50');
    expect(money(-300)).toBe('-€3.00');
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('€ 3')).toBe(300);
    expect(parseMoney('abc')).toBeNull();
    expect(parseQty('1,250')).toBe(1.25);
  });
});

describe('payment', () => {
  it('gives change from cash only', () => {
    expect(settle(1250, { cash: 2000, card: 0 })).toEqual({ ok: true, due: 0, change: 750, payments: [{ method: 'cash', amount: 1250 }] });
    expect(settle(1250, { cash: 500, card: 750 })).toMatchObject({ ok: true, change: 0 });
    expect(settle(1250, { cash: 1000, card: 0 })).toMatchObject({ ok: false, due: 250 });
    expect(settle(1250, { cash: 0, card: 1300 }).ok).toBe(false);
  });
  it('suggests the exact amount and round notes', () => {
    expect(quickCash(1250)).toEqual([1250, 1500, 2000, 5000]);
    expect(quickCash(2000)).toEqual([2000, 5000, 10000, 20000]);
  });
});

describe('roles', () => {
  it('lets each role do its own work', () => {
    expect(can('cashier', 'sell')).toBe(true);
    expect(can('cashier', 'discount')).toBe(false);
    expect(can('supervisor', 'return')).toBe(true);
    expect(can('supervisor', 'products.edit')).toBe(false);
    expect(can('manager', 'users.manage')).toBe(true);
    expect(can(null, 'sell')).toBe(false);
  });
});

describe('csv', () => {
  it('reads quoted fields and either separator', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    expect(parseCsv('a;b\n1,5;2\n')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
  it('imports products and reports bad lines', () => {
    const r = importProducts('Emri;Barkodi;Cmimi;TVSH;Njesia;Stoku\nQumësht;3800000000017;1,19;8;;24\nMollë;;1.49;8;kg;10.5\nBad;;x;18;;\n');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ name: 'Qumësht', price: 119, vat_rate: 8, unit: 'pcs', stock: 24 });
    expect(r.rows[1]).toMatchObject({ unit: 'kg', stock: 10.5 });
    expect(r.errors[0]).toMatch(/Line 4/);
  });
  it('exports what it imports', () => {
    const r = importProducts('name,price\n"Bread, white",0.80\n');
    const csv = exportProducts(r.rows.map((x, i) => ({ ...x, id: String(i), active: true, updated_at: '' })));
    expect(importProducts(csv).rows[0]).toMatchObject({ name: 'Bread, white', price: 80 });
  });
});

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
