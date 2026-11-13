/** Returns: find the receipt, pick what comes back, or take a return without a receipt with a PIN. */
import { useState } from 'react';
import { fiscal, fmtDateTime, useStore } from '../app/state';
import { fiscalModule } from '../fiscal';
import { returnedSoFar, returnLines, vatOf } from '../domain/cart';
import { money, qtyLabel } from '../domain/money';
import { can } from '../domain/permissions';
import type { Product, PublicUser, Sale, SaleLine, Shift } from '../domain/types';
import { Icon } from '../ui/icons';
import { errText, Toggle, useApproval, useToast } from '../ui/kit';
import { TillBar } from './frame';
import { SearchSheet } from './Sale';

const REASONS = ['Damaged', 'Past best-before', 'Wrong item', 'Changed mind'];

export function Return({ user, shift, onBack, onDone }: { user: PublicUser; shift: Shift; onBack: () => void; onDone: (r: Sale) => void }) {
  const s = useStore();
  const toast = useToast();
  const approve = useApproval();
  const m = (c: number) => money(c, s.settings.currency);
  const [mode, setMode] = useState<'receipt' | 'none'>('receipt');
  const [q, setQ] = useState('');
  const [orig, setOrig] = useState<Sale | null>(null);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [loose, setLoose] = useState<{ p: Product; qty: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [restock, setRestock] = useState(true);
  const [noReceiptBy, setNoReceiptBy] = useState<string | null>(null);

  const already = orig ? returnedSoFar(orig.lines, s.returnsOf(orig.id)) : [];
  const left = orig ? s.returnable(orig) : [];
  const lines: SaleLine[] = orig
    ? returnLines(orig.lines, Object.entries(picks).map(([i, qty]) => ({ index: Number(i), qty })), already)
    : loose.map(({ p, qty }) => ({ product_id: p.id, name: p.name, barcode: p.barcode, unit: p.unit, qty: -qty, price: p.price, cost: p.cost, vat_rate: p.vat_rate, discount: 0, total: -Math.round(p.price * qty) }));
  const total = -lines.reduce((a, l) => a + l.total, 0);
  const vatBack = lines.reduce((a, l) => a + vatOf(-l.total, l.vat_rate), 0);
  const tooOld = orig ? (Date.now() - new Date(orig.created_at).getTime()) / 864e5 > s.settings.returns_days : false;

  function find() {
    const hit = s.findReceipt(q);
    if (!hit || hit.kind !== 'sale') return toast(`No sale with receipt ${q}.`, 'bad');
    setOrig(hit);
    setPicks({});
    setMethod(hit.payments.some((p) => p.method === 'card') ? 'card' : 'cash');
  }

  async function noReceipt() {
    // ATK: a refund coupon must point to the original fiscal receipt
    if (s.settings.fiscal_provider === 'xk-atk') return toast('In Kosovo a refund needs the original receipt number.', 'bad');
    const a = await approve('return', 'Return without a receipt', 'A return without a receipt always needs a supervisor.');
    if (!a) return;
    setNoReceiptBy(a.name);
    setMode('none');
    setOrig(null);
    setMethod('cash');
  }

  async function refund() {
    if (!reason) return toast('Pick a reason.', 'bad');
    let by = noReceiptBy;
    if (!by && (!can(user.role, 'return') || tooOld)) {
      const a = await approve('return', `Refund ${m(total)}`, tooOld ? `This receipt is older than ${s.settings.returns_days} days.` : 'Returns need a supervisor PIN.');
      if (!a) return;
      by = a.name;
    }
    try {
      const r = s.recordReturn({ original: orig, lines, method, cashier: user, shiftId: shift.id, approvedBy: by ?? (can(user.role, 'return') ? user.name : null), reason, restock });
      if (fiscalModule(r.fiscal.provider).sign) await fiscal.settle(r.id);
      else fiscal.kick();
      onDone(r);
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }

  const step = (i: number, d: number) => {
    const l = orig!.lines[i];
    const max = left[i];
    const inc = l.unit === 'kg' ? max : 1;
    const cur = picks[i] ?? 0;
    const next = Math.max(0, Math.min(max, d > 0 ? cur + inc : cur - inc));
    setPicks({ ...picks, [i]: Math.round(next * 1000) / 1000 });
  };

  return (
    <>
      <TillBar title="Return" sub={`Till ${s.settings.till_no} · ${user.name}`} onBack={onBack} />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 20, gap: 14, minWidth: 0 }}>
          <div className="row">
            <form className="grow" onSubmit={(e) => { e.preventDefault(); setMode('receipt'); find(); }}>
              <label className="field" style={{ height: 52 }}>
                <Icon n="receipt" />
                <input autoFocus aria-label="Receipt number" placeholder="Scan or type the receipt number, e.g. 1-0418" value={q} onChange={(e) => setQ(e.target.value)} />
                <button type="submit" className="btn soft" style={{ height: 38 }}>
                  Find
                </button>
              </label>
            </form>
            <button type="button" className={mode === 'none' ? 'btn go' : 'btn'} style={{ height: 52 }} onClick={noReceipt}>
              No receipt · PIN
            </button>
          </div>
          {mode === 'receipt' && orig && (
            <>
              <div className="mut small">
                Receipt {s.receiptNo(orig)} · {fmtDateTime(orig.created_at)} · {orig.cashier_name} · paid by {orig.payments.map((p) => p.method).join(' + ')}
                {tooOld ? ` · older than ${s.settings.returns_days} days, needs a supervisor` : ''}
              </div>
              <div className="panel" style={{ flex: 1, overflow: 'auto' }}>
                {orig.lines.map((l, i) => (
                  <div key={i} className="line">
                    <div className="grow">
                      <b>{l.name}</b>
                      <div className="mut small num">
                        {qtyLabel(l.qty, l.unit)} bought · paid {m(l.total)}
                        {already[i] ? ` · ${qtyLabel(already[i], l.unit)} already returned` : ''}
                      </div>
                    </div>
                    {left[i] > 0 ? (
                      <div className="row" style={{ gap: 0, border: '1px solid #D3D8D2', borderRadius: 10, height: 40 }}>
                        <button type="button" aria-label={`One less ${l.name}`} style={st} onClick={() => step(i, -1)}>
                          −
                        </button>
                        <span className="num" style={{ minWidth: 46, textAlign: 'center', fontWeight: 700 }}>{l.unit === 'kg' ? (picks[i] ?? 0).toFixed(3) : picks[i] ?? 0}</span>
                        <button type="button" aria-label={`One more ${l.name}`} style={st} onClick={() => step(i, 1)}>
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="tag">Returned</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mut small">You can't return more than was sold. Each line refunds what the customer actually paid, discounts included.</div>
            </>
          )}
          {mode === 'receipt' && !orig && <div className="col mut" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>Find the receipt to see what was bought.</div>}
          {mode === 'none' && (
            <>
              <div className="row">
                <span className="tag a">Approved by {noReceiptBy}</span>
                <span className="mut small grow">Refunded at today's shelf price.</span>
                <button type="button" className="btn soft" onClick={() => setSearching(true)}>
                  <Icon n="plus" sm /> Add item
                </button>
              </div>
              <div className="panel" style={{ flex: 1, overflow: 'auto' }}>
                {loose.length === 0 && <div className="mut" style={{ padding: 18 }}>Add what the customer brought back.</div>}
                {loose.map((x, i) => (
                  <div key={i} className="line">
                    <div className="grow">
                      <b>{x.p.name}</b>
                      <div className="mut small num">{m(x.p.price)}{x.p.unit === 'kg' ? '/kg' : ''}</div>
                    </div>
                    <div className="row" style={{ gap: 0, border: '1px solid #D3D8D2', borderRadius: 10, height: 40 }}>
                      <button type="button" style={st} aria-label="One less" onClick={() => setLoose(loose.flatMap((y, j) => (j !== i ? [y] : y.qty > 1 ? [{ ...y, qty: y.qty - 1 }] : [])))}>
                        −
                      </button>
                      <span className="num" style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>{x.qty}</span>
                      <button type="button" style={st} aria-label="One more" onClick={() => setLoose(loose.map((y, j) => (j === i ? { ...y, qty: y.qty + 1 } : y)))}>
                        +
                      </button>
                    </div>
                    <b className="num" style={{ width: 80, textAlign: 'right' }}>{m(Math.round(x.p.price * x.qty))}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="col" style={{ width: 400, gap: 12 }}>
          <div className="total">
            <div className="mut" style={{ fontWeight: 600 }}>Refund</div>
            <div className="num" style={{ fontSize: 52, lineHeight: '60px', fontWeight: 800 }}>{m(total)}</div>
            <div className="mut small num">
              {lines.length} line{lines.length === 1 ? '' : 's'} · VAT back {m(vatBack)}
            </div>
          </div>
          <div>
            <span className="label">Reason</span>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {REASONS.map((r) => (
                <button key={r} type="button" className={reason === r ? 'chip on' : 'chip'} onClick={() => { setReason(r); if (r === 'Damaged' || r === 'Past best-before') setRestock(false); }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Refund to</span>
            <div className="seg">
              <button type="button" className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')} disabled={!orig}>
                Card{orig?.payments.some((p) => p.method === 'card') ? ' (original)' : ''}
              </button>
              <button type="button" className={method === 'cash' ? 'on' : ''} onClick={() => setMethod('cash')}>
                Cash
              </button>
            </div>
          </div>
          <div className="row panel" style={{ padding: '12px 14px' }}>
            <div className="grow">
              <b>Back into stock</b>
              <div className="mut small">Off for damaged goods: they go to waste instead.</div>
            </div>
            <Toggle on={restock} onChange={setRestock} label="Back into stock" />
          </div>
          <div className="grow" />
          <button type="button" className="btn go xl" disabled={!lines.length} style={{ opacity: lines.length ? 1 : 0.5 }} onClick={refund}>
            Refund {m(total)}
          </button>
          <div className="mut small" style={{ textAlign: 'center' }}>Prints a refund receipt{s.settings.fiscal_provider !== 'none' ? ' and registers it with the tax authority' : ''}.</div>
        </div>
      </div>
      {searching && (
        <SearchSheet
          onClose={() => setSearching(false)}
          onPick={(p) => {
            setLoose([...loose, { p, qty: 1 }]);
            setSearching(false);
          }}
        />
      )}
    </>
  );
}

const st: React.CSSProperties = { width: 40, height: 38, border: 0, background: 'transparent', font: 'inherit', fontSize: 20, fontWeight: 600, color: '#16201B', cursor: 'pointer' };
