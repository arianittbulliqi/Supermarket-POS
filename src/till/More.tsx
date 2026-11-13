/** More: X report, reprint, devices, void the sale, and closing the shift with the Z report. */
import { useState } from 'react';
import { fiscal, fmtTime, useOnline, useStore } from '../app/state';
import { lineAfterDiscount } from '../domain/cart';
import { money } from '../domain/money';
import { can } from '../domain/permissions';
import { zReport, type ZReport } from '../domain/reports';
import type { Cart, PublicUser, Shift } from '../domain/types';
import { fiscalModule } from '../fiscal';
import { printLines, receiptLines, reportLines } from '../print/receipt';
import { Icon } from '../ui/icons';
import { useApproval, useToast } from '../ui/kit';
import { CashSheet } from './Sale';
import { countTotal, DenomGrid, KV, TillBar, type Counts } from './frame';

type Pane = 'x' | 'devices';

export function More({ user, shift, cart, onBack, onClearCart, onClose }: { user: PublicUser; shift: Shift; cart: Cart; onBack: () => void; onClearCart: () => void; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const approve = useApproval();
  const [pane, setPane] = useState<Pane>('x');
  const [cash, setCash] = useState(false);
  const last = [...s.shiftSales(shift.id)].reverse()[0];
  const menu = (id: Pane | null, ic: string, label: string, fn: () => void) => (
    <button key={label} type="button" onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 16px', borderRadius: 12, border: 0, background: id && pane === id ? '#E6F3EC' : 'transparent', color: id && pane === id ? '#0A6B3E' : '#16201B', font: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
      <Icon n={ic} /> {label}
    </button>
  );
  async function voidSale() {
    if (!cart.lines.length) return toast('The basket is already empty.');
    let by: string | null = null;
    if (!can(user.role, 'clear_cart')) {
      const a = await approve('clear_cart', 'Void the whole sale', 'Clearing a basket needs a supervisor.');
      if (!a) return;
      by = a.name;
    }
    const value = cart.lines.reduce((a, l) => a + lineAfterDiscount(l), 0);
    s.recordVoid(shift.id, value, `Voided sale of ${cart.lines.length} lines · ${(value / 100).toFixed(2)}`, user, by);
    onClearCart();
    toast('Sale voided.');
    onBack();
  }
  return (
    <>
      <TillBar title="More" sub={`Till ${s.settings.till_no} · ${user.name}`} onBack={onBack} />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ width: 300, padding: 10, gap: 2 }}>
          {menu('x', 'chart', 'X report', () => setPane('x'))}
          {menu(null, 'cash', 'Cash in and out', () => setCash(true))}
          {menu(null, 'print', 'Reprint last receipt', () => {
            if (!last) return toast('No receipt on this shift yet.');
            printLines(receiptLines(last, s.settings, true), s.settings.paper_width);
          })}
          {menu('devices', 'cog', 'Devices', () => setPane('devices'))}
          {menu(null, 'x', 'Void this sale', voidSale)}
          <div className="grow" />
          <button type="button" className="btn warn" style={{ height: 56 }} onClick={onClose}>
            <Icon n="out" /> Close shift
          </button>
        </div>
        <div className="panel col" style={{ flex: 1, padding: 22, gap: 12, overflow: 'auto' }}>{pane === 'x' ? <XPane user={user} shift={shift} /> : <Devices />}</div>
      </div>
      {cash && <CashSheet user={user} shift={shift} onClose={() => setCash(false)} />}
    </>
  );
}

