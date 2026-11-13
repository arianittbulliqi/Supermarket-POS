/**
 * The two ATK messages, encoded as protobuf by hand (proto3, package atk).
 * Field numbers and types follow models.proto in github.com/fiskalizimi.
 * Fields are written in field-number order and zero values are left out,
 * which is what the official Go and PHP libraries do, so the bytes match.
 */

export const CouponType = { Sale: 1, Cancel: 2, Return: 3 } as const;
export const PaymentType = { Cash: 1, CreditCard: 2, Voucher: 3, Cheque: 4, CryptoCurrency: 5, Other: 6 } as const;

export interface CouponItem {
  Name: string;
  /** Unit price in 1/10000 of a euro (€1.00 = 10000). */
  Price: number;
  /** Unit code from ATK's list (CP, KGN, LTR…). */
  Unit: string;
  /** Sent as a 32-bit float, as in the ATK model. */
  Quantity: number;
  /** Line value in cents. */
  Total: number;
  /** Tax letter: A (exempt), C (0%), D (8%), E (18%). */
  TaxRate: string;
  /** Item category code from ATK's list (AU, PP, MPM…). */
  Type: string;
}

export interface Payment {
  Type: number;
  /** Cents. */
  Amount: number;
}

export interface TaxGroup {
  TaxRate: string;
  /** Taxable amount without VAT, in cents. */
  TotalForTax: number;
  /** VAT, in cents. */
  TotalTax: number;
}

export interface PosCoupon {
  BusinessId: bigint;
  CouponId: bigint;
  BranchId: bigint;
  Location: string;
  OperatorId: string;
  PosId: bigint;
  ApplicationId: bigint;
  VerificationNo: string;
  Type: number;
  /** Unix seconds. */
  Time: number;
  Items: CouponItem[];
  Payments: Payment[];
  Total: number;
  TaxGroups: TaxGroup[];
  TotalTax: number;
  TotalNoTax: number;
  ReferenceNo: bigint;
  TransactionNo: bigint;
  TotalDiscount: number;
}

export interface CitizenCoupon {
  BusinessId: bigint;
  CouponId: bigint;
  BranchId: bigint;
  PosId: bigint;
  VerificationNo: string;
  Type: number;
  Time: number;
  Total: number;
  TaxGroups: TaxGroup[];
  TotalTax: number;
  TotalNoTax: number;
}

class Writer {
  private out: number[] = [];

  bytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }

  private varint(v: bigint) {
    // int64 negatives are written as their 64-bit two's complement, as protobuf does
    let x = BigInt.asUintN(64, v);
    while (x >= 0x80n) {
      this.out.push(Number(x & 0x7fn) | 0x80);
      x >>= 7n;
    }
    this.out.push(Number(x));
  }

  private tag(field: number, wire: number) {
    this.varint(BigInt((field << 3) | wire));
  }

  int(field: number, v: number | bigint) {
    const b = typeof v === 'bigint' ? v : BigInt(Math.trunc(v));
    if (b === 0n) return;
    this.tag(field, 0);
    this.varint(b);
  }

  str(field: number, v: string) {
    if (!v) return;
    this.raw(field, new TextEncoder().encode(v));
  }

  float(field: number, v: number) {
    if (v === 0) return;
    this.tag(field, 5);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.out.push(...b);
  }

  raw(field: number, b: Uint8Array) {
    this.tag(field, 2);
    this.varint(BigInt(b.length));
    for (const x of b) this.out.push(x);
  }

  msg(field: number, b: Uint8Array) {
    // repeated messages are always written, even when empty
    this.raw(field, b);
  }
}

const item = (x: CouponItem) => {
  const w = new Writer();
  w.str(1, x.Name);
  w.int(2, x.Price);
  w.str(3, x.Unit);
  w.float(4, x.Quantity);
  w.int(5, x.Total);
  w.str(6, x.TaxRate);
  w.str(7, x.Type);
  return w.bytes();
};

const payment = (x: Payment) => {
  const w = new Writer();
  w.int(1, x.Type);
  w.int(2, x.Amount);
  return w.bytes();
};

const taxGroup = (x: TaxGroup) => {
  const w = new Writer();
  w.str(1, x.TaxRate);
  w.int(2, x.TotalForTax);
  w.int(3, x.TotalTax);
  return w.bytes();
};

export function encodePosCoupon(c: PosCoupon): Uint8Array {
  const w = new Writer();
  w.int(1, c.BusinessId);
  w.int(2, c.CouponId);
  w.int(3, c.BranchId);
  w.str(4, c.Location);
  w.str(5, c.OperatorId);
  w.int(6, c.PosId);
  w.int(7, c.ApplicationId);
  w.str(8, c.VerificationNo);
  w.int(9, c.Type);
  w.int(10, c.Time);
  for (const x of c.Items) w.msg(11, item(x));
  for (const x of c.Payments) w.msg(12, payment(x));
  w.int(13, c.Total);
  for (const x of c.TaxGroups) w.msg(14, taxGroup(x));
  w.int(15, c.TotalTax);
  w.int(16, c.TotalNoTax);
  w.int(17, c.ReferenceNo);
  w.int(18, c.TransactionNo);
  w.int(19, c.TotalDiscount);
  return w.bytes();
}

export function encodeCitizenCoupon(c: CitizenCoupon): Uint8Array {
  const w = new Writer();
  w.int(1, c.BusinessId);
  w.int(2, c.CouponId);
  w.int(3, c.BranchId);
  w.int(4, c.PosId);
  w.str(5, c.VerificationNo);
  w.int(6, c.Type);
  w.int(7, c.Time);
  w.int(8, c.Total);
  for (const x of c.TaxGroups) w.msg(9, taxGroup(x));
  w.int(10, c.TotalTax);
  w.int(11, c.TotalNoTax);
  return w.bytes();
}

export const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};

export const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
