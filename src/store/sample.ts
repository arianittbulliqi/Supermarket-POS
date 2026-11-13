/**
 * A sample grocery store, so a new install can be tried at once: about 40
 * products (packed, loose and deli), seven suppliers, four staff and two
 * weeks of sales for the reports. Loaded from Settings › Import and export;
 * it never loads on its own.
 */
import { addProduct, emptyCart, setLineDiscount, totals } from '../domain/cart';
import { withCheckDigit } from '../domain/barcode';
import { settle } from '../domain/payment';
import type { Product, PublicUser, VatRate } from '../domain/types';
import type { Store } from './store';

type P = [name: string, cat: string, price: number, cost: number, vat: VatRate, stock: number, min: number, unit?: 'kg', plu?: string, quick?: boolean, sup?: number];

const PRODUCTS: P[] = [
  ['Whole milk 1 L', 'Dairy', 99, 68, 8, 9, 24, undefined, undefined, false, 0],
  ['Greek yogurt 400 g', 'Dairy', 180, 122, 8, 6, 12, undefined, undefined, false, 0],
  ['Natural yogurt 1 kg', 'Dairy', 210, 150, 8, 24, 10, undefined, undefined, false, 0],
  ['Butter 250 g', 'Dairy', 299, 195, 8, 14, 8, undefined, undefined, false, 0],
  ['White cheese 400 g', 'Dairy', 449, 310, 8, 11, 6, undefined, undefined, false, 0],
  ['Free-range eggs, 10 pack', 'Eggs', 249, 171, 8, 4, 10, undefined, undefined, false, 0],
  ['Sourdough bread 500 g', 'Bakery', 180, 95, 8, 18, 10, undefined, undefined, true, 2],
  ['White loaf 600 g', 'Bakery', 90, 48, 8, 22, 10, undefined, undefined, true, 2],
  ['Croissant', 'Bakery', 60, 28, 8, 30, 12, undefined, undefined, true, 2],
  ['Burek with cheese', 'Bakery', 120, 55, 8, 16, 8, undefined, undefined, true, 2],
  ['Extra virgin olive oil 750 ml', 'Oils and vinegar', 790, 560, 8, 24, 12, undefined, undefined, false, 3],
  ['Sunflower oil 1 L', 'Oils and vinegar', 219, 160, 8, 30, 12, undefined, undefined, false, 3],
  ['Pasta penne 500 g', 'Dry goods', 95, 58, 8, 64, 20, undefined, undefined, false, 3],
  ['Rice basmati 1 kg', 'Dry goods', 289, 190, 8, 18, 10, undefined, undefined, false, 3],
  ['Flour type 400, 1 kg', 'Dry goods', 79, 52, 8, 40, 15, undefined, undefined, false, 3],
  ['Sugar 1 kg', 'Dry goods', 109, 80, 8, 35, 15, undefined, undefined, false, 3],
  ['Tomato passata 700 g', 'Dry goods', 135, 85, 8, 26, 10, undefined, undefined, false, 3],
  ['Turkish coffee 200 g', 'Coffee and tea', 349, 240, 18, 20, 8, undefined, undefined, false, 3],
  ['Mineral water 6 × 1.5 L', 'Drinks', 270, 175, 18, 36, 20, undefined, undefined, false, 4],
  ['Sparkling water 0.5 L', 'Drinks', 45, 25, 18, 60, 24, undefined, undefined, false, 4],
  ['Orange juice 1 L', 'Drinks', 189, 120, 18, 22, 10, undefined, undefined, false, 4],
  ['Cola 2 L', 'Drinks', 199, 125, 18, 28, 12, undefined, undefined, false, 4],
  ['Lager beer 0.5 L', 'Drinks', 99, 60, 18, 72, 24, undefined, undefined, false, 4],
  ['Washing-up liquid 900 ml', 'Household', 235, 150, 18, 0, 6, undefined, undefined, false, 5],
  ['Kitchen towel, 2 rolls', 'Household', 199, 120, 18, 0, 8, undefined, undefined, false, 5],
  ['Laundry powder 3 kg', 'Household', 899, 610, 18, 9, 4, undefined, undefined, false, 5],
  ['Toothpaste 75 ml', 'Personal care', 189, 110, 18, 15, 6, undefined, undefined, false, 5],
  ['Dark chocolate 100 g', 'Snacks', 149, 92, 18, 33, 12, undefined, undefined, false, 3],
  ['Salted crisps 150 g', 'Snacks', 169, 98, 18, 25, 10, undefined, undefined, false, 3],
  ['Bananas', 'Fruit and veg', 129, 80, 8, 42.6, 10, 'kg', '4011', true, 1],
  ['Apples', 'Fruit and veg', 119, 70, 8, 55, 15, 'kg', '4131', true, 1],
  ['Tomatoes', 'Fruit and veg', 149, 90, 8, 31, 10, 'kg', '4664', true, 1],
  ['Potatoes', 'Fruit and veg', 69, 38, 8, 120, 30, 'kg', '4072', true, 1],
  ['Onions', 'Fruit and veg', 79, 42, 8, 64, 20, 'kg', '4093', true, 1],
  ['Lemons', 'Fruit and veg', 220, 140, 8, 11.2, 5, 'kg', '4053', true, 1],
  ['Peppers', 'Fruit and veg', 240, 150, 8, 18, 6, 'kg', '4065', true, 1],
  ['Carrots', 'Fruit and veg', 99, 55, 8, 26, 8, 'kg', '4562', true, 1],
  ['Cucumbers', 'Fruit and veg', 45, 22, 8, 40, 15, undefined, '4062', true, 1],
  ['Chicken breast', 'Meat', 690, 480, 8, 8.4, 5, 'kg', '42', false, 6],
  ['Minced beef', 'Meat', 990, 720, 8, 6.2, 4, 'kg', '43', false, 6],
  ['Smoked ham (deli)', 'Deli', 1290, 880, 8, 3.5, 2, 'kg', '44', false, 6],
];

