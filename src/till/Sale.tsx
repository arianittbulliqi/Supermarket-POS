/** The sale screen: scan field, basket, total, quick keys, and the sheets that hang off it. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../app/state';
import { fmtTime } from '../app/state';
import { parseScan } from '../domain/barcode';
import { addProduct, lineAfterDiscount, lineGross, removeLine, setCartDiscount, setLineDiscount, setQty, totals } from '../domain/cart';
import { money, parseQty, qtyLabel } from '../domain/money';
import { zReport } from '../domain/reports';
import type { Store } from '../store/store';
import { can } from '../domain/permissions';
import type { Cart, CartLine, Product, PublicUser, Shift } from '../domain/types';
import { Icon } from '../ui/icons';
import { errText, Keypad, padCents, Sheet, typeKey, useApproval, useToast } from '../ui/kit';
import { TillBar } from './frame';

export interface SaleProps {
  user: PublicUser;
  shift: Shift;
  cart: Cart;
  setCart: (c: Cart) => void;
  /** Who approved something on this basket (a discount above the limit). */
  approvedBy: string | null;
  setApprovedBy: (n: string | null) => void;
  onPay: () => void;
  onReturn: () => void;
  onMore: () => void;
  onLock: () => void;
}

type Open = null | 'search' | 'parked' | 'cash' | 'basket' | { weigh: Product } | { line: string } | { age: Product; qty: number; label?: { cents: number } };

const DISCOUNT_REASONS = ['Damaged packaging', 'Near best-before', 'Price match', 'Staff'];

