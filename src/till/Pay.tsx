/** Taking payment (cash, card or both) and the receipt screen after it. */
import { useEffect, useState } from 'react';
import { fiscal, fmtTime, useStore } from '../app/state';
import { totals } from '../domain/cart';
import { money } from '../domain/money';
import { quickCash, settle } from '../domain/payment';
import type { Cart, PublicUser, Sale, Shift } from '../domain/types';
import { fiscalModule } from '../fiscal';
import { printLines, receiptLines } from '../print/receipt';
import { Icon } from '../ui/icons';
import { errText, padCents, typeKey, useToast } from '../ui/kit';
import { Paper } from '../ui/paper';
import { TillBar } from './frame';

type Method = 'cash' | 'card' | 'split';

export function Payment({ user, shift, cart, approvedBy, onBack, onPaid }: { user: PublicUser; shift: Shift; cart: Cart; approvedBy: string | null; onBack: () => void; onPaid: (s: Sale) => void }) {
  const s = useStore();
  const toast = useToast();
  const m = (c: number) => money(c, s.settings.currency);
  const t = totals(cart);
  const [method, setMethod] = useState<Method>('cash');
  const [cashDigits, setCashDigits] = useState('');
  const [cardDigits, setCardDigits] = useState('');
  const [focus, setFocus] = useState<'cash' | 'card'>('cash');
  const cash = method === 'card' ? 0 : padCents(cashDigits);
  const card = method === 'card' ? t.total : method === 'split' ? padCents(cardDigits) : 0;
  const st = settle(t.total, { cash, card });

  function finish(c = cash, k = card) {
    const r = settle(t.total, { cash: c, card: k });
    if (!r.ok) return toast(k > t.total ? 'The card part is more than the total.' : `Still to pay ${m(r.due)}.`, 'bad');
    try {
      const sale = s.recordSale({ totals: t, payments: r.payments, cash_given: c, change: r.change, cashier: user, shift_id: shift.id, approved_by: approvedBy });
      fiscal.kick();
      onPaid(sale);
    } catch (e) {
      toast(errText(e), 'bad');
    }
  }

  const key = (k: string) => {
    const f = method === 'split' ? focus : 'cash';
    (f === 'cash' ? setCashDigits : setCardDigits)((x) => (k === 'clear' ? '' : typeKey(x, k, 7)));
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Enter') finish();
      else if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <>
      <TillBar title="Payment" sub={`Till ${s.settings.till_no} · ${user.name} · ${t.items} items`} onBack={onBack} />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 20, gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
            {(
              [
                ['cash', 'Cash', 'cash'],
                ['card', 'Card', 'card'],
                ['split', 'Card + cash', 'stack'],
              ] as [Method, string, string][]
            ).map(([k, label, ic]) => (
              <button key={k} type="button" onClick={() => { setMethod(k); setFocus(k === 'split' ? 'card' : 'cash'); }} style={{ height: 64, borderRadius: 14, border: `2px solid ${method === k ? '#0B7A47' : '#E1E4DF'}`, background: method === k ? '#E6F3EC' : '#fff', color: method === k ? '#0A6B3E' : '#16201B', font: 'inherit', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
                <Icon n={ic} /> {label}
              </button>
            ))}
          </div>
          {method === 'card' ? (
            <div className="col" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
              <Icon n="card" style={{ width: 56, height: 56 }} />
              <h2 className="h2" style={{ fontSize: 24 }}>Ask the customer to tap or insert their card</h2>
              <div className="mut" style={{ maxWidth: 520 }}>
                Charge <b className="num">{m(t.total)}</b> on the card terminal. When it shows approved, tap the button. (This version doesn't talk to the terminal yet, so nothing is charged from here.)
              </div>
              <button type="button" className="btn go xl" style={{ width: 420 }} onClick={() => finish(0, t.total)}>
                Card approved · {m(t.total)}
              </button>
            </div>
          ) : (
            <>
              {method === 'split' && (
                <div className="row">
                  <button type="button" className="field num grow" style={{ borderColor: focus === 'card' ? '#0B7A47' : undefined, fontSize: 18, fontWeight: 700, cursor: 'pointer' }} onClick={() => setFocus('card')}>
                    <Icon n="card" sm /> On card: {m(card)}
                  </button>
                  <button type="button" className="field num grow" style={{ borderColor: focus === 'cash' ? '#0B7A47' : undefined, fontSize: 18, fontWeight: 700, cursor: 'pointer' }} onClick={() => setFocus('cash')}>
                    <Icon n="cash" sm /> Cash given: {m(cash)}
                  </button>
                </div>
              )}
              <div>
                <span className="label">{method === 'split' && focus === 'card' ? 'Amount on card' : 'Cash given'}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                  {quickCash(Math.max(0, t.total - card)).map((v, i) => (
                    <button key={v} type="button" onClick={() => { setFocus('cash'); setCashDigits(String(v)); }} style={{ height: 64, borderRadius: 12, border: '1px solid #D3D8D2', background: cash === v ? '#16201B' : '#fff', color: cash === v ? '#fff' : '#16201B', font: 'inherit', fontSize: 20, fontWeight: 700, cursor: 'pointer' }} className="num">
                      {i === 0 ? `Exact ${m(v)}` : m(v)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
                {['7', '8', '9', 'clear', '4', '5', '6', 'del', '1', '2', '3', '00', '0'].map((k) => (
                  <button key={k} type="button" className={k === 'clear' || k === 'del' ? 'key fn' : 'key'} style={k === '0' ? { gridColumn: 'span 2' } : undefined} onClick={() => key(k)} aria-label={k === 'del' ? 'Delete' : k}>
                    {k === 'clear' ? 'Clear' : k === 'del' ? 'Delete' : k}
                  </button>
                ))}
                <button type="button" className="btn go" style={{ height: 60, gridColumn: 'span 2', fontSize: 18 }} onClick={() => finish()}>
                  Done
                </button>
              </div>
            </>
          )}
        </div>
        <div className="col" style={{ width: 400, gap: 12 }}>
          <div className="total">
            <div className="mut" style={{ fontWeight: 600 }}>To pay</div>
            <div className="num" style={{ fontSize: 56, lineHeight: '64px', fontWeight: 800, letterSpacing: -1.2 }}>{m(t.total)}</div>
            <div className="mut small num">VAT incl. {m(t.vat.reduce((a, v) => a + v.vat, 0))}{t.discount ? ` · saved ${m(t.discount)}` : ''}</div>
          </div>
          <div className="panel" style={{ padding: 18 }}>
            {st.ok ? (
              <>
                <div className="mut" style={{ fontWeight: 600 }}>Change to give</div>
                <div className="num" style={{ fontSize: 44, lineHeight: '52px', fontWeight: 800, color: '#0B7A47' }}>{m(st.change)}</div>
              </>
            ) : (
              <>
                <div className="mut" style={{ fontWeight: 600 }}>Still to pay</div>
                <div className="num" style={{ fontSize: 44, lineHeight: '52px', fontWeight: 800, color: '#8A4B00' }}>{m(st.due)}</div>
              </>
            )}
            <div className="mut small num">
              {method !== 'card' ? `Cash given ${m(cash)}` : 'Card'}
              {method === 'split' ? ` · card ${m(card)}` : ''}
            </div>
          </div>
          <div className="grow" />
          {method !== 'card' && (
            <button type="button" className="btn go xl" disabled={!st.ok} style={{ opacity: st.ok ? 1 : 0.5 }} onClick={() => finish()}>
              Complete sale
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function ReceiptScreen({ sale, user, onNew }: { sale: Sale; user: PublicUser; onNew: () => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const live = s.sale(sale.id) ?? sale;
  const mod = fiscalModule(live.fiscal.provider);
  const lines = receiptLines(live, s.settings);
  const [printed, setPrinted] = useState(false);
  const cashPaid = live.payments.find((p) => p.method === 'cash');
  const isReturn = live.kind === 'return';
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Enter' && onNew();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onNew]);
  const fiscalState =
    live.fiscal.status === 'off' ? ['Tax registration is off for this store', 'tag', 'Off'] : live.fiscal.status === 'done' ? [`Registered with the tax authority${mod.test ? ' (test mode)' : ''}`, 'tag g', 'Done'] : live.fiscal.status === 'failed' ? [`Not registered yet: ${live.fiscal.error ?? 'error'}. Retrying.`, 'tag r', 'Retrying'] : ['Sending to the tax authority', 'tag a', 'Waiting'];
  return (
    <>
      <TillBar sub={`Till ${s.settings.till_no} · ${user.name}`} />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 24, gap: 18 }}>
          <div>
            <h1 className="h1">
              {isReturn ? 'Refunded' : 'Paid'} · receipt {s.receiptNo(live)}
            </h1>
            <div className="mut num">
              {live.payments.map((p) => `${p.method === 'cash' ? 'Cash' : 'Card'} ${m(p.method === 'cash' && !isReturn ? live.cash_given || p.amount : p.amount)}`).join(' + ')} · {live.lines.length} lines · {fmtTime(live.created_at)}
            </div>
          </div>
          <div className="total" style={{ padding: '22px 24px' }}>
            <div className="mut" style={{ fontWeight: 600 }}>{isReturn ? 'Give back to the customer' : 'Give change'}</div>
            <div className="num" data-testid="change" style={{ fontSize: 72, lineHeight: '80px', fontWeight: 800, letterSpacing: -1.5 }}>
              {isReturn ? m(-live.total) : m(cashPaid ? live.change : 0)}
            </div>
          </div>
          <div className="panel">
            {(
              [
                [`Receipt ${printed ? 'printed' : 'ready to print'} (${s.settings.paper_width} mm)`, printed ? 'tag g' : 'tag', printed ? 'Done' : 'Not yet'],
                fiscalState,
                ['Saved on this till', 'tag g', 'Done'],
              ] as string[][]
            ).map(([a, cls, b]) => (
              <div key={a} className="line">
                <span className="grow">{a}</span>
                <span className={cls}>{b}</span>
              </div>
            ))}
          </div>
          <div className="grow" />
          <div className="row">
            <button type="button" className="btn grow" style={{ height: 64 }} onClick={() => { printLines(lines, s.settings.paper_width); setPrinted(true); }}>
              <Icon n="print" /> {printed ? 'Reprint receipt' : 'Print receipt'}
            </button>
            <button type="button" className="btn go xl grow" onClick={onNew}>
              New sale
            </button>
          </div>
        </div>
        <div className="col" style={{ width: 380, alignItems: 'center', overflow: 'auto', paddingTop: 4 }}>
          <Paper lines={lines} width={s.settings.paper_width === 58 ? 250 : 320} />
        </div>
      </div>
    </>
  );
}
