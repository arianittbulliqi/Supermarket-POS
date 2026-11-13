/** Sales, VAT, categories, products, payments and cashiers for a day, week or month. */
import { useState } from 'react';
import { useStore } from '../app/state';
import { qtyLabel } from '../domain/money';
import { buckets, byCashier, byCategory, byProduct, inRange, periodStart, summary, type Bucket, type Period } from '../domain/reports';
import { vatBreakdown } from '../domain/cart';
import { VAT_CODE, type PublicUser } from '../domain/types';
import { Icon } from '../ui/icons';
import { downloadText, Empty, Top, useMoney } from './ui';

export function Bars({ data, money }: { data: Bucket[]; money: (c: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((a, d) => (d.value > a ? d.value : a), 0);
  return (
    <div className="bars" role="img" aria-label="Takings chart">
      {data.map((d) => (
        <div key={d.label + d.start.toISOString()} title={`${d.label}: ${money(d.value)}`}>
          <i className={d.value === peak && peak > 0 ? '' : 'lo'} style={{ height: `${Math.max(0, (d.value / max) * 100)}%` }} />
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

type Tab = 'sales' | 'vat' | 'categories' | 'products' | 'cashiers';

export function Reports(_: { user: PublicUser }) {
  const s = useStore();
  const m = useMoney();
  const [period, setPeriod] = useState<Period>('week');
  const [tab, setTab] = useState<Tab>('sales');
  const sales = inRange(s.sales, periodStart(period));
  const sum = summary(sales);
  const vat = vatBreakdown(sales.flatMap((x) => x.lines));
  const cats = byCategory(sales, s.products);
  const prods = byProduct(sales);
  const people = byCashier(sales);
  function csv() {
    const rows: (string | number)[][] =
      tab === 'vat'
        ? [['rate', 'gross', 'net', 'vat'], ...vat.map((v) => [v.rate, v.gross / 100, v.net / 100, v.vat / 100])]
        : tab === 'categories'
          ? [['category', 'takings', 'margin', 'margin_rate'], ...cats.map((c) => [c.category, c.revenue / 100, c.margin / 100, Math.round(c.marginRate * 1000) / 10])]
          : tab === 'cashiers'
            ? [['cashier', 'receipts', 'returns', 'takings'], ...people.map((c) => [c.name, c.receipts, c.returns, c.takings / 100])]
            : [['product', 'qty', 'takings', 'margin'], ...prods.map((p) => [p.name, p.qty, p.revenue / 100, p.margin / 100])];
    downloadText(`report-${tab}-${period}.csv`, rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n'), 'text/csv');
  }
  return (
    <>
      <Top title="Reports" sub={`Since ${periodStart(period).toLocaleDateString()} · ${sum.receipts} receipts`}>
        <div className="seg">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} type="button" className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
              {p === 'day' ? 'Today' : p === 'week' ? 'This week' : 'This month'}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={csv}>
          <Icon n="download" sm /> Export CSV
        </button>
      </Top>
      <div className="kpis">
        <div className="kpi">
          <span className="mut small">Takings</span>
          <span className="v">{m(sum.takings)}</span>
          <span className="mut small">Gross {m(sum.gross)} before discounts and returns</span>
        </div>
        <div className="kpi">
          <span className="mut small">Net of VAT</span>
          <span className="v">{m(sum.net)}</span>
          <span className="mut small">VAT {m(sum.vat)}</span>
        </div>
        <div className="kpi">
          <span className="mut small">Gross margin</span>
          <span className="v">{m(sum.margin)}</span>
          <span className="mut small">{sum.net ? `${Math.round((sum.margin / sum.net) * 100)}% of net` : '—'}</span>
        </div>
        <div className="kpi">
          <span className="mut small">Discounts · returns</span>
          <span className="v">{m(sum.discounts)}</span>
          <span className="mut small">{sum.returns} returns · {m(sum.refunded)}</span>
        </div>
      </div>
      <div className="tabs">
        {(
          [
            ['sales', 'Sales'],
            ['vat', 'VAT'],
            ['categories', 'Categories'],
            ['products', 'Products'],
            ['cashiers', 'Payments and cashiers'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'sales' && (
        <div className="card" style={{ padding: 18 }}>
          <Bars data={buckets(sales, period)} money={m} />
        </div>
      )}
      {tab === 'vat' && (
        <div className="card scroll">
          {vat.length === 0 ? (
            <Empty>No sales in this period.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rate</th>
                  <th className="r">Gross</th>
                  <th className="r">Net</th>
                  <th className="r">VAT</th>
                </tr>
              </thead>
              <tbody>
                {vat.map((v) => (
                  <tr key={v.rate}>
                    <td>
                      {VAT_CODE[v.rate]} · {v.rate}%
                    </td>
                    <td className="r num">{m(v.gross)}</td>
                    <td className="r num">{m(v.net)}</td>
                    <td className="r num">{m(v.vat)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td className="r num"><b>{m(vat.reduce((a, v) => a + v.gross, 0))}</b></td>
                  <td className="r num"><b>{m(vat.reduce((a, v) => a + v.net, 0))}</b></td>
                  <td className="r num"><b>{m(vat.reduce((a, v) => a + v.vat, 0))}</b></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'categories' && (
        <div className="card scroll">
          {cats.length === 0 ? (
            <Empty>No sales in this period.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="r">Takings</th>
                  <th className="r">Margin</th>
                  <th className="r">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="r num">{m(c.revenue)}</td>
                    <td className="r num">{m(c.margin)}</td>
                    <td className="r num">{Math.round(c.marginRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'products' && (
        <div className="card scroll">
          {prods.length === 0 ? (
            <Empty>No sales in this period.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="r">Sold</th>
                  <th className="r">Takings</th>
                  <th className="r">Margin</th>
                  <th className="r">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {prods.slice(0, 100).map((p) => (
                  <tr key={p.product_id}>
                    <td>{p.name}</td>
                    <td className="r num">{qtyLabel(p.qty, p.unit)}</td>
                    <td className="r num">{m(p.revenue)}</td>
                    <td className="r num">{m(p.margin)}</td>
                    <td className="r num">{Math.round(p.marginRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'cashiers' && (
        <div className="grid2">
          <div className="card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ marginBottom: 6 }}>Payments</h2>
            <div className="kv">
              <span>Cash (less cash refunds)</span>
              <b>{m(sum.cash)}</b>
            </div>
            <div className="kv">
              <span>Card</span>
              <b>{m(sum.card)}</b>
            </div>
            <div className="kv">
              <span>Average basket</span>
              <b>{m(sum.basket)}</b>
            </div>
          </div>
          <div className="card scroll">
            <table>
              <thead>
                <tr>
                  <th>Cashier</th>
                  <th className="r">Receipts</th>
                  <th className="r">Returns</th>
                  <th className="r">Takings</th>
                </tr>
              </thead>
              <tbody>
                {people.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="r num">{c.receipts}</td>
                    <td className="r num">{c.returns}</td>
                    <td className="r num">{m(c.takings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {people.length === 0 && <Empty>No sales in this period.</Empty>}
          </div>
        </div>
      )}
    </>
  );
}