export function Sale(p: SaleProps) {
  const s = useStore();
  const toast = useToast();
  const approve = useApproval();
  const cur = s.settings.currency;
  const m = (c: number) => money(c, cur);
  const [text, setText] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [mult, setMult] = useState(1);
  const [open, setOpen] = useState<Open>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [ageOk, setAgeOk] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const t = totals(p.cart);
  const parked = s.parked(p.user.id);

  // keep the scan field focused whenever no sheet is open, so a scanner always lands there
  useEffect(() => {
    if (open) return;
    const f = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement)) input.current?.focus();
    };
    f();
    const i = setInterval(f, 400);
    return () => clearInterval(i);
  }, [open]);

  useEffect(() => {
    if (p.cart.lines.length === 0) setAgeOk(false);
  }, [p.cart.lines.length]);

  const quick = useMemo(() => s.products.filter((x) => x.active && x.quick_key), [s, s.version]);
  const quickCats = [...new Set(quick.map((q) => q.category))];
  const shownCat = cat && quickCats.includes(cat) ? cat : quickCats[0] ?? null;

  function add(prod: Product, qty: number, label?: { cents: number }, skipAge = false) {
    if (prod.age_check && !ageOk && !skipAge) {
      setOpen({ age: prod, qty, label });
      return;
    }
    const next = addProduct(p.cart, prod, qty, label);
    p.setCart(next);
    setSel(next.lines[0]?.key ?? null);
    setMult(1);
    setOpen(null);
  }

  /** Something picked from search or a quick key: loose goods go to the scale first. */
  function pick(prod: Product) {
    if (prod.unit === 'kg') setOpen({ weigh: prod });
    else add(prod, mult);
  }

  function scan(raw: string) {
    const v = raw.trim();
    if (!v) return;
    const mm = /^(\d{1,3})\s*[x*×]\s*(.+)$/i.exec(v);
    if (mm) {
      setMult(parseInt(mm[1], 10));
      return scanCode(mm[2], parseInt(mm[1], 10));
    }
    scanCode(v, mult);
  }

  function scanCode(v: string, qty: number) {
    const hit = s.lookup(v);
    if (!hit) {
      if (/^\d{6,14}$/.test(v)) {
        toast(`No product has the code ${v}. Check it, or find it by name.`, 'bad');
        return;
      }
      setSearchQ(v);
      setOpen('search');
      return;
    }
    const kind = parseScan(v, s.settings).kind;
    if (hit.product.unit === 'kg' && kind === 'code') return setOpen({ weigh: hit.product });
    add(hit.product, kind === 'code' ? qty : hit.qty, hit.label);
  }

  async function voidLine(l: CartLine) {
    let by: string | null = null;
    if (!can(p.user.role, 'void_line')) {
      const a = await approve('void_line', `Remove ${l.name}`, 'Removing a scanned line needs a supervisor.');
      if (!a) return;
      by = a.name;
    }
    s.recordVoid(p.shift.id, lineAfterDiscount(l), `Removed ${l.name} (${qtyLabel(l.qty, l.unit)}) · ${(lineAfterDiscount(l) / 100).toFixed(2)}`, p.user, by);
    p.setCart(removeLine(p.cart, l.key));
    setOpen(null);
  }

  /** A discount of `pct` percent (or more): asks for a PIN above the cashier's limit. */
  async function discountOk(pct: number, what: string): Promise<boolean> {
    if (pct <= s.settings.cashier_discount_limit || can(p.user.role, 'discount')) return true;
    const a = await approve('discount', what, `Above the ${s.settings.cashier_discount_limit}% cashier limit. A supervisor types their PIN.`);
    if (!a) return false;
    p.setApprovedBy(a.name);
    return true;
  }

  const selLine = typeof open === 'object' && open && 'line' in open ? p.cart.lines.find((l) => l.key === open.line) : undefined;

  return (
    <>
      <TillBar
        sub={`Till ${s.settings.till_no} · ${p.user.name} · shift since ${fmtTime(p.shift.opened_at)}`}
        right={
          <button type="button" className="pill dark" style={{ border: 0, cursor: 'pointer' }} onClick={p.onLock}>
            <Icon n="lock" sm /> Lock
          </button>
        }
      />
      <div className="body" style={{ paddingBottom: 10 }}>
        <div className="panel" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #E1E4DF' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                scan(text);
                setText('');
              }}
            >
              <label className="field" style={{ height: 56, borderColor: '#0B7A47', borderWidth: 2 }}>
                <Icon n="scan" />
                {mult > 1 && (
                  <button type="button" className="tag g num" style={{ fontSize: 15, height: 30, border: 0, cursor: 'pointer' }} onClick={() => setMult(1)} title="Tap to clear">
                    {mult} ×
                  </button>
                )}
                <input ref={input} aria-label="Scan or type" placeholder="Scan a barcode, or type a PLU or name" style={{ fontSize: 18 }} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
                <span className="mut small">Scanner ready</span>
              </label>
            </form>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {p.cart.lines.length === 0 && (
              <div className="col mut" style={{ alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                <Icon n="scan" style={{ width: 40, height: 40 }} />
                <b style={{ color: '#16201B', fontSize: 17 }}>Scan the first item</b>
                <span className="small">Or type a code, a PLU or a name and press Enter. Type 3* before a scan to add 3.</span>
              </div>
            )}
            {p.cart.lines.map((l, i) => {
              const off = lineGross(l) - lineAfterDiscount(l);
              const sub = l.stock_qty != null && l.unit === 'pcs' && l.stock_qty !== 1 ? `Price label · ${l.stock_qty.toFixed(3)} kg` : l.unit === 'kg' ? `${l.qty.toFixed(3)} kg × ${m(l.price)}/kg` : `${l.qty} × ${m(l.price)}`;
              return (
                <button key={l.key} type="button" className={sel === l.key ? 'line sel' : 'line'} style={{ width: '100%', border: 0, borderTop: i ? '1px solid #EDEFEB' : 0, background: sel === l.key ? '#E6F3EC' : '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => (sel === l.key ? setOpen({ line: l.key }) : setSel(l.key))} onDoubleClick={() => setOpen({ line: l.key })}>
                  <span className="num mut" style={{ width: 22 }}>{p.cart.lines.length - i}</span>
                  <div className="grow">
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{l.name}</div>
                    <div className="mut small num">
                      {sub}
                      {l.discount_reason ? ` · ${l.discount_reason}` : ''}
                    </div>
                  </div>
                  {l.list_price != null && <span className="tag a">Price changed</span>}
                  {off > 0 && <span className="tag g num">−{m(off)}</span>}
                  {l.unit === 'kg' && <span className="tag b">Scale</span>}
                  {l.stock_qty != null && l.unit === 'pcs' && <span className="tag b">Scale label</span>}
                  <span className="num" style={{ width: 92, textAlign: 'right', fontSize: 18, fontWeight: 700 }}>{m(lineAfterDiscount(l))}</span>
                </button>
              );
            })}
          </div>
          <div className="row mut small" style={{ padding: '10px 16px', borderTop: '1px solid #E1E4DF' }}>
            <span className="grow">
              {Math.round(t.items * 1000) / 1000} item{t.items === 1 ? '' : 's'}
              {p.cart.lines.length ? ' · tap a line twice to change it' : ''}
            </span>
            {p.cart.discount && <span className="tag g">Basket {p.cart.discount.kind === 'percent' ? `${p.cart.discount.value}%` : m(p.cart.discount.value)} off</span>}
            <span>Till {s.settings.till_no}</span>
          </div>
        </div>
        <div style={{ width: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="total">
            <div className="row">
              <span className="mut grow" style={{ fontWeight: 600 }}>Total</span>
              {t.discount > 0 && <span className="mut small num">You save {m(t.discount)}</span>}
            </div>
            <div className="num" data-testid="total" style={{ fontSize: 60, lineHeight: '68px', fontWeight: 800, letterSpacing: -1.5 }}>{m(t.total)}</div>
            <div className="row mut small num" style={{ gap: 16 }}>
              <span>Subtotal {m(t.subtotal)}</span>
              <span>Discounts −{m(t.discount)}</span>
              <span>VAT incl. {m(t.vat.reduce((a, v) => a + v.vat, 0))}</span>
            </div>
          </div>
          {quickCats.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {quickCats.slice(0, 5).map((c) => (
                <button key={c} type="button" className={c === shownCat ? 'chip on' : 'chip'} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, alignContent: 'start', overflow: 'auto', minHeight: 0 }}>
            {quick
              .filter((q) => q.category === shownCat)
              .slice(0, 12)
              .map((q) => (
                <button key={q.id} type="button" onClick={() => pick(q)} style={{ height: 66, borderRadius: 12, border: '1px solid #E1E4DF', background: '#fff', font: 'inherit', textAlign: 'left', padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, color: '#16201B', cursor: 'pointer' }}>
                  <b style={{ fontSize: 15, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', width: '100%' }}>{q.name}</b>
                  <span className="mut small num">
                    {q.plu ? `${q.plu} · ` : ''}
                    {m(q.price)}
                    {q.unit === 'kg' ? '/kg' : ' each'}
                  </span>
                </button>
              ))}
            {quick.length === 0 && <div className="mut small" style={{ gridColumn: '1 / -1' }}>Quick keys show here. Turn on “Quick key” for loose produce and bakery items in the back office.</div>}
          </div>
          <div className="grow" />
          <button type="button" className="btn go xl" disabled={!p.cart.lines.length} style={{ opacity: p.cart.lines.length ? 1 : 0.5 }} onClick={p.onPay}>
            Pay {m(t.total)}
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 8, padding: '0 14px 14px' }}>
        {(
          [
            ['search', 'Search', () => { setSearchQ(text); setText(''); setOpen('search'); }],
            ['scale', 'Weigh', () => {
              const l = p.cart.lines.find((x) => x.key === sel);
              const prod = l ? s.product(l.product_id) : undefined;
              if (prod?.unit === 'kg') setOpen({ weigh: prod });
              else setOpen('search');
            }],
            ['times', mult > 1 ? `Qty ${mult} ×` : 'Qty ×', () => {
              const n = parseInt(text, 10);
              if (n > 0 && n < 1000) {
                setMult(n);
                setText('');
              } else toast('Type how many first, then tap Qty ×. Or type 3* and scan.');
            }],
            ['tag', 'Discount', () => (p.cart.lines.length ? setOpen('basket') : toast('Scan something first.'))],
            ['pause', 'Park sale', () => {
              try {
                s.park(p.cart, '', p.user);
                p.setCart({ lines: [], discount: null });
                p.setApprovedBy(null);
                toast('Sale parked. Find it under Parked.');
              } catch (e) {
                toast(errText(e), 'bad');
              }
            }],
            ['stack', `Parked · ${parked.length}`, () => setOpen('parked')],
            ['undo', 'Return', p.onReturn],
            ['cash', 'Cash in/out', () => setOpen('cash')],
            ['more', 'More', p.onMore],
          ] as [string, string, () => void][]
        ).map(([ic, label, fn]) => (
          <button key={ic} type="button" className="btn" style={{ height: 62, flexDirection: 'column', gap: 3, fontSize: 13, padding: '0 4px' }} onClick={fn}>
            <Icon n={ic} />
            {label}
          </button>
        ))}
      </div>

      {open === 'search' && <SearchSheet initial={searchQ} onClose={() => { setOpen(null); setSearchQ(''); }} onPick={(x) => { setSearchQ(''); pick(x); }} />}
      {typeof open === 'object' && open && 'weigh' in open && <WeighSheet product={open.weigh} onClose={() => setOpen(null)} onAdd={(kg) => add(open.weigh, kg)} />}
      {typeof open === 'object' && open && 'age' in open && (
        <Sheet title="Check the customer's age" sub={open.age.name} onClose={() => setOpen(null)} width={460}>
          <div className="row" style={{ background: '#FFF4E0', color: '#8A4B00', borderRadius: 12, padding: '12px 14px' }}>
            <Icon n="alert" />
            <b>Only sell this to customers aged 18 or over. Ask for ID if they look under 25.</b>
          </div>
          <div className="row">
            <button type="button" className="btn warn grow" onClick={() => setOpen(null)}>
              Not 18, don't sell
            </button>
            <button type="button" className="btn go grow" onClick={() => { setAgeOk(true); add(open.age, open.qty, open.label, true); }}>
              Customer is 18+
            </button>
          </div>
        </Sheet>
      )}
      {selLine && (
        <LineSheet
          line={selLine}
          product={s.product(selLine.product_id)}
          onClose={() => setOpen(null)}
          onQty={(q) => p.setCart(setQty(p.cart, selLine.key, q))}
          onDiscount={async (d, reason) => {
            const gross = lineGross(selLine);
            const pct = d == null ? 0 : d.kind === 'percent' ? d.value : gross ? (d.value / gross) * 100 : 0;
            if (!(await discountOk(pct, `${Math.round(pct)}% off ${selLine.name}`))) return;
            const next = setLineDiscount(p.cart, selLine.key, d);
            p.setCart({ ...next, lines: next.lines.map((l) => (l.key === selLine.key ? { ...l, discount_reason: d ? reason : null } : l)) });
            if (d) s.log('discount', p.user, `${selLine.name}: ${d.kind === 'percent' ? `${d.value}%` : (d.value / 100).toFixed(2)} off · ${reason ?? 'no reason'}`, p.approvedBy);
          }}
          onPrice={async (cents) => {
            let by: string | null = null;
            if (!can(p.user.role, 'price_override')) {
              const a = await approve('price_override', `New price for ${selLine.name}`, 'Changing a price at the till needs a supervisor.');
              if (!a) return;
              by = a.name;
              p.setApprovedBy(a.name);
            }
            p.setCart({ ...p.cart, lines: p.cart.lines.map((l) => (l.key === selLine.key ? { ...l, list_price: l.list_price ?? l.price, price: cents, discount: 0 } : l)) });
            s.log('price_override', p.user, `${selLine.name}: ${(selLine.price / 100).toFixed(2)} → ${(cents / 100).toFixed(2)}`, by);
          }}
          onReason={(r) => p.setCart({ ...p.cart, lines: p.cart.lines.map((l) => (l.key === selLine.key ? { ...l, discount_reason: r } : l)) })}
          onRemove={() => voidLine(selLine)}
        />
      )}
      {open === 'basket' && (
        <BasketSheet
          cart={p.cart}
          onClose={() => setOpen(null)}
          onSet={async (d) => {
            const sub = totals({ ...p.cart, discount: null }).total;
            const pct = d == null ? 0 : d.kind === 'percent' ? d.value : sub ? (d.value / sub) * 100 : 0;
            if (!(await discountOk(pct, `${Math.round(pct)}% off the whole basket`))) return;
            p.setCart(setCartDiscount(p.cart, d));
            if (d) s.log('discount', p.user, `Basket: ${d.kind === 'percent' ? `${d.value}%` : (d.value / 100).toFixed(2)} off`, p.approvedBy);
            setOpen(null);
          }}
        />
      )}
      {open === 'parked' && (
        <Sheet title="Parked sales" sub={p.cart.lines.length ? 'Pick one to carry on. The sale on screen is parked first.' : 'Pick one to carry on.'} onClose={() => setOpen(null)} width={620}>
          <div className="panel">
            {parked.length === 0 && <div className="mut" style={{ padding: 18 }}>Nothing parked. Use Park sale when a customer steps away.</div>}
            {parked.map((pk, i) => {
              const pt = totals(pk.cart);
              return (
                <div key={pk.id} className="line">
                  <span className="tag num">P{i + 1}</span>
                  <div className="grow">
                    <b>{pt.items} items · parked {fmtTime(pk.created_at)} by {pk.cashier_name}</b>
                    <div className="mut small">{pk.label ? `Note: ${pk.label}` : 'No note'}</div>
                  </div>
                  <b className="num" style={{ fontSize: 17 }}>{m(pt.total)}</b>
                  <button
                    type="button"
                    className="btn go"
                    onClick={() => {
                      if (p.cart.lines.length) s.park(p.cart, '', p.user);
                      const got = s.unpark(pk.id);
                      if (got) p.setCart(got.cart);
                      setOpen(null);
                    }}
                  >
                    Resume
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mut small">Parked sales clear at shift close.</div>
        </Sheet>
      )}
      {open === 'cash' && <CashSheet user={p.user} shift={p.shift} onClose={() => setOpen(null)} />}
    </>
  );
}

export function SearchSheet({ initial, onClose, onPick }: { initial?: string; onClose: () => void; onPick: (p: Product) => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const [q, setQ] = useState(initial ?? '');
  const res = s.search(q, 30);
  return (
    <Sheet title="Find a product" sub="By name, barcode or PLU" onClose={onClose} right width={560}>
      <label className="field">
        <Icon n="search" />
        <input
          autoFocus
          aria-label="Search products"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a name, e.g. milk"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && res[0]) onPick(res[0]);
          }}
        />
      </label>
      <div className="panel" style={{ flex: 1, overflow: 'auto', minHeight: 300 }}>
        {q && res.length === 0 && <div className="mut" style={{ padding: 18 }}>Nothing matches “{q}”.</div>}
        {!q && <div className="mut" style={{ padding: 18 }}>Start typing to see products.</div>}
        {res.map((p) => (
          <button key={p.id} type="button" className="line" style={{ width: '100%', border: 0, borderTop: '1px solid #EDEFEB', background: '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => onPick(p)}>
            <div className="grow">
              <b>{p.name}</b>
              <div className="mut small num">
                {p.barcode ?? (p.plu ? `PLU ${p.plu}` : 'No code')} · {p.category} · {qtyLabel(p.stock, p.unit)} in stock
              </div>
            </div>
            {p.unit === 'kg' && <span className="tag b">Weigh</span>}
            <b className="num">
              {m(p.price)}
              {p.unit === 'kg' ? '/kg' : ''}
            </b>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function WeighSheet({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (kg: number) => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const [w, setW] = useState('');
  const kg = parseQty(w.replace(',', '.')) ?? 0;
  const price = Math.round(product.price * kg);
  return (
    <Sheet title={product.name} sub={`${product.plu ? `PLU ${product.plu} · ` : ''}${m(product.price)} per kg · VAT ${product.vat_rate}%`} onClose={onClose} width={520}>
      <div className="total" style={{ textAlign: 'center' }}>
        <div className="mut small">Scale not connected · type the weight</div>
        <div className="num" style={{ fontSize: 52, lineHeight: '60px', fontWeight: 800 }}>{(kg || 0).toFixed(3)} kg</div>
      </div>
      <div className="row num" style={{ justifyContent: 'space-between', fontSize: 17 }}>
        <span className="mut">
          {(kg || 0).toFixed(3)} kg × {m(product.price)}
        </span>
        <b style={{ fontSize: 22 }}>{m(price)}</b>
      </div>
      <Keypad dot onKey={(k) => setW((x) => typeKey(x, k, 6))} height={56} />
      <div className="row">
        <button type="button" className="btn grow" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn go grow" disabled={!(kg > 0)} style={{ opacity: kg > 0 ? 1 : 0.5 }} onClick={() => onAdd(Math.round(kg * 1000) / 1000)}>
          Add {m(price)}
        </button>
      </div>
      <div className="mut small">Pre-weighed deli and meat labels (barcodes starting 20 to 29) are read straight from the scan. No scale needed.</div>
    </Sheet>
  );
}

function LineSheet({ line, product, onClose, onQty, onDiscount, onReason, onPrice, onRemove }: { line: CartLine; product?: Product; onClose: () => void; onQty: (q: number) => void; onReason: (r: string) => void; onDiscount: (d: Cart['discount'], reason: string | null) => void; onPrice: (cents: number) => void; onRemove: () => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const [reason, setReason] = useState<string | null>(line.discount_reason ?? null);
  const [amt, setAmt] = useState<null | 'amount' | 'price'>(null);
  const [digits, setDigits] = useState('');
  const gross = lineGross(line);
  const pct = gross ? Math.round((line.discount / gross) * 100) : 0;
  const limit = s.settings.cashier_discount_limit;
  const noDiscount = product?.allow_discount === false;
  return (
    <Sheet title={line.name} sub={`${line.barcode ?? 'No barcode'} · ${m(line.price)}${line.unit === 'kg' ? '/kg' : ''} · VAT ${line.vat_rate}%`} onClose={onClose} width={600} right>
      <div>
        <span className="label">Quantity</span>
        {line.unit === 'pcs' && line.stock_qty == null ? (
          <div className="row" style={{ gap: 0, border: '1px solid #D3D8D2', borderRadius: 12, height: 56, display: 'inline-flex' }}>
            <button type="button" aria-label="One less" style={bigStep} onClick={() => onQty(line.qty - 1)}>
              −
            </button>
            <span className="num" style={{ minWidth: 60, textAlign: 'center', fontSize: 24, fontWeight: 800 }}>{line.qty}</span>
            <button type="button" aria-label="One more" style={bigStep} onClick={() => onQty(line.qty + 1)}>
              +
            </button>
          </div>
        ) : (
          <div className="mut">{line.unit === 'kg' ? `${line.qty.toFixed(3)} kg (weighed)` : 'Price label: one pack'}</div>
        )}
      </div>
      <div>
        <span className="label">Discount</span>
        {noDiscount ? (
          <div className="mut">This product can't be discounted.</div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {[0, 5, 10, 15, 20, 50].map((v) => (
                <button key={v} type="button" className={pct === v && !(v === 0 && line.discount > 0) ? 'chip on' : 'chip'} onClick={() => onDiscount(v ? { kind: 'percent', value: v } : null, reason)}>
                  {v ? `${v}%` : 'None'}
                  {v > limit ? ' · PIN' : ''}
                </button>
              ))}
              <button type="button" className={amt === 'amount' ? 'chip on' : 'chip'} onClick={() => { setAmt('amount'); setDigits(''); }}>
                {s.settings.currency} amount
              </button>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {DISCOUNT_REASONS.map((r) => (
                <button key={r} type="button" className={reason === r ? 'chip on' : 'chip'} onClick={() => { setReason(r); if (line.discount > 0) onReason(r); }}>
                  {r}
                </button>
              ))}
            </div>
            <div className="mut small" style={{ marginTop: 8 }}>Store limit for cashiers is {limit}%. Above that a supervisor types their PIN here.</div>
          </>
        )}
      </div>
      {amt && (
        <div className="col" style={{ gap: 8 }}>
          <div className="field num" style={{ fontSize: 20, fontWeight: 700 }}>
            {amt === 'amount' ? 'Off: ' : 'New price: '}
            {m(padCents(digits))}
          </div>
          <Keypad onKey={(k) => setDigits((x) => typeKey(x, k, 7))} height={50} />
          <button
            type="button"
            className="btn go"
            onClick={() => {
              const c = padCents(digits);
              if (amt === 'amount') onDiscount(c ? { kind: 'amount', value: c } : null, reason);
              else if (c > 0) onPrice(c);
              setAmt(null);
            }}
          >
            {amt === 'amount' ? 'Apply discount' : 'Set price'}
          </button>
        </div>
      )}
      <div className="panel" style={{ padding: '4px 16px' }}>
        <div className="row" style={{ padding: '8px 0' }}>
          <span className="mut grow">Discount</span>
          <b className="num">−{m(line.discount)}</b>
        </div>
        <div className="row" style={{ padding: '8px 0', borderTop: '1px solid #EDEFEB' }}>
          <span className="mut grow">New line total</span>
          <b className="num" style={{ fontSize: 18 }}>{m(lineAfterDiscount(line))}</b>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn grow" onClick={() => { setAmt('price'); setDigits(''); }}>
          <Icon n="edit" sm /> Override price · PIN
        </button>
        <button type="button" className="btn warn grow" onClick={onRemove}>
          <Icon n="x" sm /> Remove line
        </button>
      </div>
      <div className="grow" />
      <button type="button" className="btn go xl" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

const bigStep: React.CSSProperties = { width: 60, height: 54, border: 0, background: 'transparent', font: 'inherit', fontSize: 26, fontWeight: 600, color: '#16201B', cursor: 'pointer' };

function BasketSheet({ cart, onClose, onSet }: { cart: Cart; onClose: () => void; onSet: (d: Cart['discount']) => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const [digits, setDigits] = useState('');
  const limit = s.settings.cashier_discount_limit;
  const cur = cart.discount;
  return (
    <Sheet title="Discount on the whole basket" sub="Spread across the lines, so each line's VAT stays right. Tap a line for a discount on one item." onClose={onClose} width={520}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {[0, 5, 10, 15, 20].map((v) => (
          <button key={v} type="button" className={(cur?.kind === 'percent' && cur.value === v) || (!cur && v === 0) ? 'chip on' : 'chip'} onClick={() => onSet(v ? { kind: 'percent', value: v } : null)}>
            {v ? `${v}%` : 'None'}
            {v > limit ? ' · PIN' : ''}
          </button>
        ))}
      </div>
      <span className="label">Or an amount off</span>
      <div className="field num" style={{ fontSize: 20, fontWeight: 700 }}>{m(padCents(digits))}</div>
      <Keypad onKey={(k) => setDigits((x) => typeKey(x, k, 6))} height={50} />
      <button type="button" className="btn go" onClick={() => onSet(padCents(digits) ? { kind: 'amount', value: padCents(digits) } : null)}>
        Take {m(padCents(digits))} off
      </button>
    </Sheet>
  );
}

const CASH_REASONS = { in: ['Change from bank', 'Float top-up', 'Other'], out: ['Safe drop', 'Pay a supplier', 'Other'] };

export function CashSheet({ user, shift, onClose }: { user: PublicUser; shift: Shift; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const approve = useApproval();
  const m = (c: number) => money(c, s.settings.currency);
  const [kind, setKind] = useState<'in' | 'out'>('out');
  const [digits, setDigits] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const amount = padCents(digits);
  const z = useMemo(() => drawerNow(s, shift), [s, s.version, shift]);
  const after = kind === 'in' ? z + amount : z - amount;
  const tooMuch = kind === 'out' && amount > z;
  async function go() {
    if (tooMuch) return toast(`There is only ${m(z)} in the drawer.`, 'bad');
    const why = reason === 'Other' ? other : reason;
    let by: string | null = null;
    if (!can(user.role, 'cash_move')) {
      const a = await approve('cash_move', `Cash ${kind} ${m(amount)}`, 'Cash in and out needs a supervisor PIN.');
      if (!a) return;
      by = a.name;
    }
    try {
      s.cashMove(shift.id, kind, amount, why, user, by);
      toast(`Cash ${kind} ${m(amount)} recorded.`);
      onClose();
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }
  return (
    <Sheet title="Cash in or out" onClose={onClose} width={760}>
      <div className="row" style={{ alignItems: 'stretch', gap: 20 }}>
        <div className="col grow" style={{ gap: 14 }}>
          <div className="seg">
            <button type="button" className={kind === 'in' ? 'on' : ''} onClick={() => setKind('in')}>
              Cash in
            </button>
            <button type="button" className={kind === 'out' ? 'on' : ''} onClick={() => setKind('out')}>
              Cash out
            </button>
          </div>
          <div>
            <span className="label">Amount</span>
            <div className="field num" style={{ fontSize: 24, fontWeight: 800, height: 56 }}>{m(amount)}</div>
          </div>
          <div>
            <span className="label">Reason</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {CASH_REASONS[kind].map((r) => (
                <button key={r} type="button" className={reason === r ? 'chip on' : 'chip'} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Other' && (
              <label className="field" style={{ marginTop: 8 }}>
                <input autoFocus aria-label="Reason" placeholder="What is it for?" value={other} onChange={(e) => setOther(e.target.value)} />
              </label>
            )}
          </div>
          <div className="panel" style={{ padding: '4px 16px' }}>
            <div className="row" style={{ padding: '8px 0' }}>
              <span className="mut grow">Cash in drawer now</span>
              <b className="num">{m(z)}</b>
            </div>
            <div className="row" style={{ padding: '8px 0', borderTop: '1px solid #EDEFEB' }}>
              <span className="mut grow">After this</span>
              <b className="num" style={{ color: after < 0 ? '#B42318' : undefined }}>{tooMuch ? 'More than is in the drawer' : m(after)}</b>
            </div>
          </div>
          <div className="mut small">{can(user.role, 'cash_move') ? 'Shows on the X and Z reports.' : 'Needs a supervisor PIN. Shows on the X and Z reports.'}</div>
        </div>
        <div className="col" style={{ width: 300, gap: 10 }}>
          <Keypad onKey={(k) => setDigits((x) => typeKey(x, k, 7))} />
          <button type="button" className="btn go xl" disabled={!amount || tooMuch || !(reason && (reason !== 'Other' || other.trim()))} style={{ opacity: amount && reason && !tooMuch ? 1 : 0.5, fontSize: 18 }} onClick={go}>
            {kind === 'in' ? 'Put in' : 'Take out'} {m(amount)}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function drawerNow(s: Store, shift: Shift): number {
  return zReport(s.shiftSales(shift.id), shift, s.cashMoves(shift.id)).expected_cash;
}