export function ZBody({ z }: { z: ZReport }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const VC: Record<number, string> = { 8: 'A', 18: 'B', 0: 'C' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
      <div>
        <div className="cap" style={{ marginBottom: 4 }}>Sales</div>
        <KV k="Gross sales" v={m(z.summary.gross)} />
        <KV k={`Discounts · ${z.summary.discounted}`} v={`−${m(z.summary.discounts)}`} />
        <KV k={`Returns · ${z.summary.returns}`} v={`−${m(z.summary.refunded)}`} />
        <KV k={`Voided lines · ${z.voids}`} v={m(z.voids_value)} />
        <KV k="Net sales" v={m(z.summary.takings)} strong />
        <div className="cap" style={{ margin: '14px 0 4px' }}>VAT</div>
        {z.vat.length === 0 && <KV k="No sales yet" v="—" />}
        {z.vat.map((v) => (
          <KV key={v.rate} k={`${VC[v.rate]} ${v.rate}% · gross ${m(v.gross)}`} v={m(v.vat)} />
        ))}
      </div>
      <div>
        <div className="cap" style={{ marginBottom: 4 }}>Payments</div>
        <KV k="Cash" v={m(z.summary.cash)} />
        <KV k="Card" v={m(z.summary.card)} />
        <div className="cap" style={{ margin: '14px 0 4px' }}>Cash drawer</div>
        <KV k="Opening float" v={m(z.opening_cash)} />
        <KV k="Cash sales less refunds" v={m(z.summary.cash)} />
        <KV k={`Cash in · ${z.cash_in_count}`} v={m(z.cash_in)} />
        <KV k={`Cash out · ${z.cash_out_count}`} v={`−${m(z.cash_out)}`} />
        <KV k="Should be in drawer" v={m(z.expected_cash)} strong />
        {z.counted_cash != null && (
          <>
            <KV k="Counted" v={m(z.counted_cash)} />
            <KV k="Difference" v={<span style={{ color: z.difference ? '#B42318' : '#0A6B3E' }}>{z.difference === 0 ? 'Exact' : `${z.difference! > 0 ? '+' : ''}${m(z.difference!)}`}</span>} strong />
          </>
        )}
      </div>
    </div>
  );
}

function XPane({ user, shift }: { user: PublicUser; shift: Shift }) {
  const s = useStore();
  const sales = s.shiftSales(shift.id);
  const z = zReport(sales, shift, s.cashMoves(shift.id));
  return (
    <>
      <div className="row">
        <div className="grow">
          <h2 className="h2">X report</h2>
          <div className="mut small">
            Shift so far · {user.name} · Till {s.settings.till_no} · since {fmtTime(shift.opened_at)} · {z.summary.receipts} sales. Doesn't close anything.
          </div>
        </div>
        <button type="button" className="btn" onClick={() => printLines(reportLines(z, s.settings, 'X'), s.settings.paper_width)}>
          <Icon n="print" sm /> Print X report
        </button>
      </div>
      <ZBody z={z} />
    </>
  );
}

