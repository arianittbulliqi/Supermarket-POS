/**
 * Grocery POS data model.
 *
 * Money is always whole cents (integers), so totals never drift by a cent.
 * Prices are gross: VAT is included, as on a supermarket shelf label.
 * Quantities are pieces, or kilograms with up to three decimals (grams).
 */

export type Role = 'cashier' | 'supervisor' | 'manager';
export type Unit = 'pcs' | 'kg';
/** Kosovo VAT rates: 18% standard, 8% reduced (basic food, medicine), 0% exempt. */
export type VatRate = 0 | 8 | 18;
export const VAT_RATES: VatRate[] = [18, 8, 0];

export interface Product {
  id: string;
  name: string;
  /** EAN-13, EAN-8, UPC-A or the store's own code. Unique when set. */
  barcode: string | null;
  /** Scale code (PLU) for loose goods: what a weighed label's barcode carries. */
  plu: string | null;
  category: string;
  unit: Unit;
  /** Gross selling price per piece or per kg, in cents. */
  price: number;
  /** Net purchase cost per piece or per kg, in cents (for margins). */
  cost: number;
  vat_rate: VatRate;
  /** On hand, in pieces or kg. Can go below zero if stock was not received. */
  stock: number;
  /** At or below this, the product shows in Low stock. 0 turns the alert off. */
  min_stock: number;
  active: boolean;
  updated_at: string;
  /** Short name for the receipt (24 characters), when the full name is long. */
  receipt_name?: string | null;
  supplier_id?: string | null;
  /** How many to order when it runs low. */
  order_qty?: number;
  /** Shown as a quick key on the sale screen (loose produce, bakery). */
  quick_key?: boolean;
  /** The till asks the cashier to check the customer is 18 or over. */
  age_check?: boolean;
  /** Off for items that may never be discounted (tobacco, some medicine). */
  allow_discount?: boolean;
  price_history?: { at: string; price: number; by: string }[];
}

/** VAT rate letter, as printed next to each receipt line. */
export const VAT_CODE: Record<VatRate, string> = { 8: 'A', 18: 'B', 0: 'C' };
export const VAT_LABEL: Record<VatRate, string> = { 8: 'A · 8% (food and basic goods)', 18: 'B · 18% (everything else)', 0: 'C · 0% (exempt)' };

export interface User {
  id: string;
  name: string;
  role: Role;
  pin_hash: string;
  active: boolean;
  /** Still on the starting PIN 0000: must choose a new one on first sign-in. */
  must_change_pin?: boolean;
  last_sign_in?: string | null;
}

export type PublicUser = Omit<User, 'pin_hash'>;

export interface CartLine {
  /** Unique within the cart; scanning the same piece item again adds to this line. */
  key: string;
  product_id: string;
  name: string;
  barcode: string | null;
  unit: Unit;
  qty: number;
  /** Gross unit price in cents at the time of the sale. */
  price: number;
  cost: number;
  vat_rate: VatRate;
  /** Discount on this line, in cents. */
  discount: number;
  discount_reason?: string | null;
  /** The shelf price, when a supervisor changed the price at the till. */
  list_price?: number | null;
  /**
   * What leaves the shelf, when it differs from qty: a price-label pack is one
   * line at the label's price but takes its weight in kg off stock.
   */
  stock_qty?: number;
}

export type CartDiscount = { kind: 'percent'; value: number } | { kind: 'amount'; value: number } | null;

export interface Cart {
  lines: CartLine[];
  discount: CartDiscount;
}

export type PayMethod = 'cash' | 'card';
export interface Payment {
  method: PayMethod;
  /** Cents applied to the total (cash beyond the total is change, not counted here). */
  amount: number;
}

export interface VatLine {
  rate: VatRate;
  /** Gross, net and VAT in cents. gross = net + vat. */
  gross: number;
  net: number;
  vat: number;
}

export interface SaleLine {
  product_id: string;
  name: string;
  barcode: string | null;
  unit: Unit;
  qty: number;
  price: number;
  cost: number;
  vat_rate: VatRate;
  /** Line discount plus this line's share of the basket discount, in cents. */
  discount: number;
  /** What the customer paid for this line, in cents (after all discounts). */
  total: number;
  stock_qty?: number;
}

export interface Sale {
  id: string;
  /** Receipt number, counting up from 1 per store. */
  number: number;
  /** Which till took it (1, 2, 3…): receipts print as "1-0418". */
  till_no?: number;
  kind: 'sale' | 'return';
  /** For a return: the sale it refunds. */
  ref_sale_id: string | null;
  ref_number: number | null;
  created_at: string;
  cashier_id: string;
  cashier_name: string;
  shift_id: string;
  lines: SaleLine[];
  /** Before any discount, in cents. Negative on a return. */
  subtotal: number;
  discount: number;
  total: number;
  vat: VatLine[];
  payments: Payment[];
  /** Cash handed over and change given back (sales paid at least partly in cash). */
  cash_given: number;
  change: number;
  /** Who approved a discount or return above the cashier's rights. */
  approved_by: string | null;
  /** Why a return or override was allowed. */
  reason?: string | null;
  fiscal: FiscalStamp;
}