const SUPPLIERS = [
  ['Dairy wholesaler', 'Orders desk', 'Mon, Wed, Fri', 1],
  ['Fruit and veg wholesaler', 'Sales rep', 'Every day', 0],
  ['Local bakery', 'Owner', 'Every day 06:00', 0],
  ['Dry goods distributor', 'Orders desk', 'Tuesday', 3],
  ['Drinks distributor', 'Sales rep', 'Tue, Thu', 2],
  ['Household goods distributor', 'Orders desk', 'Every 2nd Monday', 5],
  ['Meat supplier', 'Sales rep', 'Tue, Wed, Sat', 1],
] as const;

const STAFF = [
  ['Elira', 'cashier', '1111'],
  ['Fatos', 'cashier', '2222'],
  ['Arben', 'supervisor', '5555'],
] as const;

/** Sample PINs, shown in Settings next to the button that loads them. */
export const SAMPLE_PINS = STAFF.map(([n, r, p]) => `${n} (${r}) ${p}`).join(' · ');

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function loadSample(store: Store, by: PublicUser): void {
  const sup = SUPPLIERS.map(([name, contact, delivers, lead], i) =>
    store.saveSupplier({ name, contact, phone: `+383 44 000 00${i + 1}`, delivers, lead_days: lead, tax_no: '', active: true }),
  );
  const products: Product[] = PRODUCTS.map(([name, cat, price, cost, vat, stock, min, unit, plu, quick, s], i) =>
    store.saveProduct(
      {
        name,
        category: cat,
        price,
        cost,
        vat_rate: vat,
        stock,
        min_stock: min,
        unit: unit ?? 'pcs',
        plu: plu ?? null,
        barcode: unit === 'kg' || plu ? null : withCheckDigit('380012340' + String(i + 100).padStart(3, '0')),
        active: true,
        quick_key: !!quick,
        allow_discount: true,
        supplier_id: s != null ? sup[s].id : null,
        order_qty: min * 2,
      },
      by,
    ),
  );
  const staff: PublicUser[] = [];
  for (const [name, role, pin] of STAFF) {
    const have = store.users.find((u) => u.name === name);
    staff.push(have ?? store.addUser({ name, role, active: true }, pin, false, by));
  }

  // two weeks of trading, so the reports and dashboard have something to show
  const rand = rng(20261112);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let day = 14; day >= 1; day--) {
    const date = new Date(today.getTime() - day * 864e5);
    const cashier = staff[day % 2];
    const shift = store.startShift(cashier, 10000);
    shift.opened_at = new Date(date.getTime() + 7 * 36e5).toISOString();
    const n = 26 + Math.floor(rand() * 14);
    for (let k = 0; k < n; k++) {
      let cart = emptyCart();
      const lines = 1 + Math.floor(rand() * 6);
      for (let j = 0; j < lines; j++) {
        const p = products[Math.floor(rand() * products.length)];
        const qty = p.unit === 'kg' ? Math.round((0.3 + rand() * 1.5) * 1000) / 1000 : 1 + Math.floor(rand() * 2.2);
        cart = addProduct(cart, p, qty);
      }
      if (rand() < 0.05) cart = setLineDiscount(cart, cart.lines[0].key, { kind: 'percent', value: 10 });
      const t = totals(cart);
      const card = rand() < 0.45;
      const given = card ? 0 : Math.ceil(t.total / 500) * 500;
      const pay = settle(t.total, { cash: given, card: card ? t.total : 0 });
      const sale = store.recordSale({ totals: t, payments: pay.payments, cash_given: given, change: pay.change, cashier, shift_id: shift.id });
      const hour = 7 + Math.floor((k / n) * 13);
      sale.created_at = new Date(date.getTime() + hour * 36e5 + Math.floor(rand() * 3600) * 1000).toISOString();
      sale.fiscal = { ...sale.fiscal, status: sale.fiscal.status === 'off' ? 'off' : 'done' };
    }
    const sales = store.shiftSales(shift.id);
    const cash = sales.reduce((a, s) => a + s.payments.filter((p) => p.method === 'cash').reduce((b, p) => b + p.amount, 0), 0);
    const diff = day === 1 ? -240 : day === 4 ? 50 : 0;
    const closed = store.closeShift(shift.id, 10000 + cash + diff, 10000, diff ? 'Probably wrong change on a cash sale' : '', cashier, 'Arben');
    closed.closed_at = new Date(date.getTime() + 21 * 36e5).toISOString();
  }
  // restock what the history sold, so today starts from the listed levels
  for (const [i, p] of products.entries()) {
    const want = PRODUCTS[i][5];
    if (Math.abs(p.stock - want) > 0.0005) store.adjust(p.id, 'count', want, 'count', 'Sample store', by);
  }
}
