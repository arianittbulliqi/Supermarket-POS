import { Link } from 'react-router-dom';
import { fmtTime, useOnline, useStore } from '../app/state';
import { qtyLabel } from '../domain/money';
import { buckets, byProduct, inRange, lowStock, periodStart, summary } from '../domain/reports';
import type { PublicUser } from '../domain/types';
import { fiscalModule } from '../fiscal';
import { Bars } from './Reports';
import { Empty, Top, useMoney } from './ui';

export function Dashboard({ user }: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const online = useOnline();
  const today = inRange(s.sales, periodStart('day'));
  const yest = inRange(s.sales, new Date(periodStart('day').getTime() - 864e5), periodStart('day'));
  const t = summary(today);
  const y = summary(yest);
  const low = lowStock(s.products);
  const top = byProduct(today.filter((x) => x.kind === 'sale')).slice(0, 6);
  const open = s.shifts.filter((x) => !x.closed_at);
  const waiting = s.pendingFiscal();
  const mod = fiscalModule(s.settings.fiscal_provider);
  const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}% vs yesterday` : 'No sales yesterday');
  return (
    <>
      <Top title="Dashboard" sub={`Today · ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} · hello ${user.name}`}>
        <Link className="btn" to="/office/reports">
          Full reports
        </Link>
      </Top>
      {s.products.length === 0 && (
        <div className="card row" style={{ padding: 18, background: '#E6F3EC', borderColor: '#E6F3EC' }}>
          <div className="grow">
            <b>No products yet.</b> Import your price list, add products one by one, or load the sample store to try everything.
          </div>
          <Link className="btn go" to="/office/import">
            Import products
          </Link>
          <Link className="btn" to="/office/settings">
            Load sample store
          </Link>
        </div>
      )}
      <div className="kpis">
        <div className="kpi">
          <span className="mut small">Takings</span>
          <span className="v">{m(t.takings)}</span>
          <span className="mut small">{delta(t.takings, y.takings)}</span>
        </div>
        <div className="kpi">
          <span className="mut small">Receipts</span>
          <span className="v">{t.receipts}</span>
          <span className="mut small">{t.returns} returns · {m(t.refunded)} refunded</span>
        </div>
        <div className="kpi">
          <span className="mut small">Average basket</span>
          <span className="v">{m(t.basket)}</span>
          <span className="mut small">Yesterday {m(y.basket)}</span>
        </div>
        <div className="kpi">
          <span className="mut small">Gross margin</span>
          <span className="v">{m(t.margin)}</span>
          <span className="mut small">{t.net ? `${Math.round((t.margin / t.net) * 100)}% of net sales` : '—'}</span>
        </div>
      </div>
      <div className="split">
        <div className="main col" style={{ gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 className="h2 grow">Takings by hour</h2>
              <span className="mut small">Cash {m(t.cash)} · Card {m(t.card)}</span>
            </div>
            <Bars data={buckets(today, 'day')} money={m} />
          </div>
          <div className="card">
            <div className="row" style={{ padding: '14px 16px' }}>
              <h2 className="h2 grow">Best sellers today</h2>
            </div>
            {top.length === 0 ? (
              <Empty>No sales yet today.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="r">Sold</th>
                    <th className="r">Takings</th>
                    <th className="r">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={r.product_id}>
                      <td>{r.name}</td>
                      <td className="r num">{qtyLabel(r.qty, r.unit)}</td>
                      <td className="r num">{m(r.revenue)}</td>
                      <td className="r num">{Math.round(r.marginRate * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="aside col" style={{ gap: 18 }}>
          <div className="card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ marginBottom: 8 }}>Tills and tax</h2>
            <div className="kv">
              <span>Connection</span>
              <b>{online ? <span className="tag g">Online</span> : <span className="tag a">Offline</span>}</b>
            </div>
            <div className="kv">
              <span>Fiscal module</span>
              <b>{mod.name}{mod.test ? ' (test)' : ''}</b>
            </div>
            <div className="kv">
              <span>Receipts waiting to send</span>
              <b>{waiting.length ? <span className="tag a">{waiting.length}</span> : '0'}</b>
            </div>
            {open.map((sh) => (
              <div key={sh.id} className="kv">
                <span>Till {sh.till_no ?? s.settings.till_no} · {sh.cashier_name}</span>
                <b>open since {fmtTime(sh.opened_at)}</b>
              </div>
            ))}
            {open.length === 0 && (
              <div className="kv">
                <span>Open shifts</span>
                <b>None</b>
              </div>
            )}
          </div>
          <div className="card">
            <div className="row" style={{ padding: '14px 16px' }}>
              <h2 className="h2 grow">Low stock</h2>
              <Link className="btn" to="/office/stock">
                Stock
              </Link>
            </div>
            {low.length === 0 ? (
              <Empty>Nothing is running low.</Empty>
            ) : (
              <table>
                <tbody>
                  {low.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="r num">
                        <span className={p.stock <= 0 ? 'tag r' : 'tag a'}>{qtyLabel(p.stock, p.unit)}</span>
                      </td>
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
