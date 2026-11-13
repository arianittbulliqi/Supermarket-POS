import { describe, expect, it } from 'vitest';
import { Store } from '../src/store/store';
import { addProduct, emptyCart, returnLines, setCartDiscount, totals } from '../src/domain/cart';
import { withCheckDigit } from '../src/domain/barcode';
import { settle } from '../src/domain/payment';
import { byProduct, lowStock, summary, zReport } from '../src/domain/reports';

function memory() {
  let saved: string | null = null;
  return { persist: { load: async () => saved, save: async (j: string) => void (saved = j) }, get: () => saved };
}

async function setup() {
  const m = memory();
  const s = new Store(m.persist);
  await s.load();
  const boss = s.signIn('0000')!;
  const milk = s.saveProduct({ name: 'Milk 1L', barcode: '3800000000017', plu: null, category: 'Dairy', unit: 'pcs', price: 119, cost: 80, vat_rate: 8, stock: 10, min_stock: 4, active: true });
  const apples = s.saveProduct({ name: 'Apples', barcode: null, plu: '42', category: 'Fruit', unit: 'kg', price: 149, cost: 90, vat_rate: 8, stock: 20, min_stock: 0, active: true });
  return { s, m, boss, milk, apples };
}

describe('store', () => {
  it('starts with one manager on PIN 0000 who must change it', async () => {
    const { s, boss } = await setup();
    expect(boss.role).toBe('manager');
    expect(boss.must_change_pin).toBe(true);
    s.updateUser(boss.id, {}, '4321');
    expect(s.signIn('0000')).toBeNull();
    expect(s.signIn('4321')?.must_change_pin).toBeUndefined();
  });

  it('refuses a PIN someone already has and keeps one manager', async () => {
    const { s, boss } = await setup();
    s.updateUser(boss.id, {}, '1111');
    expect(() => s.addUser({ name: 'Ana', role: 'cashier', active: true }, '1111')).toThrow(/already uses/);
    expect(() => s.updateUser(boss.id, { role: 'cashier' })).toThrow(/manager/);
  });

  it('refuses a barcode already on another product', async () => {
    const { s } = await setup();
    expect(() => s.saveProduct({ name: 'Other', barcode: '3800000000017', plu: null, category: '', unit: 'pcs', price: 1, cost: 0, vat_rate: 18, stock: 0, min_stock: 0, active: true })).toThrow(/already on Milk/);
  });

  it('finds products by barcode, PLU and scale label', async () => {
    const { s, milk, apples } = await setup();
    expect(s.lookup('3800000000017')?.product.id).toBe(milk.id);
    expect(s.lookup('42')?.product.id).toBe(apples.id);
    const hit = s.lookup(withCheckDigit('210004201250'))!;
    expect(hit.product.id).toBe(apples.id);
    expect(hit.qty).toBe(1.25);
    expect(s.lookup('999')).toBeNull();
    expect(s.search('mil').map((p) => p.name)).toEqual(['Milk 1L']);
  });

  it('records a sale with a receipt number and takes it off stock, then a return puts it back', async () => {
    const { s, m, boss, milk, apples } = await setup();
    const shift = s.startShift(boss, 5000);
    let c = addProduct(emptyCart(), milk, 3);
    c = addProduct(c, apples, 1.5);
    const t = totals(c);
    const pay = settle(t.total, { cash: 1000, card: 0 });
    const sale = s.recordSale({ totals: t, payments: pay.payments, cash_given: 1000, change: pay.change, cashier: boss, shift_id: shift.id });
    expect(sale.number).toBe(1);
    expect(sale.total).toBe(357 + 224);
    expect(s.product(milk.id)!.stock).toBe(7);
    expect(s.product(apples.id)!.stock).toBe(18.5);

    const back = returnLines(sale.lines, [{ index: sale.lines.findIndex((l) => l.product_id === milk.id), qty: 2 }]);
    const r = s.recordReturn({ original: sale, lines: back, method: 'cash', cashier: boss, shiftId: shift.id, approvedBy: null, reason: 'Damaged', restock: true });
    expect(r.number).toBe(2);
    expect(r.total).toBe(-238);
    expect(s.product(milk.id)!.stock).toBe(9);
    expect(s.returnable(sale)).toContain(1);
    expect(() => s.recordReturn({ original: sale, lines: returnLines(sale.lines, [{ index: 1, qty: 3 }]), method: 'cash', cashier: boss, shiftId: shift.id, approvedBy: null, reason: '', restock: true })).toThrow(/already returned/);

    const z = zReport(s.shiftSales(shift.id), { ...shift, counted_cash: 5000 + 581 - 238 }, s.cashMoves(shift.id));
    expect(z.summary.takings).toBe(581 - 238);
    expect(z.expected_cash).toBe(5000 + 581 - 238);
    expect(z.difference).toBe(0);

    // everything survives a reload
    await s.flush();
    const again = new Store(m.persist);
    await again.load();
    expect(again.sales).toHaveLength(2);
    expect(again.product(milk.id)!.stock).toBe(9);
  });

  it('refuses a payment that does not match', async () => {
    const { s, boss, milk } = await setup();
    const t = totals(addProduct(emptyCart(), milk));
    expect(() => s.recordSale({ totals: t, payments: [{ method: 'cash', amount: 100 }], cash_given: 100, change: 0, cashier: boss, shift_id: 'x' })).toThrow(/does not match/);
  });

  it('receives goods, updates cost, and counts stock', async () => {
    const { s, boss, milk } = await setup();
    s.receive([{ product_id: milk.id, qty: 24, unit_cost: 85 }], 'Vita', 'Invoice 77', boss);
    expect(s.product(milk.id)!.stock).toBe(34);
    expect(s.product(milk.id)!.cost).toBe(85);
    s.adjust(milk.id, 'change', -2, 'damaged', '', boss);
    s.adjust(milk.id, 'count', 30, 'count', 'Shelf count', boss);
    expect(s.product(milk.id)!.stock).toBe(30);
    expect(s.moves.filter((m) => m.product_id === milk.id).map((m) => m.reason)).toEqual(['count', 'receive', 'damaged', 'count']);
  });

  it('only supervisors and managers approve a discount', async () => {
    const { s } = await setup();
    s.addUser({ name: 'Ana', role: 'cashier', active: true }, '1234');
    s.addUser({ name: 'Bes', role: 'supervisor', active: true }, '5678');
    expect(s.approve('1234', 'discount')).toBeNull();
    expect(s.approve('5678', 'discount')?.name).toBe('Bes');
  });
});

describe('reports', () => {
  it('adds up takings, margin, best sellers and low stock', async () => {
    const { s, boss, milk, apples } = await setup();
    const shift = s.startShift(boss, 0);
    const c = setCartDiscount(addProduct(addProduct(emptyCart(), milk, 2), apples, 1), { kind: 'amount', value: 0 });
    const t = totals(c);
    s.recordSale({ totals: t, payments: [{ method: 'card', amount: t.total }], cash_given: 0, change: 0, cashier: boss, shift_id: shift.id });
    const sum = summary(s.sales);
    expect(sum.takings).toBe(238 + 149);
    expect(sum.card).toBe(387);
    expect(sum.receipts).toBe(1);
    const rows = byProduct(s.sales);
    expect(rows[0].name).toBe('Milk 1L');
    // milk: 238 gross at 8% → 220 net, cost 160 → margin 60
    expect(rows[0].margin).toBe(60);
    s.adjust(milk.id, 'count', 3, 'count', '', boss);
    expect(lowStock(s.products).map((p) => p.name)).toEqual(['Milk 1L']);
  });
});
