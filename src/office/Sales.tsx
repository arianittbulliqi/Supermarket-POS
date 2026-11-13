/** Receipts (find, view, reprint) and shifts with their Z reports. */
import { useState } from 'react';
import { fiscal, fmtDateTime, fmtTime, useStore } from '../app/state';
import { zReport } from '../domain/reports';
import type { PublicUser, Sale, Shift } from '../domain/types';
import { fiscalModule } from '../fiscal';
import { printLines, receiptLines, reportLines } from '../print/receipt';
import { ZBody } from '../till/More';
import { Icon } from '../ui/icons';
import { Sheet } from '../ui/kit';
import { Paper } from '../ui/paper';
import { Empty, Top, useMoney } from './ui';

const FISCAL_TAG: Record<Sale['fiscal']['status'], [string, string]> = { off: ['tag', 'Off'], pending: ['tag a', 'Waiting'], done: ['tag g', 'Registered'], failed: ['tag r', 'Failed'] };

export function Receipts(_: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'sale' | 'return' | 'fiscal'>('all');
  const [day, setDay] = useState('');
  const [open, setOpen] = useState<Sale | null>(null);
  const [limit, setLimit] = useState(100);
  const ql = q.trim().toLowerCase();
  const list = [...s.sales]
    .reverse()
    .filter((x) => (kind === 'all' ? true : kind === 'fiscal' ? x.fiscal.status === 'pending' || x.fiscal.status === 'failed' : x.kind === kind))
    .filter((x) => !day || x.created_at.slice(0, 10) === day)
    .filter((x) => !ql || s.receiptNo(x).includes(ql) || String(x.number) === ql || x.cashier_name.toLowerCase().includes(ql) || x.lines.some((l) => l.name.toLowerCase().includes(ql) || l.barcode === ql));
  return (
    <>
      <Top title="Receipts" sub={`${s.sales.length} on this device`}>
        <button type="button" className="btn" onClick={() => void fiscal.run()}>
          <Icon n="upload" sm /> Send waiting receipts ({s.pendingFiscal().length})
        </button>
      </Top>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <label className="field" style={{ width: 320, maxWidth: '100%' }}>
          <Icon n="search" sm />
          <input aria-label="Find a receipt" placeholder="Receipt no., cashier, product or barcode" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field" style={{ width: 180 }}>
          <input aria-label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <div className="seg">
          {(
            [
              ['all', 'All'],
              ['sale', 'Sales'],
              ['return', 'Returns'],
              ['fiscal', 'Not registered'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="card scroll">
        {list.length === 0 ? (
          <Empty>No receipts match.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Cashier</th>
                <th className="r">Lines</th>
                <th>Paid by</th>
                <th>Tax</th>
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((x) => (
                <tr key={x.id} className="click" onClick={() => setOpen(x)}>
                  <td>
                    <button type="button" className="rowlink num">{s.receiptNo(x)}</button> {x.kind === 'return' && <span className="tag r">Return</span>}
                  </td>
                  <td className="num">{fmtDateTime(x.created_at)}</td>
                  <td>{x.cashier_name}</td>
                  <td className="r num">{x.lines.length}</td>
                  <td>{x.payments.map((p) => (p.method === 'cash' ? 'Cash' : 'Card')).join(' + ')}</td>
                  <td>
                    <span className={FISCAL_TAG[x.fiscal.status][0]}>{FISCAL_TAG[x.fiscal.status][1]}</span>
                  </td>
                  <td className="r num" style={{ fontWeight: 600 }}>{m(x.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.length > limit && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button type="button" className="btn" onClick={() => setLimit(limit + 200)}>
              Show more ({list.length - limit} left)
            </button>
          </div>
        )}
      </div>
      {open && <ReceiptSheet sale={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReceiptSheet({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const s = useStore();
  const m = useMoney();
  const live = s.sale(sale.id) ?? sale;
  const lines = receiptLines(live, s.settings, true);
  const returns = s.returnsOf(live.id);
  const mod = fiscalModule(live.fiscal.provider);
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={`Receipt ${s.receiptNo(live)}`} sub={`${fmtDateTime(live.created_at)} · ${live.cashier_name}${live.approved_by ? ` · approved by ${live.approved_by}` : ''}`} onClose={onClose} right width={480}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className={FISCAL_TAG[live.fiscal.status][0]}>{FISCAL_TAG[live.fiscal.status][1]}</span>
          {live.fiscal.code && <span className="tag num">{mod.codeLabel} {live.fiscal.code.slice(0, 18)}</span>}
          {live.fiscal.error && <span className="tag r">{live.fiscal.error}</span>}
          {live.ref_number != null && <span className="tag">Refund for {live.till_no ?? s.settings.till_no}-{String(live.ref_number).padStart(4, '0')}</span>}
          {returns.length > 0 && <span className="tag a">{returns.length} return{returns.length > 1 ? 's' : ''} · {m(-returns.reduce((a, r) => a + r.total, 0))}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', background: '#F4F5F2', padding: 16, borderRadius: 12 }}>
          <Paper lines={lines} />
        </div>
        <button type="button" className="btn go" onClick={() => printLines(lines, s.settings.paper_width)}>
          <Icon n="print" sm /> Print a copy
        </button>
      </Sheet>
    </div>
  );
}

export function Shifts(_: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [open, setOpen] = useState<Shift | null>(null);
  const list = [...s.shifts].reverse();
  return (
    <>
      <Top title="Shifts and Z reports" sub="Every shift with its cash count. Open one for the full Z report." />
      <div className="card scroll">
        {list.length === 0 ? (
          <Empty>No shifts yet. A shift opens when a cashier counts the float on the till.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Z</th>
                <th>Cashier</th>
                <th>Opened</th>
                <th>Closed</th>
                <th className="r">Takings</th>
                <th className="r">Expected cash</th>
                <th className="r">Counted</th>
                <th className="r">Difference</th>
              </tr>
            </thead>
            <tbody>
              {list.map((sh) => {
                const z = zReport(s.shiftSales(sh.id), sh, s.cashMoves(sh.id));
                return (
                  <tr key={sh.id} className="click" onClick={() => setOpen(sh)}>
                    <td className="num">{sh.z_number ? <button type="button" className="rowlink">#{String(sh.z_number).padStart(4, '0')}</button> : <span className="tag g">Open</span>}</td>
                    <td>
                      Till {sh.till_no ?? s.settings.till_no} · {sh.cashier_name}
                    </td>
                    <td className="num">{fmtDateTime(sh.opened_at)}</td>
                    <td className="num">{sh.closed_at ? fmtTime(sh.closed_at) : '—'}</td>
                    <td className="r num">{m(z.summary.takings)}</td>
                    <td className="r num">{m(z.expected_cash)}</td>
                    <td className="r num">{z.counted_cash != null ? m(z.counted_cash) : '—'}</td>
                    <td className="r num">{z.difference == null ? '—' : z.difference === 0 ? <span className="tag g">Exact</span> : <span className={Math.abs(z.difference) > 500 ? 'tag r' : 'tag a'}>{z.difference > 0 ? '+' : ''}{m(z.difference)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {open && <ZSheet shift={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ZSheet({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const s = useStore();
  const m = useMoney();
  const z = zReport(s.shiftSales(shift.id), shift, s.cashMoves(shift.id));
  const moves = s.cashMoves(shift.id);
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={shift.z_number ? `Z report #${String(shift.z_number).padStart(4, '0')}` : 'X report (shift still open)'} sub={`Till ${shift.till_no ?? s.settings.till_no} · ${shift.cashier_name} · ${fmtDateTime(shift.opened_at)}${shift.closed_at ? ` – ${fmtTime(shift.closed_at)}` : ''}`} onClose={onClose} width={820}>
        <ZBody z={z} />
        {shift.float_left != null && <div className="mut small">Left {m(shift.float_left)} as the next float.{shift.note ? ` Note: ${shift.note}` : ''}</div>}
        {moves.length > 0 && (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Cash in and out</th>
                  <th>By</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {fmtTime(c.created_at)} · {c.reason}
                    </td>
                    <td>
                      {c.user_name}
                      {c.approved_by ? ` · approved by ${c.approved_by}` : ''}
                    </td>
                    <td className="r num">{c.kind === 'in' ? '+' : '−'}{m(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn go" onClick={() => printLines(reportLines(z, s.settings, shift.z_number ? 'Z' : 'X', shift.z_number), s.settings.paper_width)}>
          <Icon n="print" sm /> Print
        </button>
      </Sheet>
    </div>
  );
}
