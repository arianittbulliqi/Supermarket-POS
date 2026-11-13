/** Stock levels with write-offs and counts, receiving deliveries, and suppliers. */
import { useState } from 'react';
import { fmtDate, fmtDateTime, useStore } from '../app/state';
import { qtyLabel } from '../domain/money';
import { can } from '../domain/permissions';
import { lowStock, stockValue } from '../domain/reports';
import type { MoveReason, Product, PublicUser, Supplier } from '../domain/types';
import { Icon } from '../ui/icons';
import { errText, Sheet, Toggle, useToast } from '../ui/kit';
import { Empty, Field, fromCents, Text, toCents, Top, useMoney } from './ui';

const REASON_LABEL: Record<MoveReason, string> = { sale: 'Sale', return: 'Return', receive: 'Received', damaged: 'Damaged', expired: 'Expired', count: 'Stock count', other: 'Other' };

export function Stock({ user }: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'low' | 'moves'>('all');
  const [adj, setAdj] = useState<Product | null>(null);
  const ql = q.trim().toLowerCase();
  const low = lowStock(s.products);
  const list = (view === 'low' ? low : s.products.filter((p) => p.active)).filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.barcode?.includes(ql)).sort((a, b) => (view === 'low' ? 0 : a.name.localeCompare(b.name)));
  const moves = [...s.moves].reverse().filter((x) => x.reason !== 'sale' && (!ql || x.product_name.toLowerCase().includes(ql)));
  const writeOff = s.moves.filter((x) => (x.reason === 'damaged' || x.reason === 'expired') && Date.now() - new Date(x.created_at).getTime() < 30 * 864e5);
  const woValue = writeOff.reduce((a, x) => a + Math.round(-x.qty * (s.product(x.product_id)?.cost ?? 0)), 0);
  const adjustable = can(user.role, 'stock.adjust');
  return (
    <>
      <Top title="Stock levels" sub="Stock only changes through sales, deliveries, returns and adjustments, so every number has a history." />
      <div className="kpis">
        <div className="kpi">
          <span className="mut small">Stock value at cost</span>
          <span className="v">{m(stockValue(s.products))}</span>
        </div>
        <div className="kpi">
          <span className="mut small">Low or out of stock</span>
          <span className="v">{low.length}</span>
          <span className="mut small">{low.filter((p) => p.stock <= 0).length} out of stock</span>
        </div>
        <div className="kpi">
          <span className="mut small">Written off, last 30 days</span>
          <span className="v">{m(woValue)}</span>
          <span className="mut small">{writeOff.length} damaged or expired</span>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <label className="field" style={{ width: 320, maxWidth: '100%' }}>
          <Icon n="search" sm />
          <input aria-label="Find" placeholder="Product or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="seg">
          {(
            [
              ['all', 'All products'],
              ['low', `Low stock · ${low.length}`],
              ['moves', 'History'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="card scroll">
        {view === 'moves' ? (
          moves.length === 0 ? (
            <Empty>No stock changes yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Why</th>
                  <th>By</th>
                  <th className="r">Change</th>
                </tr>
              </thead>
              <tbody>
                {moves.slice(0, 300).map((x) => (
                  <tr key={x.id}>
                    <td className="num">{fmtDateTime(x.created_at)}</td>
                    <td>{x.product_name}</td>
                    <td>
                      {REASON_LABEL[x.reason]}
                      {x.supplier ? ` · ${x.supplier}` : ''}
                      {x.note ? <span className="mut"> · {x.note}</span> : null}
                    </td>
                    <td>{x.user_name}</td>
                    <td className="r num" style={{ color: x.qty < 0 ? '#B42318' : '#0A6B3E', fontWeight: 600 }}>
                      {x.qty > 0 ? '+' : ''}
                      {Math.round(x.qty * 1000) / 1000}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : list.length === 0 ? (
          <Empty>{view === 'low' ? 'Nothing is running low.' : 'No products.'}</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Supplier</th>
                <th>Last in</th>
                <th className="r">Alert at</th>
                <th className="r">On hand</th>
                {adjustable && <th />}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 300).map((p) => {
                const last = s.lastReceived(p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{s.supplier(p.supplier_id)?.name ?? '—'}</td>
                    <td className="num">{last ? fmtDate(last.created_at) : '—'}</td>
                    <td className="r num">{p.min_stock || '—'}</td>
                    <td className="r num">
                      <span className={p.min_stock > 0 && p.stock <= p.min_stock ? (p.stock <= 0 ? 'tag r' : 'tag a') : 'tag'}>{qtyLabel(p.stock, p.unit)}</span>
                    </td>
                    {adjustable && (
                      <td className="r">
                        <button type="button" className="btn" style={{ height: 34 }} onClick={() => setAdj(p)}>
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {adj && <AdjustSheet user={user} product={adj} onClose={() => setAdj(null)} />}
    </>
  );
}

function AdjustSheet({ user, product, onClose }: { user: PublicUser; product: Product; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<'damaged' | 'expired' | 'count' | 'other'>('damaged');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = parseFloat(qty.replace(',', '.'));
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={product.name} sub={`On hand now: ${qtyLabel(product.stock, product.unit)}`} onClose={onClose} width={480}>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {(
            [
              ['damaged', 'Damaged'],
              ['expired', 'Expired'],
              ['count', 'Counted'],
              ['other', 'Other change'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
        <Field label={mode === 'count' ? 'Counted on the shelf' : mode === 'other' ? 'Change (+ in, − out)' : 'How many to write off'}>
          <Text label="Quantity" value={qty} onChange={setQty} inputMode="decimal" placeholder={product.unit === 'kg' ? '0.000 kg' : '0'} />
        </Field>
        <Field label="Note">
          <Text label="Note" value={note} onChange={setNote} placeholder="Optional" />
        </Field>
        <button
          type="button"
          className="btn go"
          disabled={!Number.isFinite(n)}
          onClick={() => {
            try {
              if (mode === 'count') s.adjust(product.id, 'count', n, 'count', note, user);
              else s.adjust(product.id, 'change', mode === 'other' ? n : -Math.abs(n), mode, note, user);
              toast('Stock updated.');
              onClose();
            } catch (e) {
              toast(errText(e), 'bad');
            }
          }}
        >
          Save
        </button>
      </Sheet>
    </div>
  );
}

type RLine = { product: Product; qty: string; cost: string };

export function Receive({ user }: { user: PublicUser }) {
  const s = useStore();
  const toast = useToast();
  const m = useMoney();
  const [sup, setSup] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<RLine[]>([]);
  const [q, setQ] = useState('');
  const supplier = s.supplier(sup);
  const hits = q.trim() ? s.search(q, 8) : [];
  const suggest = supplier ? s.products.filter((p) => p.active && p.supplier_id === supplier.id && p.min_stock > 0 && p.stock <= p.min_stock && !lines.some((l) => l.product.id === p.id)) : [];
  const addLine = (p: Product, qty = '') => {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines([...lines, { product: p, qty, cost: fromCents(p.cost) }]);
    setQ('');
  };
  const net = lines.reduce((a, l) => a + Math.round((toCents(l.cost) ?? 0) * (parseFloat(l.qty.replace(',', '.')) || 0)), 0);
  const vat = lines.reduce((a, l) => a + Math.round((Math.round((toCents(l.cost) ?? 0) * (parseFloat(l.qty.replace(',', '.')) || 0)) * l.product.vat_rate) / 100), 0);
  const recent = [...s.deliveries].reverse().slice(0, 8);
  return (
    <>
      <Top title="Receive delivery" sub="Count what came in against the delivery note. Costs update each product's margin." />
      <div className="split">
        <div className="main col" style={{ gap: 14 }}>
          <div className="card form" style={{ padding: 16 }}>
            <Field label="Supplier">
              <label className="field">
                <select aria-label="Supplier" value={sup} onChange={(e) => setSup(e.target.value)}>
                  <option value="">Pick a supplier</option>
                  {s.suppliers.filter((x) => x.active).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </Field>
            <Field label="Delivery note or invoice no.">
              <Text label="Delivery note" value={note} onChange={setNote} placeholder="e.g. FT-2291" />
            </Field>
          </div>
          {suggest.length > 0 && (
            <div className="card row" style={{ padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
              <span className="mut small">Low from {supplier!.name}:</span>
              {suggest.slice(0, 8).map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => addLine(p, String(p.order_qty ?? Math.max(1, p.min_stock * 2 - p.stock)))}>
                  + {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="card">
            <div style={{ padding: 12, position: 'relative' }}>
              <label className="field">
                <Icon n="scan" sm />
                <input
                  aria-label="Add product"
                  placeholder="Scan or type a product to add"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const hit = s.lookup(q)?.product ?? hits[0];
                      if (hit) addLine(hit);
                    }
                  }}
                />
              </label>
              {hits.length > 0 && (
                <div className="card" style={{ position: 'absolute', left: 12, right: 12, top: 58, zIndex: 5, boxShadow: '0 10px 30px rgba(0,0,0,.12)' }}>
                  {hits.map((p) => (
                    <button key={p.id} type="button" className="line" style={{ width: '100%', border: 0, background: '#fff', font: 'inherit', cursor: 'pointer', textAlign: 'left', minHeight: 44 }} onClick={() => addLine(p)}>
                      <span className="grow">{p.name}</span>
                      <span className="mut small">{qtyLabel(p.stock, p.unit)} on hand</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {lines.length === 0 ? (
              <Empty>Add the products on the delivery note.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="r">Qty</th>
                    <th className="r">Cost each, no VAT</th>
                    <th className="r">Line</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const upd = (k: 'qty' | 'cost', v: string) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                    const c = toCents(l.cost) ?? 0;
                    return (
                      <tr key={l.product.id}>
                        <td>
                          {l.product.name}
                          {c !== l.product.cost && <div className="small" style={{ color: '#8A4B00' }}>Cost was {m(l.product.cost)}</div>}
                        </td>
                        <td className="r">
                          <input aria-label={`${l.product.name} quantity`} className="num" value={l.qty} onChange={(e) => upd('qty', e.target.value)} inputMode="decimal" style={cellInput} />
                        </td>
                        <td className="r">
                          <input aria-label={`${l.product.name} cost`} className="num" value={l.cost} onChange={(e) => upd('cost', e.target.value)} inputMode="decimal" style={cellInput} />
                        </td>
                        <td className="r num">{m(Math.round(c * (parseFloat(l.qty.replace(',', '.')) || 0)))}</td>
                        <td className="r">
                          <button type="button" className="x" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                            <Icon n="x" sm />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="aside col" style={{ gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="kv">
              <span>Lines</span>
              <b>{lines.length}</b>
            </div>
            <div className="kv">
              <span>Goods without VAT</span>
              <b>{m(net)}</b>
            </div>
            <div className="kv">
              <span>VAT</span>
              <b>{m(vat)}</b>
            </div>
            <div className="kv">
              <span>
                <b style={{ color: '#16201B' }}>Invoice total</b>
              </span>
              <b style={{ fontSize: 18 }}>{m(net + vat)}</b>
            </div>
            <button
              type="button"
              className="btn go"
              style={{ width: '100%', marginTop: 12 }}
              disabled={!lines.length}
              onClick={() => {
                try {
                  const d = s.receive(
                    lines.map((l) => ({ product_id: l.product.id, qty: parseFloat(l.qty.replace(',', '.')) || 0, unit_cost: toCents(l.cost) })),
                    supplier?.name ?? '',
                    note,
                    user,
                    supplier?.id ?? null,
                  );
                  toast(`Received ${d.lines.length} lines into stock.`);
                  setLines([]);
                  setNote('');
                } catch (e) {
                  toast(errText(e), 'bad');
                }
              }}
            >
              Receive into stock
            </button>
          </div>
          <div className="card">
            <div style={{ padding: '14px 16px' }}>
              <h2 className="h2">Recent deliveries</h2>
            </div>
            {recent.length === 0 ? (
              <Empty>None yet.</Empty>
            ) : (
              <table>
                <tbody>
                  {recent.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.supplier_name}</b>
                        <div className="mut small">
                          {fmtDate(d.created_at)} · {d.lines.length} lines{d.note_no ? ` · ${d.note_no}` : ''}
                        </div>
                      </td>
                      <td className="r num">{m(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const cellInput: React.CSSProperties = { width: 90, height: 36, border: '1.5px solid #C9CFC8', borderRadius: 8, padding: '0 8px', font: 'inherit', textAlign: 'right' };

export function Suppliers({ user }: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null);
  const editable = can(user.role, 'stock.receive');
  return (
    <>
      <Top title="Suppliers" sub="Who delivers what, and when.">
        {editable && (
          <button type="button" className="btn go" onClick={() => setEdit('new')}>
            <Icon n="plus" sm /> Add supplier
          </button>
        )}
      </Top>
      <div className="card scroll">
        {s.suppliers.length === 0 ? (
          <Empty>No suppliers yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Delivers</th>
                <th className="r">Products</th>
                <th className="r">Low now</th>
                <th className="r">Bought, 30 days</th>
              </tr>
            </thead>
            <tbody>
              {s.suppliers.map((x) => {
                const prods = s.products.filter((p) => p.active && p.supplier_id === x.id);
                const low = prods.filter((p) => p.min_stock > 0 && p.stock <= p.min_stock).length;
                const bought = s.deliveries.filter((d) => d.supplier_id === x.id && Date.now() - new Date(d.created_at).getTime() < 30 * 864e5).reduce((a, d) => a + d.total, 0);
                return (
                  <tr key={x.id} className={editable ? 'click' : undefined} onClick={() => editable && setEdit(x)}>
                    <td>
                      <button type="button" className="rowlink">{x.name}</button> {!x.active && <span className="tag">Inactive</span>}
                      {x.tax_no && <div className="mut small">Tax no. {x.tax_no}</div>}
                    </td>
                    <td>
                      {x.contact}
                      <div className="mut small">{x.phone}</div>
                    </td>
                    <td>
                      {x.delivers || '—'}
                      {x.lead_days ? <div className="mut small">Order {x.lead_days} day{x.lead_days === 1 ? '' : 's'} ahead</div> : null}
                    </td>
                    <td className="r num">{prods.length}</td>
                    <td className="r num">{low ? <span className="tag a">{low}</span> : '0'}</td>
                    <td className="r num">{m(bought)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {edit && <SupplierSheet supplier={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function SupplierSheet({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const x = supplier;
  const [f, setF] = useState({ name: x?.name ?? '', tax_no: x?.tax_no ?? '', contact: x?.contact ?? '', phone: x?.phone ?? '', delivers: x?.delivers ?? '', lead: String(x?.lead_days ?? 1), active: x?.active ?? true });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF({ ...f, [k]: v });
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={x ? x.name : 'New supplier'} onClose={onClose} right width={520}>
        <div className="form">
          <Field label="Name">
            <Text label="Name" value={f.name} onChange={set('name')} />
          </Field>
          <Field label="Tax no. (NUI)">
            <Text label="Tax no." value={f.tax_no} onChange={set('tax_no')} />
          </Field>
          <Field label="Contact person">
            <Text label="Contact" value={f.contact} onChange={set('contact')} />
          </Field>
          <Field label="Phone">
            <Text label="Phone" value={f.phone} onChange={set('phone')} type="tel" />
          </Field>
          <Field label="Delivery days">
            <Text label="Delivery days" value={f.delivers} onChange={set('delivers')} placeholder="Mon, Thu" />
          </Field>
          <Field label="Order how many days ahead">
            <Text label="Lead days" value={f.lead} onChange={set('lead')} inputMode="numeric" />
          </Field>
        </div>
        <div className="row">
          <span className="grow">Active</span>
          <Toggle on={f.active} onChange={(v) => set('active')(v)} label="Active" />
        </div>
        <button
          type="button"
          className="btn go"
          onClick={() => {
            try {
              s.saveSupplier({ ...(x ? { id: x.id } : {}), name: f.name, tax_no: f.tax_no, contact: f.contact, phone: f.phone, delivers: f.delivers, lead_days: parseInt(f.lead, 10) || 0, active: f.active });
              onClose();
            } catch (e) {
              toast(errText(e), 'bad');
            }
          }}
        >
          Save
        </button>
      </Sheet>
    </div>
  );
}
