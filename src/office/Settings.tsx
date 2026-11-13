/** Store, tax and fiscal module, receipt, scale barcodes, cash, and data (import, export, backup, sample). */
import { useState } from 'react';
import { fiscal, useStore } from '../app/state';
import type { PublicUser, Settings } from '../domain/types';
import { FISCAL_MODULES, fiscalModule } from '../fiscal';
import { printLines, receiptLines } from '../print/receipt';
import { loadSample, SAMPLE_PINS } from '../store/sample';
import { Icon } from '../ui/icons';
import { errText, Toggle, useToast } from '../ui/kit';
import { Paper } from '../ui/paper';
import { AtkConnect } from './AtkConnect';
import { downloadText, Field, fromCents, Text, toCents, Top } from './ui';
import type { Sale } from '../domain/types';

type Tab = 'store' | 'tax' | 'receipt' | 'scale' | 'data';

export function SettingsPage({ user }: { user: PublicUser }) {
  const s = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('store');
  const [f, setF] = useState<Settings>({ ...s.settings, fiscal_config: { ...s.settings.fiscal_config } });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF({ ...f, [k]: v });
  const dirty = JSON.stringify(f) !== JSON.stringify(s.settings);
  const mod = fiscalModule(f.fiscal_provider);
  const save = () => {
    s.saveSettings(f, user);
    if (f.fiscal_provider !== 'none') fiscal.kick();
    toast('Settings saved.');
  };
  const demo: Sale = {
    id: 'demo', number: 418, till_no: f.till_no, kind: 'sale', ref_sale_id: null, ref_number: null, created_at: new Date().toISOString(), cashier_id: user.id, cashier_name: user.name, shift_id: '',
    lines: [
      { product_id: 'a', name: 'Whole milk 1 L', barcode: null, unit: 'pcs', qty: 2, price: 99, cost: 60, vat_rate: 8, discount: 0, total: 198 },
      { product_id: 'b', name: 'Bananas', barcode: null, unit: 'kg', qty: 1.245, price: 129, cost: 70, vat_rate: 8, discount: 0, total: 161 },
      { product_id: 'c', name: 'Dish soap 500 ml', barcode: null, unit: 'pcs', qty: 1, price: 189, cost: 100, vat_rate: 18, discount: 0, total: 189 },
    ],
    subtotal: 548, discount: 0, total: 548,
    vat: [
      { rate: 8, gross: 359, net: 332, vat: 27 },
      { rate: 18, gross: 189, net: 160, vat: 29 },
    ],
    payments: [{ method: 'cash', amount: 548 }], cash_given: 1000, change: 452, approved_by: null,
    daily_no: 1,
    fiscal: { status: f.fiscal_provider === 'none' ? 'off' : 'done', provider: f.fiscal_provider, code: f.fiscal_provider === 'none' ? null : 'DEMO2345DEMO2345', qr: f.fiscal_provider === 'xk-atk' ? 'DEMO RECEIPT · NOT FISCAL' : null, error: null, attempts: 1 },
  };
  return (
    <>
      <Top title="Settings" sub={`Till ${s.settings.till_no} · changes apply on this device straight away`}>
        <button type="button" className="btn" disabled={!dirty} onClick={() => setF({ ...s.settings })}>
          Undo changes
        </button>
        <button type="button" className="btn go" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.5 }} onClick={save}>
          Save
        </button>
      </Top>
      <div className="tabs">
        {(
          [
            ['store', 'Store and till'],
            ['tax', 'Tax and fiscal'],
            ['receipt', 'Receipt'],
            ['scale', 'Scale barcodes'],
            ['data', 'Data and backup'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'store' && (
        <div className="card form" style={{ padding: 18 }}>
          <Field label="Store name">
            <Text label="Store name" value={f.store_name} onChange={(v) => set('store_name', v)} />
          </Field>
          <Field label="Address">
            <Text label="Address" value={f.address} onChange={(v) => set('address', v)} placeholder="Street, city" />
          </Field>
          <Field label="Business no. (NUI / NIPT / PIB)">
            <Text label="Business no." value={f.business_no} onChange={(v) => set('business_no', v)} />
          </Field>
          <Field label="Currency symbol">
            <Text label="Currency" value={f.currency} onChange={(v) => set('currency', v)} />
          </Field>
          <Field label="This till's number" hint='Printed on receipts as "1-0418"'>
            <Text label="Till number" value={String(f.till_no)} onChange={(v) => set('till_no', Math.max(1, parseInt(v, 10) || 1))} inputMode="numeric" />
          </Field>
          <Field label="Usual float" hint="Suggested when opening and closing a shift">
            <Text label="Usual float" value={fromCents(f.usual_float)} onChange={(v) => set('usual_float', toCents(v) ?? 0)} inputMode="decimal" />
          </Field>
          <Field label="Cashier discount limit (%)" hint="Above this a supervisor types their PIN">
            <Text label="Discount limit" value={String(f.cashier_discount_limit)} onChange={(v) => set('cashier_discount_limit', Math.min(100, Math.max(0, parseInt(v, 10) || 0)))} inputMode="numeric" />
          </Field>
          <Field label="Returns allowed for (days)" hint="Older receipts need a supervisor">
            <Text label="Return days" value={String(f.returns_days)} onChange={(v) => set('returns_days', Math.max(0, parseInt(v, 10) || 0))} inputMode="numeric" />
          </Field>
        </div>
      )}
      {tab === 'tax' && (
        <div className="split">
          <div className="main col" style={{ gap: 14 }}>
            <div className="card">
              {FISCAL_MODULES.map((x) => (
                <button key={x.id} type="button" onClick={() => set('fiscal_provider', x.id)} className="row" style={{ width: '100%', padding: '14px 16px', border: 0, borderTop: x.id === 'none' ? 0 : '1px solid #EDEFEB', background: f.fiscal_provider === x.id ? '#E6F3EC' : '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <span className={f.fiscal_provider === x.id ? 'ck on' : 'ck'}>{f.fiscal_provider === x.id && <Icon n="check" sm />}</span>
                  <div className="grow">
                    <b>{x.name}</b> {x.test && <span className="tag a">Test adapter</span>}
                    <div className="mut small">{x.how}</div>
                  </div>
                </button>
              ))}
            </div>
            {mod.id === 'xk-atk' && <AtkConnect f={f} user={user} setConfig={(c) => set('fiscal_config', c)} />}
            {mod.fields.length > 0 && (
              <div className="card form" style={{ padding: 18 }}>
                {mod.fields.map((fl) => (
                  <Field key={fl.key} label={fl.label}>
                    <Text label={fl.label} value={f.fiscal_config[fl.key] ?? ''} onChange={(v) => set('fiscal_config', { ...f.fiscal_config, [fl.key]: v })} placeholder={fl.placeholder} />
                  </Field>
                ))}
              </div>
            )}
            <div className="card row" style={{ padding: '14px 16px' }}>
              <div className="grow">
                <b>Keep selling offline</b>
                <div className="mut small">Receipts are saved and sent to the tax service when the connection is back.</div>
              </div>
              <Toggle on={f.offline_selling} onChange={(v) => set('offline_selling', v)} label="Keep selling offline" />
            </div>
          </div>
          <div className="aside card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ marginBottom: 6 }}>VAT rates</h2>
            <div className="kv"><span>D · reduced (basic food, medicine)</span><b>8%</b></div>
            <div className="kv"><span>E · standard</span><b>18%</b></div>
            <div className="kv"><span>C · zero rate</span><b>0%</b></div>
            <div className="mut small" style={{ marginTop: 10 }}>
              Prices include VAT. The letters are ATK's (A exempt, C 0%, D 8%, E 18%). Each receipt line shows its letter, and receipts and Z reports carry the VAT per rate. Kosovo is the real ATK connection; Albania and Serbia are still test adapters that send nothing.
            </div>
          </div>
        </div>
      )}
      {tab === 'receipt' && (
        <div className="split">
          <div className="main card col" style={{ padding: 18, gap: 14 }}>
            <Field label="Paper width">
              <div className="seg">
                {([80, 58] as const).map((w) => (
                  <button key={w} type="button" className={f.paper_width === w ? 'on' : ''} onClick={() => set('paper_width', w)}>
                    {w} mm
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Message at the bottom">
              <Text label="Receipt footer" value={f.receipt_footer} onChange={(v) => set('receipt_footer', v)} />
            </Field>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => printLines(receiptLines(demo, f), f.paper_width)}>
              <Icon n="print" sm /> Print a test receipt
            </button>
          </div>
          <div className="aside" style={{ display: 'flex', justifyContent: 'center' }}>
            <Paper lines={receiptLines(demo, f)} width={f.paper_width === 58 ? 250 : 320} />
          </div>
        </div>
      )}
      {tab === 'scale' && (
        <div className="card col" style={{ padding: 18, gap: 14 }}>
          <div className="mut">
            In-store scale labels are EAN-13 barcodes: two-digit prefix, five-digit PLU, five digits of weight in grams (or price in cents), and a check digit. For example <span className="num">21 04011 01245 C</span> is 1.245 kg of PLU 4011.
          </div>
          <div className="form">
            <Field label="Weight label prefixes" hint="Comma separated">
              <Text label="Weight prefixes" value={f.weight_prefixes.join(', ')} onChange={(v) => set('weight_prefixes', v.split(/[,\s]+/).filter((x) => /^\d{2}$/.test(x)))} />
            </Field>
            <Field label="Price label prefixes" hint="Comma separated">
              <Text label="Price prefixes" value={f.price_prefixes.join(', ')} onChange={(v) => set('price_prefixes', v.split(/[,\s]+/).filter((x) => /^\d{2}$/.test(x)))} />
            </Field>
          </div>
        </div>
      )}
      {tab === 'data' && <DataTab user={user} />}
    </>
  );
}

function DataTab({ user }: { user: PublicUser }) {
  const s = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid2">
      <div className="card col" style={{ padding: 18, gap: 10 }}>
        <h2 className="h2">Backup</h2>
        <div className="mut small">Everything on this device in one file: products, sales, shifts, staff and settings. Keep a copy somewhere safe.</div>
        <button type="button" className="btn go" onClick={() => downloadText(`pos-backup-${new Date().toISOString().slice(0, 10)}.json`, s.exportJson(), 'application/json')}>
          <Icon n="download" sm /> Download backup
        </button>
        <label className="btn">
          <Icon n="upload" sm /> Restore from a backup (replaces everything here)
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await s.restoreJson(await file.text(), user);
                toast('Backup restored.');
              } catch (err) {
                toast(errText(err), 'bad');
              }
            }}
          />
        </label>
      </div>
      <div className="card col" style={{ padding: 18, gap: 10 }}>
        <h2 className="h2">Sample store</h2>
        <div className="mut small">
          Adds about 40 grocery products, 7 suppliers, three staff and two weeks of sales, to try every screen. Staff PINs: {SAMPLE_PINS}.
        </div>
        {confirm ? (
          <div className="row">
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn go grow"
              onClick={() => {
                try {
                  loadSample(s, user);
                  toast('Sample store loaded.');
                } catch (e) {
                  toast(errText(e), 'bad');
                }
                setConfirm(false);
              }}
            >
              Yes, add sample data
            </button>
          </div>
        ) : (
          <button type="button" className="btn" disabled={s.products.length > 0} onClick={() => setConfirm(true)} title={s.products.length ? 'Only on an empty store' : undefined}>
            Load sample store{s.products.length ? ' (only on an empty store)' : ''}
          </button>
        )}
      </div>
      <div className="card col" style={{ padding: 18, gap: 10 }}>
        <h2 className="h2">Where the data lives</h2>
        <div className="mut small">
          This version keeps everything on this device (in the browser's storage), so it works with no internet at all. There is no cloud sync between tills yet: back up daily.
        </div>
        <div className="kv small">
          <span>Products</span>
          <b>{s.products.length}</b>
        </div>
        <div className="kv small">
          <span>Receipts</span>
          <b>{s.sales.length}</b>
        </div>
        <div className="kv small">
          <span>Backup size</span>
          <b>{Math.round(s.exportJson().length / 1024)} KB</b>
        </div>
      </div>
    </div>
  );
}