function Devices() {
  const s = useStore();
  const online = useOnline();
  const toast = useToast();
  const mod = fiscalModule(s.settings.fiscal_provider);
  const waiting = s.pendingFiscal().length;
  const devs: [string, string, string, string, string, (() => void) | null][] = [
    ['print', `Receipt printer (${s.settings.paper_width} mm)`, 'Uses the browser print dialog, or kiosk printing on a dedicated till', 'Ready', 'tag g', () => printLines([{ l: s.settings.store_name, center: true, bold: true }, { l: 'Printer test', center: true }, 'rule', { l: new Date().toLocaleString(), center: true }], s.settings.paper_width)],
    ['scan', 'Barcode scanner', 'Any USB or Bluetooth scanner that types like a keyboard', 'Ready', 'tag g', () => toast('Scan anything on the sale screen: it lands in the scan field.')],
    ['scale', 'Scale', 'Not connected yet: the cashier types the weight. Scale labels (20–29) scan directly.', 'Manual', 'tag a', null],
    ['card', 'Card terminal', 'Not connected yet: charge on the terminal, then confirm on the till', 'Manual', 'tag a', null],
    ['shield', `Fiscal: ${mod.name}`, mod.id === 'none' ? 'Turn on a country module in Back office → Settings' : `${mod.test ? 'Test mode, sends nothing · ' : ''}${waiting} waiting to send`, mod.id === 'none' ? 'Off' : online ? 'Connected' : 'Offline', mod.id === 'none' ? 'tag' : online ? 'tag g' : 'tag a', mod.id === 'none' ? null : () => void fiscal.run().then((n) => toast(`${n} receipt${n === 1 ? '' : 's'} sent.`))],
  ];
  return (
    <>
      <div>
        <h2 className="h2">Devices</h2>
        <div className="mut small">Everything this till uses. Tap Test to check one.</div>
      </div>
      <div className="panel">
        {devs.map(([ic, name, sub, state, cls, act]) => (
          <div key={name} className="row" style={{ gap: 14, padding: '14px 16px', borderTop: '1px solid #EDEFEB' }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: '#F4F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon n={ic} />
            </span>
            <div className="grow">
              <b>{name}</b>
              <div className="mut small">{sub}</div>
            </div>
            <span className={cls}>{state}</span>
            {act && (
              <button type="button" className="btn" style={{ height: 40 }} onClick={act}>
                {ic === 'shield' ? 'Send now' : 'Test'}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mut small">If the fiscal service is offline, sales keep going. Receipts are signed and sent automatically when it is back.</div>
    </>
  );
}

export function CloseShift({ user, shift, onBack, onClosed }: { user: PublicUser; shift: Shift; onBack: () => void; onClosed: () => void }) {
  const s = useStore();
  const m = (c: number) => money(c, s.settings.currency);
  const [counts, setCounts] = useState<Counts>({});
  const [floatLeft, setFloatLeft] = useState(String(s.settings.usual_float / 100));
  const [note, setNote] = useState('');
  const [done, setDone] = useState<Shift | null>(null);
  const counted = countTotal(counts);
  const parked = s.parked(user.id).length;

  if (done) {
    const z = zReport(s.shiftSales(done.id), done, s.cashMoves(done.id));
    return (
      <>
        <TillBar title="Shift closed" sub={`Till ${s.settings.till_no} · ${user.name} · Z #${String(done.z_number).padStart(4, '0')}`} />
        <div className="body">
          <div className="panel col" style={{ flex: 1, padding: 22, gap: 14, overflow: 'auto' }}>
            <div className="row">
              <div className="grow">
                <h1 className="h1">Z report #{String(done.z_number).padStart(4, '0')}</h1>
                <div className="mut">
                  {fmtTime(done.opened_at)} – {fmtTime(done.closed_at!)} · receipts {z.first_number ?? '—'} to {z.last_number ?? '—'} · leave {m(done.float_left ?? 0)} as tomorrow's float, the rest goes to the safe.
                </div>
              </div>
              <button type="button" className="btn" onClick={() => printLines(reportLines(z, s.settings, 'Z', done.z_number), s.settings.paper_width)}>
                <Icon n="print" /> Print Z report
              </button>
              <button type="button" className="btn go" onClick={onClosed}>
                Sign out
              </button>
            </div>
            <ZBody z={z} />
          </div>
        </div>
      </>
    );
  }

  const fl = Math.round(parseFloat(floatLeft.replace(',', '.') || '0') * 100);
  return (
    <>
      <TillBar title="Close shift" sub={`Till ${s.settings.till_no} · ${user.name}`} onBack={onBack} backLabel="Back" />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 20, gap: 12, overflow: 'auto' }}>
          <div>
            <h1 className="h1">Count the drawer</h1>
            <div className="mut">Count every note and coin without looking at the expected amount. The difference shows when you finish.</div>
          </div>
          <DenomGrid counts={counts} onChange={setCounts} money={m} compact />
        </div>
        <div className="col" style={{ width: 400, gap: 12 }}>
          <div className="total">
            <div className="mut" style={{ fontWeight: 600 }}>Counted cash</div>
            <div className="num" style={{ fontSize: 52, lineHeight: '60px', fontWeight: 800 }}>{m(counted)}</div>
          </div>
          <div className="panel col" style={{ padding: 16, gap: 8 }}>
            <span className="label" style={{ margin: 0 }}>Leave as tomorrow's float</span>
            <label className="field">
              {s.settings.currency}
              <input aria-label="Float to leave" inputMode="decimal" value={floatLeft} onChange={(e) => setFloatLeft(e.target.value)} />
            </label>
            <div className="mut small">The rest goes to the safe. Both amounts print on the Z report.</div>
          </div>
          <label className="field">
            <input aria-label="Note" placeholder="Note for the manager (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {parked > 0 && <div className="tag a" style={{ height: 'auto', padding: '8px 10px' }}>{parked} parked sale{parked === 1 ? '' : 's'} will be cleared.</div>}
          <div className="grow" />
          <button
            type="button"
            className="btn go xl"
            onClick={() => {
              const closed = s.closeShift(shift.id, counted, Math.min(fl, counted), note, user, null);
              setDone(closed);
            }}
          >
            Close shift and print Z
          </button>
        </div>
      </div>
    </>
  );
}
