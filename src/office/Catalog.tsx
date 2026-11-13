/** Products: list, edit, archive, and CSV import and export. */
import { useState } from 'react';
import { fmtDate, useStore } from '../app/state';
import { importProducts, type ImportResult } from '../domain/csv';
import { exportProducts } from '../domain/csv';
import { qtyLabel } from '../domain/money';
import { can } from '../domain/permissions';
import { guessItemType, XK_ITEM_TYPES } from '../fiscal/xk/coupon';
import { VAT_LABEL, VAT_RATES, type Product, type PublicUser, type Unit, type VatRate } from '../domain/types';
import type { ProductInput } from '../store/store';
import { Icon } from '../ui/icons';
import { errText, Sheet, Toggle, useToast } from '../ui/kit';
import { downloadText, Empty, Field, fromCents, Select, Text, toCents, Top, useMoney } from './ui';

export function Products({ user }: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const editable = can(user.role, 'products.edit');
  const ql = q.trim().toLowerCase();
  const list = s.products
    .filter((p) => (show === 'active' ? p.active : !p.active))
    .filter((p) => !cat || p.category === cat)
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.barcode?.includes(ql) || p.plu === ql)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Top title="Products" sub={`${s.products.filter((p) => p.active).length} active · ${s.categories.length} categories`}>
        <button type="button" className="btn" onClick={() => downloadText('products.csv', exportProducts(s.products.filter((p) => p.active)), 'text/csv')}>
          <Icon n="download" sm /> Export CSV
        </button>
        {editable && (
          <button type="button" className="btn go" onClick={() => setEdit('new')}>
            <Icon n="plus" sm /> Add product
          </button>
        )}
      </Top>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <label className="field" style={{ width: 320, maxWidth: '100%' }}>
          <Icon n="search" sm />
          <input aria-label="Find a product" placeholder="Name, barcode or PLU" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field" style={{ width: 200 }}>
          <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {s.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="seg">
          <button type="button" className={show === 'active' ? 'on' : ''} onClick={() => setShow('active')}>
            Active
          </button>
          <button type="button" className={show === 'archived' ? 'on' : ''} onClick={() => setShow('archived')}>
            Archived
          </button>
        </div>
      </div>
      <div className="card scroll">
        {list.length === 0 ? (
          <Empty>{s.products.length ? 'No products match.' : 'No products yet. Add one, or import your price list.'}</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Code</th>
                <th>Category</th>
                <th className="r">Price</th>
                <th className="r">Margin</th>
                <th>VAT</th>
                <th className="r">Stock</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((p) => {
                const net = Math.round((p.price * 100) / (100 + p.vat_rate));
                const mg = net ? Math.round(((net - p.cost) / net) * 100) : 0;
                return (
                  <tr key={p.id} className={editable ? 'click' : undefined} onClick={() => editable && setEdit(p)}>
                    <td>
                      <button type="button" className="rowlink">{p.name}</button>
                      <div className="row" style={{ gap: 4, marginTop: 2 }}>
                        {p.quick_key && <span className="tag b">Quick key</span>}
                        {p.age_check && <span className="tag a">18+</span>}
                        {p.allow_discount === false && <span className="tag">No discount</span>}
                      </div>
                    </td>
                    <td className="num mut">{p.barcode ?? (p.plu ? `PLU ${p.plu}` : '—')}</td>
                    <td>{p.category}</td>
                    <td className="r num">
                      {m(p.price)}
                      {p.unit === 'kg' ? '/kg' : ''}
                    </td>
                    <td className="r num">
                      <span className={mg < 10 ? 'tag r' : mg < 20 ? 'tag a' : 'tag g'}>{mg}%</span>
                    </td>
                    <td>{p.vat_rate}%</td>
                    <td className="r num">
                      <span className={p.min_stock > 0 && p.stock <= p.min_stock ? (p.stock <= 0 ? 'tag r' : 'tag a') : undefined}>{qtyLabel(p.stock, p.unit)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {edit && <ProductSheet user={user} product={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ProductSheet({ user, product, onClose }: { user: PublicUser; product: Product | null; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const m = useMoney();
  const p = product;
  const [f, setF] = useState({
    name: p?.name ?? '',
    receipt_name: p?.receipt_name ?? '',
    barcode: p?.barcode ?? '',
    plu: p?.plu ?? '',
    category: p?.category ?? '',
    unit: (p?.unit ?? 'pcs') as Unit,
    price: p ? fromCents(p.price) : '',
    cost: p ? fromCents(p.cost) : '',
    vat: String(p?.vat_rate ?? 18),
    stock: p ? String(p.stock) : '0',
    min: p ? String(p.min_stock) : '0',
    order: p?.order_qty != null ? String(p.order_qty) : '',
    supplier: p?.supplier_id ?? '',
    quick: !!p?.quick_key,
    age: !!p?.age_check,
    disc: p?.allow_discount !== false,
    item_type: p?.item_type ?? '',
  });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF({ ...f, [k]: v });
  const price = toCents(f.price);
  const cost = toCents(f.cost || '0');
  const vat = Number(f.vat) as VatRate;
  const net = price != null ? Math.round((price * 100) / (100 + vat)) : 0;
  const margin = net && cost != null ? Math.round(((net - cost) / net) * 100) : null;
  function save() {
    if (price == null) return toast('Type a price.', 'bad');
    const input: ProductInput = {
      ...(p ? { id: p.id } : {}),
      name: f.name,
      receipt_name: f.receipt_name.trim() || null,
      barcode: f.barcode.trim() || null,
      plu: f.plu.trim() || null,
      category: f.category,
      unit: f.unit,
      price,
      cost: cost ?? 0,
      vat_rate: vat,
      stock: parseFloat(f.stock.replace(',', '.')) || 0,
      min_stock: parseFloat(f.min.replace(',', '.')) || 0,
      order_qty: f.order ? parseFloat(f.order) : undefined,
      supplier_id: f.supplier || null,
      quick_key: f.quick,
      age_check: f.age,
      allow_discount: f.disc,
      item_type: f.item_type || null,
      active: p?.active ?? true,
    };
    try {
      s.saveProduct(input, user);
      toast(p ? 'Saved.' : `${f.name} added.`);
      onClose();
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={p ? p.name : 'New product'} sub={p ? `Updated ${fmtDate(p.updated_at)}` : 'Barcode and PLU must be unique.'} onClose={onClose} right width={620}>
        <div className="form">
          <Field label="Name">
            <Text label="Name" value={f.name} onChange={set('name')} placeholder="Whole milk 1 L" />
          </Field>
          <Field label="Name on receipt" hint="Optional, up to 24 characters">
            <Text label="Name on receipt" value={f.receipt_name} onChange={set('receipt_name')} />
          </Field>
          <Field label="Barcode">
            <Text label="Barcode" value={f.barcode} onChange={set('barcode')} placeholder="Scan or type" inputMode="numeric" />
          </Field>
          <Field label="PLU (scale code)" hint="For loose goods and scale labels">
            <Text label="PLU" value={f.plu} onChange={set('plu')} inputMode="numeric" />
          </Field>
          <Field label="Category">
            <label className="field">
              <input aria-label="Category" list="cats" value={f.category} onChange={(e) => set('category')(e.target.value)} />
              <datalist id="cats">
                {s.categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </Field>
          <Field label="Sold by">
            <Select label="Sold by" value={f.unit} onChange={set('unit')} options={[['pcs', 'Piece'], ['kg', 'Weight (kg)']]} />
          </Field>
          <Field label={`Price with VAT${f.unit === 'kg' ? ' per kg' : ''}`}>
            <Text label="Price" value={f.price} onChange={set('price')} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Cost without VAT" hint={margin != null ? `Margin ${margin}% · net price ${m(net)}` : undefined}>
            <Text label="Cost" value={f.cost} onChange={set('cost')} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="VAT">
            <Select label="VAT" value={f.vat} onChange={set('vat')} options={VAT_RATES.map((r) => [String(r), VAT_LABEL[r]] as [string, string])} />
          </Field>
          {s.settings.fiscal_provider === 'xk-atk' && (
            <Field label="ATK item category" hint={f.item_type ? undefined : `Empty: ${guessItemType(f.category)}, from the category`}>
              <Select label="ATK item category" value={f.item_type} onChange={set('item_type')} options={[['', 'From the category'], ...XK_ITEM_TYPES]} />
            </Field>
          )}
          <Field label="Supplier">
            <label className="field">
              <select aria-label="Supplier" value={f.supplier} onChange={(e) => set('supplier')(e.target.value)}>
                <option value="">None</option>
                {s.suppliers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          </Field>
          <Field label={p ? 'Stock (change it under Inventory)' : 'Opening stock'}>
            <label className="field">
              <input aria-label="Stock" value={f.stock} disabled={!!p} onChange={(e) => set('stock')(e.target.value)} inputMode="decimal" />
            </label>
          </Field>
          <Field label="Low-stock alert at" hint="0 turns it off">
            <Text label="Low-stock alert" value={f.min} onChange={set('min')} inputMode="decimal" />
          </Field>
        </div>
        <div className="card">
          {(
            [
              ['quick', 'Quick key on the till', 'For loose produce and bakery without a barcode'],
              ['age', 'Ask for age (18+)', 'Alcohol and tobacco: the till asks the cashier to check'],
              ['disc', 'Can be discounted', 'Off for items that may never be discounted'],
            ] as const
          ).map(([k, a, b]) => (
            <div key={k} className="row" style={{ padding: '12px 16px', borderTop: k === 'quick' ? 0 : '1px solid #EDEFEB' }}>
              <div className="grow">
                <b>{a}</b>
                <div className="mut small">{b}</div>
              </div>
              <Toggle on={f[k]} onChange={(v) => set(k)(v)} label={a} />
            </div>
          ))}
        </div>
        {p?.price_history && p.price_history.length > 1 && (
          <div>
            <div className="cap" style={{ marginBottom: 6 }}>Price changes</div>
            {p.price_history.slice(0, 6).map((h, i) => (
              <div key={i} className="kv small">
                <span>
                  {fmtDate(h.at)} · {h.by}
                </span>
                <b>{m(h.price)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          {p && (
            <button type="button" className={p.active ? 'btn warn' : 'btn'} onClick={() => { s.setActive(p.id, !p.active, user); onClose(); }}>
              {p.active ? 'Archive' : 'Restore'}
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn go" onClick={save}>
            {p ? 'Save' : 'Add product'}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function ImportPage({ user }: { user: PublicUser }) {
  const s = useStore();
  const toast = useToast();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [name, setName] = useState('');
  const preview = res ? s.previewImport(res.rows) : null;
  async function file(f: File | undefined) {
    if (!f) return;
    setName(f.name);
    setRes(importProducts(await f.text()));
  }
  return (
    <>
      <Top title="Import products" sub="From a CSV or a spreadsheet saved as CSV. A known barcode updates that product; anything else is added." />
      <div className="split">
        <div className="main col" style={{ gap: 18 }}>
          <label className="card col" style={{ padding: 28, alignItems: 'center', gap: 10, borderStyle: 'dashed', borderWidth: 2, cursor: 'pointer', textAlign: 'center' }}>
            <Icon n="upload" style={{ width: 36, height: 36 }} />
            <b>{name || 'Choose a CSV file'}</b>
            <span className="mut small">Comma or semicolon separated. The first row names the columns.</span>
            <input type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={(e) => void file(e.target.files?.[0])} />
          </label>
          {res && preview && (
            <div className="card" style={{ padding: 18 }}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <span className="tag g">{preview.added} new</span>
                <span className="tag b">{preview.updated} updated</span>
                <span className="tag a">{preview.priced} price changes</span>
                {res.errors.length > 0 && <span className="tag r">{res.errors.length} lines skipped</span>}
                <span className="grow" />
                <button
                  type="button"
                  className="btn go"
                  disabled={!res.rows.length}
                  onClick={() => {
                    const r = s.importProducts(res.rows, user);
                    toast(`Imported: ${r.added} added, ${r.updated} updated.`);
                    setRes(null);
                    setName('');
                  }}
                >
                  Import {res.rows.length} products
                </button>
              </div>
              {res.errors.length > 0 && (
                <div className="col small" style={{ marginTop: 12, gap: 4, color: '#B42318' }}>
                  {res.errors.slice(0, 20).map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}
              <div className="scroll" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Barcode</th>
                      <th>Category</th>
                      <th className="r">Price</th>
                      <th>VAT</th>
                      <th className="r">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.rows.slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td className="num">{r.barcode ?? r.plu ?? '—'}</td>
                        <td>{r.category}</td>
                        <td className="r num">{(r.price / 100).toFixed(2)}</td>
                        <td>{r.vat_rate}%</td>
                        <td className="r num">{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="aside card" style={{ padding: 18 }}>
          <h2 className="h2" style={{ marginBottom: 8 }}>Columns</h2>
          {(
            [
              ['name', 'Required. Also emri, produkti'],
              ['price', 'Required, with VAT. Also cmimi'],
              ['barcode', 'Also ean, barkodi, kodi'],
              ['plu', 'Scale code for loose goods'],
              ['category', 'Also kategoria'],
              ['unit', 'pcs or kg. Also njesia'],
              ['cost', 'Without VAT. Also kosto'],
              ['vat', '0, 8 or 18. Also tvsh'],
              ['stock', 'Also stoku, sasia'],
              ['min_stock', 'Low-stock alert level'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="kv small">
              <span className="num">{k}</span>
              <b style={{ fontWeight: 400 }}>{v}</b>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => downloadText('products-template.csv', 'name,barcode,plu,category,unit,price,cost,vat,stock,min_stock\nWhole milk 1 L,3800123456789,,Dairy,pcs,0.99,0.62,8,48,12\nBananas,,4011,Fruit and veg,kg,1.29,0.70,8,25,5\n', 'text/csv')}
          >
            <Icon n="download" sm /> Download a template
          </button>
        </div>
      </div>
    </>
  );
}