/**
 * Where a receipt stands with the tax authority. 'off' when the store has no
 * fiscal module turned on; 'pending' until the module has registered it (the
 * till keeps selling offline and retries).
 */
export interface FiscalStamp {
  status: 'off' | 'pending' | 'done' | 'failed';
  provider: string;
  /** The authority's code for this receipt (IKOF/JIR, NSLF/NIVF, PFR number…). */
  code: string | null;
  /** Link the receipt's QR code points at, for the customer to verify. */
  qr: string | null;
  error: string | null;
  attempts: number;
}

export interface ParkedSale {
  id: string;
  cart: Cart;
  label: string;
  cashier_id: string;
  cashier_name: string;
  created_at: string;
}

export interface CashMove {
  id: string;
  shift_id: string;
  kind: 'in' | 'out';
  /** Cents, always positive. */
  amount: number;
  reason: string;
  user_id: string;
  user_name: string;
  approved_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  tax_no: string;
  contact: string;
  phone: string;
  /** Delivery days, as people say them: "Mon, Wed, Fri". */
  delivers: string;
  lead_days: number;
  active: boolean;
}

export interface Delivery {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  note_no: string;
  lines: { product_id: string; name: string; qty: number; unit_cost: number; vat_rate: VatRate }[];
  /** Net cost of the goods, VAT and invoice total, in cents. */
  net: number;
  vat: number;
  total: number;
  user_name: string;
  created_at: string;
}

export type AuditAction = 'sign_in' | 'discount' | 'price_override' | 'void_line' | 'clear_cart' | 'return' | 'cash_in' | 'cash_out' | 'open_shift' | 'close_shift' | 'stock_adjust' | 'receive' | 'product_change' | 'import' | 'user_change' | 'settings_change' | 'restore';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  user_id: string;
  user_name: string;
  approved_by: string | null;
  detail: string;
  created_at: string;
}

export type MoveReason = 'sale' | 'return' | 'receive' | 'damaged' | 'expired' | 'count' | 'other';
export const ADJUST_REASONS: MoveReason[] = ['damaged', 'expired', 'count', 'other'];

export interface StockMove {
  id: string;
  product_id: string;
  product_name: string;
  /** Change in stock: negative out, positive in. */
  qty: number;
  reason: MoveReason;
  note: string | null;
  supplier: string | null;
  /** Net cost per unit for goods received, in cents. */
  unit_cost: number | null;
  user_id: string;
  user_name: string;
  ref_sale_id: string | null;
  created_at: string;
}

export interface Shift {
  id: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  /** Cash in the drawer at the start, in cents. */
  opening_cash: number;
  /** Cash counted at the close, in cents. */
  counted_cash: number | null;
  /** Z report number, counting up per store, given at the close. */
  z_number: number | null;
  till_no?: number;
  /** Cash left in the drawer for the next shift, in cents. */
  float_left?: number | null;
  note?: string | null;
  /** Lines removed from a basket before payment, for the Z report. */
  voids?: number;
  voids_value?: number;
}

export interface Settings {
  store_name: string;
  address: string;
  /** Business number (NUI) printed on receipts. */
  business_no: string;
  currency: string;
  receipt_footer: string;
  paper_width: 58 | 80;
  accent_color: string;
  /**
   * Two-digit prefixes of in-store scale labels. A 13-digit code starting with
   * one of these carries a PLU and a weight in grams.
   */
  weight_prefixes: string[];
  /** Prefixes of in-store labels that carry a price in cents instead of a weight. */
  price_prefixes: string[];
  /** A cashier may give up to this percent off without a supervisor. 0 = never. */
  cashier_discount_limit: number;
  /** Fiscal module: 'none' or a country module (see src/fiscal). */
  fiscal_provider: string;
  /** The module's own settings (certificate, device address, TCR code…). */
  fiscal_config: Record<string, string>;
  /** This till's number: printed on receipts ("1-0418") and Z reports. */
  till_no: number;
  /** The float normally left in the drawer, in cents. */
  usual_float: number;
  /** Keep selling when the fiscal service cannot be reached, and send later. */
  offline_selling: boolean;
  returns_days: number;
}

export const DEFAULT_SETTINGS: Settings = {
  store_name: 'My Grocery',
  address: '',
  business_no: '',
  currency: '€',
  receipt_footer: 'Thank you for shopping with us',
  paper_width: 80,
  accent_color: '#CF4A0A',
  weight_prefixes: ['21', '22', '23', '24', '25', '26', '27', '28', '29'],
  price_prefixes: ['20'],
  cashier_discount_limit: 10,
  fiscal_provider: 'none',
  fiscal_config: {},
  till_no: 1,
  usual_float: 10000,
  offline_selling: true,
  returns_days: 14,
};

export interface StoreData {
  version: 1;
  products: Product[];
  users: User[];
  sales: Sale[];
  moves: StockMove[];
  shifts: Shift[];
  parked: ParkedSale[];
  cash_moves: CashMove[];
  suppliers: Supplier[];
  audit: AuditEntry[];
  deliveries: Delivery[];
  settings: Settings;
  next_number: number;
  next_z: number;
}
