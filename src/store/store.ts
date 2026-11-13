/**
 * The store's data and every change to it, in one place.
 *
 * Everything is kept on the till itself (IndexedDB in the browser), so the
 * till sells with no internet at all. Each change is one synchronous step on
 * the data in memory, then saved, so a sale, its stock movements and its
 * audit entries are always written together.
 *
 * Stock is never edited directly: every change is a stock movement (sale,
 * return, delivery, count, waste), so a stock level can always be explained.
 */
import { parseScan, type Scan } from '../domain/barcode';
import { returnedSoFar, vatBreakdown, vatOf, type Totals } from '../domain/cart';
import { can, type Action } from '../domain/permissions';
import { hashPin } from '../domain/sha256';
import {
  DEFAULT_SETTINGS,
  type AuditAction,
  type AuditEntry,
  type Cart,
  type CashMove,
  type Delivery,
  type FiscalStamp,
  type MoveReason,
  type ParkedSale,
  type Payment,
  type Product,
  type PublicUser,
  type Role,
  type Sale,
  type SaleLine,
  type Settings,
  type Shift,
  type StockMove,
  type StoreData,
  type Supplier,
  type User,
} from '../domain/types';

export interface Persist {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
}

/** A mistake the person can fix: its message is shown as it is. */
export class StoreError extends Error {}

