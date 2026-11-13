/**
 * Product lists in and out as CSV, so a store can start from its supplier's
 * or old till's export instead of typing a thousand products.
 *
 * Columns (header row required, any order, case does not matter):
 *   name, barcode, plu, category, unit (pcs|kg), price, cost, vat (0|8|18), stock, min_stock
 * Only name and price are required. Prices take "1.20" or "1,20". A comma or a
 * semicolon separates columns (Excel in Albanian and German uses ";").
 */
import { parseMoney } from './money';
import type { Product, Unit, VatRate } from './types';

/** Split CSV text into rows, honouring "quoted, fields" and "" escapes. */
export function parseCsv(text: string, sep?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const d = sep ?? ((first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type ImportRow = Omit<Product, 'id' | 'updated_at' | 'active'>;
export interface ImportResult {
  rows: ImportRow[];
  /** "Line 4: price is not a number" — the rows that were skipped and why. */
  errors: string[];
}

const ALIASES: Record<string, string> = {
  name: 'name', emri: 'name', product: 'name', produkti: 'name',
  barcode: 'barcode', ean: 'barcode', barkodi: 'barcode', code: 'barcode', kodi: 'barcode',
  plu: 'plu',
  category: 'category', kategoria: 'category',
  unit: 'unit', njesia: 'unit',
  price: 'price', cmimi: 'price', 'çmimi': 'price',
  cost: 'cost', kosto: 'cost',
  vat: 'vat', tvsh: 'vat',
  stock: 'stock', stoku: 'stock', sasia: 'stock', qty: 'stock',
  min_stock: 'min_stock', min: 'min_stock', minimum: 'min_stock',
};

const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  return t === '' ? 0 : /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
};

export function importProducts(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { rows: [], errors: ['The file is empty.'] };
  const head = rows[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? '');
  if (!head.includes('name') || !head.includes('price')) return { rows: [], errors: ['The first row must name the columns, with at least "name" and "price".'] };
  const col = (r: string[], k: string) => {
    const i = head.indexOf(k);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const out: ImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = col(r, 'name');
    if (!name) return void errors.push(`Line ${line}: no name.`);
    const price = parseMoney(col(r, 'price'));
    if (price == null || price < 0) return void errors.push(`Line ${line}: price "${col(r, 'price')}" is not an amount.`);
    const cost = col(r, 'cost') ? parseMoney(col(r, 'cost')) : 0;
    if (cost == null) return void errors.push(`Line ${line}: cost "${col(r, 'cost')}" is not an amount.`);
    const u = col(r, 'unit').toLowerCase();
    const unit: Unit = u === 'kg' || u === 'kilogram' ? 'kg' : 'pcs';
    const vatRaw = col(r, 'vat').replace('%', '');
    const vat = vatRaw === '' ? 18 : Number(vatRaw);
    if (![0, 8, 18].includes(vat)) return void errors.push(`Line ${line}: VAT "${col(r, 'vat')}" must be 0, 8 or 18.`);
    const stock = num(col(r, 'stock'));
    const min = num(col(r, 'min_stock'));
    if (stock == null || min == null) return void errors.push(`Line ${line}: stock must be a number.`);
    const barcode = col(r, 'barcode').replace(/\s/g, '') || null;
    if (barcode && seen.has(barcode)) return void errors.push(`Line ${line}: barcode ${barcode} is already used on an earlier line.`);
    if (barcode) seen.add(barcode);
    out.push({ name, barcode, plu: col(r, 'plu') ? String(parseInt(col(r, 'plu'), 10)) : null, category: col(r, 'category') || 'Other', unit, price, cost, vat_rate: vat as VatRate, stock, min_stock: min });
  });
  return { rows: out, errors };
}

const cell = (v: string | number | null): string => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportProducts(products: Product[]): string {
  const head = ['name', 'barcode', 'plu', 'category', 'unit', 'price', 'cost', 'vat', 'stock', 'min_stock'];
  const rows = products.map((p) => [p.name, p.barcode, p.plu, p.category, p.unit, (p.price / 100).toFixed(2), (p.cost / 100).toFixed(2), p.vat_rate, p.stock, p.min_stock].map(cell).join(','));
  return [head.join(','), ...rows].join('\n') + '\n';
}