let n = 0;
export const newId = (p: string): string => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${(n++).toString(36)}`;
const now = () => new Date().toISOString();
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const pub = ({ pin_hash: _h, ...u }: User): PublicUser => u;

export function emptyData(): StoreData {
  return {
    version: 1,
    products: [],
    users: [],
    sales: [],
    moves: [],
    shifts: [],
    parked: [],
    cash_moves: [],
    suppliers: [],
    audit: [],
    deliveries: [],
    settings: { ...DEFAULT_SETTINGS },
    next_number: 1,
    next_z: 1,
  };
}

export interface ScanHit {
  product: Product;
  qty: number;
  /** For a price label: the printed price in cents. */
  label?: { cents: number };
}

export interface SaleInput {
  totals: Totals;
  payments: Payment[];
  cash_given: number;
  change: number;
  cashier: PublicUser;
  shift_id: string;
  approved_by?: string | null;
}

export interface ReceiveLine {
  product_id: string;
  qty: number;
  /** Net cost per unit, in cents. Updates the product's cost when given. */
  unit_cost: number | null;
}

export type ProductInput = Omit<Product, 'id' | 'updated_at'> & { id?: string };

const OFF_STAMP: FiscalStamp = { status: 'off', provider: 'none', code: null, qr: null, error: null, attempts: 0 };

export class Store {
  private data: StoreData = emptyData();
  private listeners = new Set<() => void>();
  private saving: Promise<void> = Promise.resolve();
  /** Bumped on every change, for React's useSyncExternalStore. */
  version = 0;
  ready = false;

  constructor(private persist: Persist) {}

  async load(): Promise<void> {
    const raw = await this.persist.load();
    if (raw) {
      this.data = this.migrate(JSON.parse(raw) as Partial<StoreData>);
    } else {
      this.data = emptyData();
      // the first manager, on PIN 0000 until they choose their own
      this.addUser({ name: 'Manager', role: 'manager', active: true }, '0000', true);
      await this.flush();
    }
    this.ready = true;
    this.emit();
  }

  /** Fill in anything an older save did not have yet. */
  private migrate(d: Partial<StoreData>): StoreData {
    const base = emptyData();
    return { ...base, ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } } as StoreData;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  /** Save after every change. Saves run one after another, never overlapping. */
  private commit() {
    const json = JSON.stringify(this.data);
    this.saving = this.saving.then(() => this.persist.save(json)).catch((e) => console.error('save failed', e));
    this.emit();
  }

  flush(): Promise<void> {
    this.commit();
    return this.saving;
  }

  /* ── audit ────────────────────────────────────────────────────────────── */

  get audit(): AuditEntry[] {
    return this.data.audit;
  }

  log(action: AuditAction, user: Pick<PublicUser, 'id' | 'name'> | null, detail: string, approvedBy: string | null = null, commit = true) {
    this.data.audit.push({ id: newId('a'), action, user_id: user?.id ?? 'system', user_name: user?.name ?? 'System', approved_by: approvedBy, detail, created_at: now() });
    if (commit) this.commit();
  }

  /* ── settings ─────────────────────────────────────────────────────────── */

  get settings(): Settings {
    return this.data.settings;
  }

  saveSettings(patch: Partial<Settings>, user: PublicUser) {
    const changed = (Object.keys(patch) as (keyof Settings)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(this.data.settings[k]));
    if (changed.length === 0) return;
    this.data.settings = { ...this.data.settings, ...patch };
    this.log('settings_change', user, `Changed ${changed.join(', ').replace(/_/g, ' ')}`, null, false);
    this.commit();
  }

  /** "1-0418": the till number and the receipt number. */
  receiptNo(sale: Pick<Sale, 'number' | 'till_no'>): string {
    return `${sale.till_no ?? this.data.settings.till_no}-${String(sale.number).padStart(4, '0')}`;
  }

  /* ── products ─────────────────────────────────────────────────────────── */

  get products(): Product[] {
    return this.data.products;
  }

  product(id: string): Product | undefined {
    return this.data.products.find((p) => p.id === id);
  }

  /** Create or update. Barcodes and PLUs must be unique among active products. */
  saveProduct(input: ProductInput, user?: PublicUser): Product {
    const name = input.name.trim();
    if (!name) throw new StoreError('Give the product a name.');
    if (!Number.isFinite(input.price) || input.price < 0) throw new StoreError('The price must be an amount.');
    const barcode = input.barcode?.replace(/\s/g, '') || null;
    const plu = input.plu?.trim() ? String(parseInt(input.plu, 10)) : null;
    if (plu === 'NaN') throw new StoreError('The PLU must be a number.');
    const clash = this.data.products.find((p) => p.active && p.id !== input.id && ((barcode && p.barcode === barcode) || (plu && p.plu === plu)));
    if (clash) throw new StoreError(barcode && clash.barcode === barcode ? `Barcode ${barcode} is already on ${clash.name}.` : `PLU ${plu} is already on ${clash.name}.`);
    const existing = input.id ? this.product(input.id) : undefined;
    const by = user?.name ?? 'Setup';
    const p: Product = { ...input, name, barcode, plu, category: input.category.trim() || 'Other', id: input.id ?? newId('p'), updated_at: now() };
    if (existing) {
      // stock only changes through moves, so its history always adds up
      p.stock = existing.stock;
      p.price_history = existing.price_history ?? [];
      if (existing.price !== p.price) p.price_history = [{ at: now(), price: p.price, by }, ...p.price_history].slice(0, 50);
      Object.assign(existing, p);
      if (user) this.log('product_change', user, `Changed ${name}`, null, false);
    } else {
      const opening = p.stock;
      p.stock = 0;
      p.price_history = [{ at: now(), price: p.price, by }];
      this.data.products.push(p);
      if (opening) this.move(p, opening, 'count', null, 'Opening stock', null, null, user ?? null);
      if (user) this.log('product_change', user, `Added ${name}`, null, false);
    }
    this.commit();
    return existing ?? p;
  }

  /** What a CSV import would do, before doing it. */
  previewImport(rows: { barcode: string | null; price: number }[]): { added: number; updated: number; priced: number } {
    let added = 0, updated = 0, priced = 0;
    for (const r of rows) {
      const hit = r.barcode ? this.data.products.find((p) => p.barcode === r.barcode) : undefined;
      if (hit) {
        updated++;
        if (hit.price !== r.price) priced++;
      } else added++;
    }
    return { added, updated, priced };
  }

  /** Bulk import from CSV: a known barcode updates that product, anything else is added. */
  importProducts(rows: Omit<Product, 'id' | 'updated_at' | 'active'>[], user: PublicUser): { added: number; updated: number } {
    let added = 0, updated = 0;
    for (const r of rows) {
      const hit = r.barcode ? this.data.products.find((p) => p.barcode === r.barcode) : undefined;
      if (hit) {
        const { stock, ...rest } = r;
        if (hit.price !== r.price) hit.price_history = [{ at: now(), price: r.price, by: user.name }, ...(hit.price_history ?? [])].slice(0, 50);
        Object.assign(hit, rest, { active: true, updated_at: now() });
        if (round3(stock - hit.stock) !== 0) this.move(hit, round3(stock - hit.stock), 'count', null, 'CSV import', null, null, user);
        updated++;
      } else {
        const p: Product = { ...r, stock: 0, active: true, allow_discount: true, id: newId('p'), updated_at: now(), price_history: [{ at: now(), price: r.price, by: user.name }] };
        this.data.products.push(p);
        if (r.stock) this.move(p, r.stock, 'count', null, 'CSV import', null, null, user);
        added++;
      }
    }
    this.log('import', user, `Imported ${rows.length} products from CSV: ${added} added, ${updated} updated`, null, false);
    this.commit();
    return { added, updated };
  }

  setActive(id: string, active: boolean, user: PublicUser) {
    const p = this.product(id);
    if (!p) return;
    p.active = active;
    p.updated_at = now();
    this.log('product_change', user, `${active ? 'Restored' : 'Archived'} ${p.name}`, null, false);
    this.commit();
  }

  get categories(): string[] {
    return [...new Set(this.data.products.filter((p) => p.active).map((p) => p.category))].sort((a, b) => a.localeCompare(b));
  }

  /** What a scan adds to the basket, or null for an unknown code. */
  lookup(raw: string): ScanHit | null {
    const scan: Scan = parseScan(raw, this.data.settings);
    const active = this.data.products.filter((p) => p.active);
    if (scan.kind === 'weight') {
      const p = active.find((x) => x.plu === scan.plu);
      if (p) return { product: p, qty: p.unit === 'kg' ? round3(scan.grams / 1000) : 1 };
    }
    if (scan.kind === 'price') {
      const p = active.find((x) => x.plu === scan.plu);
      if (p) return { product: p, qty: 1, label: { cents: scan.cents } };
    }
    const p = active.find((x) => x.barcode === scan.code) ?? active.find((x) => x.plu && x.plu === scan.code.replace(/^0+/, ''));
    return p ? { product: p, qty: 1 } : null;
  }

  /** Name, barcode or PLU search, best matches first. */
  search(text: string, limit = 40): Product[] {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return this.data.products
      .filter((p) => p.active)
      .map((p): readonly [Product, number] | null => {
        const name = p.name.toLowerCase();
        if (p.barcode === q || p.plu === q) return [p, 0] as const;
        if (p.barcode?.startsWith(q)) return [p, 1] as const;
        if (!words.every((w) => name.includes(w) || p.category.toLowerCase().includes(w))) return null;
        return [p, name.startsWith(q) ? 1 : 2] as const;
      })
      .filter((x): x is readonly [Product, number] => !!x)
      .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name))
      .slice(0, limit)
      .map((x) => x[0]);
  }

  /* ── suppliers ────────────────────────────────────────────────────────── */

  get suppliers(): Supplier[] {
    return this.data.suppliers;
  }

  supplier(id: string | null | undefined): Supplier | undefined {
    return id ? this.data.suppliers.find((s) => s.id === id) : undefined;
  }

  saveSupplier(input: Omit<Supplier, 'id'> & { id?: string }): Supplier {
    if (!input.name.trim()) throw new StoreError('Give the supplier a name.');
    const existing = input.id ? this.supplier(input.id) : undefined;
    const s: Supplier = { ...input, name: input.name.trim(), id: input.id ?? newId('sup') };
    if (existing) Object.assign(existing, s);
    else this.data.suppliers.push(s);
    this.commit();
    return existing ?? s;
  }

  get deliveries(): Delivery[] {
    return this.data.deliveries;
  }

  /* ── users ────────────────────────────────────────────────────────────── */

  get users(): PublicUser[] {
    return this.data.users.map(pub);
  }

  private pinTaken(pin: string, exceptId?: string) {
    return this.data.users.some((u) => u.active && u.id !== exceptId && u.pin_hash === hashPin(u.id, pin));
  }

  addUser(u: { name: string; role: Role; active: boolean }, pin: string, mustChange = false, by?: PublicUser): PublicUser {
    if (!u.name.trim()) throw new StoreError('Give the person a name.');
    if (!/^\d{4}$/.test(pin)) throw new StoreError('The PIN must be 4 digits.');
    if (this.pinTaken(pin)) throw new StoreError('Someone already uses this PIN. Choose another.');
    const id = newId('u');
    const user: User = { id, name: u.name.trim(), role: u.role, active: u.active, pin_hash: hashPin(id, pin), must_change_pin: mustChange || undefined };
    this.data.users.push(user);
    if (by) this.log('user_change', by, `Added ${user.name} as ${user.role}`, null, false);
    this.commit();
    return pub(user);
  }

  updateUser(id: string, patch: { name?: string; role?: Role; active?: boolean }, pin?: string, by?: PublicUser): PublicUser {
    const u = this.data.users.find((x) => x.id === id);
    if (!u) throw new StoreError('That person no longer exists.');
    const next = { ...u, ...patch };
    if (!next.name.trim()) throw new StoreError('Give the person a name.');
    const managers = this.data.users.filter((x) => x.active && x.role === 'manager' && x.id !== id);
    if (managers.length === 0 && (next.role !== 'manager' || !next.active)) throw new StoreError('Keep at least one active manager.');
    if (pin != null) {
      if (!/^\d{4}$/.test(pin)) throw new StoreError('The PIN must be 4 digits.');
      if (pin === '0000') throw new StoreError('Choose a PIN other than 0000.');
      if (this.pinTaken(pin, id)) throw new StoreError('Someone already uses this PIN. Choose another.');
      next.pin_hash = hashPin(id, pin);
      next.must_change_pin = undefined;
    }
    Object.assign(u, next, { name: next.name.trim() });
    if (by) this.log('user_change', by, `Changed ${u.name}${pin != null ? ' (new PIN)' : ''}`, null, false);
    this.commit();
    return pub(u);
  }

  /** The active person this PIN belongs to. */
  signIn(pin: string): PublicUser | null {
    const u = this.data.users.find((x) => x.active && x.pin_hash === hashPin(x.id, pin));
    return u ? pub(u) : null;
  }

  /** Sign in a person picked from the tiles, with their own PIN. */
  signInAs(userId: string, pin: string): PublicUser | null {
    const u = this.data.users.find((x) => x.id === userId && x.active);
    if (!u || u.pin_hash !== hashPin(u.id, pin)) return null;
    u.last_sign_in = now();
    this.log('sign_in', u, `Signed in on till ${this.data.settings.till_no}`, null, false);
    this.commit();
    return pub(u);
  }

  /** A supervisor or manager PIN that may approve `action`, or null. */
  approve(pin: string, action: Action): PublicUser | null {
    const u = this.signIn(pin);
    return u && can(u.role, action) ? u : null;
  }

  /* ── shifts and cash ──────────────────────────────────────────────────── */

  get shifts(): Shift[] {
    return this.data.shifts;
  }

  openShift(cashierId: string): Shift | null {
    return this.data.shifts.find((s) => s.cashier_id === cashierId && !s.closed_at) ?? null;
  }

  shift(id: string): Shift | undefined {
    return this.data.shifts.find((s) => s.id === id);
  }

  /** The last closed shift on this till, for "left in drawer last night". */
  lastClosed(): Shift | undefined {
    return [...this.data.shifts].reverse().find((s) => s.closed_at);
  }

  startShift(cashier: PublicUser, openingCash: number): Shift {
    const open = this.openShift(cashier.id);
    if (open) return open;
    const s: Shift = {
      id: newId('sh'),
      cashier_id: cashier.id,
      cashier_name: cashier.name,
      opened_at: now(),
      closed_at: null,
      closed_by: null,
      opening_cash: Math.max(0, Math.round(openingCash)),
      counted_cash: null,
      z_number: null,
      till_no: this.data.settings.till_no,
      voids: 0,
      voids_value: 0,
    };
    this.data.shifts.push(s);
    this.log('open_shift', cashier, `Opened shift · float ${(s.opening_cash / 100).toFixed(2)}`, null, false);
    this.commit();
    return s;
  }

  /** A line taken off the basket before payment, counted for the Z report. */
  recordVoid(shiftId: string, value: number, detail: string, user: PublicUser, approvedBy: string | null) {
    const s = this.shift(shiftId);
    if (s) {
      s.voids = (s.voids ?? 0) + 1;
      s.voids_value = (s.voids_value ?? 0) + value;
    }
    this.log('void_line', user, detail, approvedBy, false);
    this.commit();
  }

  cashMove(shiftId: string, kind: 'in' | 'out', amount: number, reason: string, user: PublicUser, approvedBy: string | null): CashMove {
    if (!(amount > 0)) throw new StoreError('Type an amount.');
    if (!reason.trim()) throw new StoreError('Pick a reason.');
    const m: CashMove = { id: newId('c'), shift_id: shiftId, kind, amount: Math.round(amount), reason: reason.trim(), user_id: user.id, user_name: user.name, approved_by: approvedBy, created_at: now() };
    this.data.cash_moves.push(m);
    this.log(kind === 'in' ? 'cash_in' : 'cash_out', user, `Cash ${kind} ${(m.amount / 100).toFixed(2)} · ${m.reason}`, approvedBy, false);
    this.commit();
    return m;
  }

  cashMoves(shiftId: string): CashMove[] {
    return this.data.cash_moves.filter((m) => m.shift_id === shiftId);
  }

  closeShift(id: string, counted: number, floatLeft: number, note: string, by: PublicUser, approvedBy: string | null): Shift {
    const s = this.shift(id);
    if (!s) throw new StoreError('That shift no longer exists.');
    if (s.closed_at) return s;
    s.closed_at = now();
    s.closed_by = approvedBy ?? by.name;
    s.counted_cash = Math.max(0, Math.round(counted));
    s.float_left = Math.max(0, Math.round(floatLeft));
    s.note = note.trim() || null;
    s.z_number = this.data.next_z++;
    // parked baskets do not carry over to the next shift
    this.data.parked = this.data.parked.filter((p) => p.cashier_id !== s.cashier_id);
    this.log('close_shift', by, `Closed shift · Z ${s.z_number} · counted ${(s.counted_cash / 100).toFixed(2)}`, approvedBy, false);
    this.commit();
    return s;
  }

  shiftSales(shiftId: string): Sale[] {
    return this.data.sales.filter((s) => s.shift_id === shiftId);
  }

  /* ── parked sales ─────────────────────────────────────────────────────── */

  parked(cashierId: string): ParkedSale[] {
    return this.data.parked.filter((p) => p.cashier_id === cashierId);
  }

  park(cart: Cart, note: string, cashier: PublicUser): ParkedSale {
    if (cart.lines.length === 0) throw new StoreError('There is nothing to park.');
    const p: ParkedSale = { id: newId('pk'), cart, label: note.trim(), cashier_id: cashier.id, cashier_name: cashier.name, created_at: now() };
    this.data.parked.push(p);
    this.commit();
    return p;
  }

  /** Take a parked basket back off the shelf. */
  unpark(id: string): ParkedSale | null {
    const i = this.data.parked.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const [p] = this.data.parked.splice(i, 1);
    this.commit();
    return p;
  }

  /* ── sales ────────────────────────────────────────────────────────────── */

  get sales(): Sale[] {
    return this.data.sales;
  }

  sale(id: string): Sale | undefined {
    return this.data.sales.find((s) => s.id === id);
  }

  /** A sale by what is printed on the receipt: "1-0418", "418" or "0418". */
  findReceipt(text: string): Sale | undefined {
    const m = text.trim().match(/^(?:(\d+)-)?0*(\d+)$/);
    if (!m) return undefined;
    const no = parseInt(m[2], 10);
    const till = m[1] ? parseInt(m[1], 10) : null;
    return this.data.sales.find((s) => s.number === no && s.kind === 'sale' && (till == null || (s.till_no ?? this.data.settings.till_no) === till));
  }

  saleByNumber(no: number): Sale | undefined {
    return this.data.sales.find((s) => s.number === no && s.kind === 'sale');
  }

  returnsOf(saleId: string): Sale[] {
    return this.data.sales.filter((s) => s.ref_sale_id === saleId);
  }

  /** What is still returnable on each line of a sale. */
  returnable(sale: Sale): number[] {
    const used = returnedSoFar(sale.lines, this.returnsOf(sale.id));
    return sale.lines.map((l, i) => round3(l.qty - used[i]));
  }

  private fiscalStamp(): FiscalStamp {
    const provider = this.data.settings.fiscal_provider;
    return provider === 'none' ? { ...OFF_STAMP } : { status: 'pending', provider, code: null, qr: null, error: null, attempts: 0 };
  }

  /**
   * Record a sale: gives it the next receipt number, takes the goods off
   * stock, and saves both in one step. Fiscalization happens after, from the
   * queue, so the till never waits for the tax service.
   */
  recordSale(input: SaleInput): Sale {
    const t = input.totals;
    if (t.lines.length === 0) throw new StoreError('The basket is empty.');
    const paid = input.payments.reduce((a, p) => a + p.amount, 0);
    if (paid !== t.total) throw new StoreError('The payment does not match the total.');
    const sale: Sale = {
      id: newId('s'),
      number: this.data.next_number++,
      till_no: this.data.settings.till_no,
      kind: 'sale',
      ref_sale_id: null,
      ref_number: null,
      created_at: now(),
      cashier_id: input.cashier.id,
      cashier_name: input.cashier.name,
      shift_id: input.shift_id,
      lines: t.lines,
      subtotal: t.subtotal,
      discount: t.discount,
      total: t.total,
      vat: t.vat,
      payments: input.payments,
      cash_given: input.cash_given,
      change: input.change,
      approved_by: input.approved_by ?? null,
      fiscal: this.fiscalStamp(),
    };
    this.data.sales.push(sale);
    for (const l of sale.lines) this.moveById(l.product_id, l.name, -(l.stock_qty ?? l.qty), 'sale', sale.id, input.cashier);
    this.commit();
    return sale;
  }

  /**
   * A refund for some lines of an earlier sale (or, with `original` null, a
   * return without a receipt, which needs an approver). Goods go back on
   * stock, or to waste when they are damaged.
   */
  recordReturn(opts: {
    original: Sale | null;
    lines: SaleLine[];
    method: 'cash' | 'card';
    cashier: PublicUser;
    shiftId: string;
    approvedBy: string | null;
    reason: string;
    restock: boolean;
  }): Sale {
    const { original, lines } = opts;
    if (lines.length === 0) throw new StoreError('Pick what is coming back.');
    if (!original && !opts.approvedBy) throw new StoreError('A return without a receipt needs a supervisor.');
    if (original) {
      const left = this.returnable(original);
      for (const l of lines) {
        const i = original.lines.findIndex((o) => o.product_id === l.product_id && o.price === l.price);
        if (i < 0 || -l.qty > left[i] + 1e-9) throw new StoreError(`${l.name} was already returned.`);
      }
    }
    const total = lines.reduce((a, l) => a + l.total, 0);
    const subtotal = lines.reduce((a, l) => a + Math.round(l.price * l.qty), 0);
    const r: Sale = {
      id: newId('s'),
      number: this.data.next_number++,
      till_no: this.data.settings.till_no,
      kind: 'return',
      ref_sale_id: original?.id ?? null,
      ref_number: original?.number ?? null,
      created_at: now(),
      cashier_id: opts.cashier.id,
      cashier_name: opts.cashier.name,
      shift_id: opts.shiftId,
      lines,
      subtotal,
      discount: subtotal - total,
      total,
      vat: vatBreakdown(lines),
      payments: [{ method: opts.method, amount: total }],
      cash_given: 0,
      change: 0,
      approved_by: opts.approvedBy,
      reason: opts.reason || null,
      fiscal: this.fiscalStamp(),
    };
    this.data.sales.push(r);
    for (const l of lines) {
      const back = -(l.stock_qty ?? l.qty);
      this.moveById(l.product_id, l.name, back, 'return', r.id, opts.cashier);
      // damaged goods come back in and go straight out again as waste, so both show
      if (!opts.restock) this.moveById(l.product_id, l.name, -back, 'damaged', r.id, opts.cashier);
    }
    this.log('return', opts.cashier, `Return ${this.receiptNo(r)} · ${(-total / 100).toFixed(2)}${original ? ` for ${this.receiptNo(original)}` : ' without receipt'} · ${opts.reason}`, opts.approvedBy, false);
    this.commit();
    return r;
  }

  /** Fiscal queue: receipts still to register. */
  pendingFiscal(): Sale[] {
    return this.data.sales.filter((s) => s.fiscal.status === 'pending' || s.fiscal.status === 'failed');
  }

  setFiscal(id: string, patch: Partial<FiscalStamp>) {
    const s = this.sale(id);
    if (!s) return;
    s.fiscal = { ...s.fiscal, ...patch };
    this.commit();
  }

  /* ── stock ────────────────────────────────────────────────────────────── */

  get moves(): StockMove[] {
    return this.data.moves;
  }

  private moveById(id: string, name: string, qty: number, reason: MoveReason, ref: string | null, user: PublicUser) {
    const p = this.product(id);
    if (p) this.move(p, qty, reason, ref, null, null, null, user);
    else this.data.moves.push({ id: newId('m'), product_id: id, product_name: name, qty: round3(qty), reason, note: null, supplier: null, unit_cost: null, user_id: user.id, user_name: user.name, ref_sale_id: ref, created_at: now() });
  }

  private move(p: Product, qty: number, reason: MoveReason, ref: string | null, note: string | null, supplier: string | null, unitCost: number | null, user: PublicUser | null) {
    p.stock = round3(p.stock + qty);
    this.data.moves.push({
      id: newId('m'),
      product_id: p.id,
      product_name: p.name,
      qty: round3(qty),
      reason,
      note,
      supplier,
      unit_cost: unitCost,
      user_id: user?.id ?? 'system',
      user_name: user?.name ?? 'Setup',
      ref_sale_id: ref,
      created_at: now(),
    });
  }

  /** Goods in from a supplier. Updates each product's cost to the new one. */
  receive(lines: ReceiveLine[], supplier: string, note: string, user: PublicUser, supplierId: string | null = null): Delivery {
    const ok = lines.filter((l) => l.qty > 0 && this.product(l.product_id));
    if (ok.length === 0) throw new StoreError('Add at least one product with a quantity.');
    const dl: Delivery['lines'] = [];
    for (const l of ok) {
      const p = this.product(l.product_id)!;
      if (l.unit_cost != null && l.unit_cost >= 0) p.cost = Math.round(l.unit_cost);
      this.move(p, l.qty, 'receive', null, note.trim() || null, supplier.trim() || null, l.unit_cost, user);
      dl.push({ product_id: p.id, name: p.name, qty: l.qty, unit_cost: l.unit_cost ?? p.cost, vat_rate: p.vat_rate });
    }
    const net = dl.reduce((a, l) => a + Math.round(l.unit_cost * l.qty), 0);
    const vat = dl.reduce((a, l) => a + Math.round((Math.round(l.unit_cost * l.qty) * l.vat_rate) / 100), 0);
    const d: Delivery = { id: newId('d'), supplier_id: supplierId, supplier_name: supplier.trim() || 'Unknown supplier', note_no: note.trim(), lines: dl, net, vat, total: net + vat, user_name: user.name, created_at: now() };
    this.data.deliveries.push(d);
    this.log('receive', user, `Received ${dl.length} lines from ${d.supplier_name}${d.note_no ? ` · ${d.note_no}` : ''}`, null, false);
    this.commit();
    return d;
  }

  /**
   * Fix the stock of one product. `mode` 'count' sets it to what was counted
   * on the shelf; otherwise `qty` is taken off (damaged, expired) or added.
   */
  adjust(productId: string, mode: 'count' | 'change', qty: number, reason: MoveReason, note: string, user: PublicUser) {
    const p = this.product(productId);
    if (!p) throw new StoreError('That product no longer exists.');
    const delta = mode === 'count' ? round3(qty - p.stock) : round3(qty);
    if (delta === 0) return;
    const r = mode === 'count' ? 'count' : reason;
    this.move(p, delta, r, null, note.trim() || null, null, null, user);
    this.log('stock_adjust', user, `${p.name} ${delta > 0 ? '+' : ''}${delta} · ${r}${note.trim() ? ` · ${note.trim()}` : ''}`, null, false);
    this.commit();
  }

  /** When each product last came in, for the stock list. */
  lastReceived(productId: string): StockMove | undefined {
    for (let i = this.data.moves.length - 1; i >= 0; i--) {
      const m = this.data.moves[i];
      if (m.product_id === productId && m.reason === 'receive') return m;
    }
    return undefined;
  }

  /* ── backup ───────────────────────────────────────────────────────────── */

  exportJson(): string {
    return JSON.stringify(this.data);
  }

  async restoreJson(json: string, user: PublicUser): Promise<void> {
    const d = JSON.parse(json) as StoreData;
    if (d?.version !== 1 || !Array.isArray(d.products) || !Array.isArray(d.users) || !Array.isArray(d.sales)) throw new StoreError('This is not a backup from this app.');
    if (!d.users.some((u) => u.active && u.role === 'manager')) throw new StoreError('This backup has no active manager.');
    this.data = this.migrate(d);
    this.log('restore', user, 'Restored from a backup file', null, false);
    await this.flush();
  }

  /** Replace everything with `data` (sample store, tests). */
  async replace(data: StoreData): Promise<void> {
    this.data = this.migrate(data);
    await this.flush();
  }
}

/** VAT back on a refund, for the return screen. */
export const vatBack = (lines: SaleLine[]): number => -lines.reduce((a, l) => a + vatOf(l.total, l.vat_rate), 0);
