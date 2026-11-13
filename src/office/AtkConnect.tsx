/** Settings › Tax and fiscal, Kosovo: test or production, and connecting this till to ATK. */
import { useState } from 'react';
import { useStore } from '../app/state';
import type { PublicUser, Settings } from '../domain/types';
import { ATK_URL } from '../fiscal/xk/api';
import { missing, sefId, xkConfig } from '../fiscal/xk/coupon';
import { connectToAtk } from '../fiscal/xk/onboard';
import { errText, useToast } from '../ui/kit';

export function AtkConnect({ f, setConfig, user }: { f: Settings; setConfig: (c: Record<string, string>) => void; user: PublicUser }) {
  const s = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cfg = xkConfig(f);
  const connected = !!cfg.cert;
  const gaps = missing(cfg);
  if (!cfg.fiscal_no) gaps.push('Fiscalization number');

  const setEnv = (env: 'test' | 'prod') => {
    if (env === cfg.env) return;
    // a certificate belongs to one environment: switching means connecting again
    setConfig({ ...f.fiscal_config, env, cert: '', business_name: '' });
  };

  async function connect(newKey: boolean) {
    setBusy(true);
    try {
      const r = await connectToAtk(f, { newKey });
      const next = { ...f.fiscal_config, env: cfg.env, cert: r.cert, business_name: r.business_name };
      setConfig(next);
      s.saveSettings({ ...f, fiscal_config: next }, user);
      toast(`Connected to ATK: ${r.business_name}`);
    } catch (e) {
      toast(errText(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card col" style={{ padding: 18, gap: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <b className="grow">ATK connection</b>
        {connected ? <span className="tag g">Connected · {cfg.env === 'test' ? 'Test' : 'Production'}</span> : <span className="tag a">Not connected</span>}
      </div>
      <div className="tabs row" style={{ gap: 6 }}>
        {(
          [
            ['test', 'Test environment'],
            ['prod', 'Production'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={cfg.env === k ? 'on' : ''} onClick={() => setEnv(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mut small">
        {cfg.env === 'test'
          ? `Receipts go to ATK's test service (${ATK_URL.test}) and print "AMBIENTI TESTUES · JO FISKAL". Use this until ATK certifies the software.`
          : `Receipts go to ATK (${ATK_URL.prod}) and are real fiscal receipts. Only allowed once ATK has certified the software.`}
      </div>
      {connected && (
        <div className="kv">
          <span>Business · SEF number</span>
          <b>
            {cfg.business_name} · {sefId(cfg)}
          </b>
        </div>
      )}
      {gaps.length > 0 && <div className="mut small">To connect, fill in: {gaps.join(', ')}. The business number (NUI) is in Store details.</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn go" disabled={busy || gaps.length > 0} style={{ opacity: busy || gaps.length ? 0.5 : 1 }} onClick={() => void connect(false)}>
          {busy ? 'Connecting…' : connected ? 'Connect again' : 'Connect to ATK'}
        </button>
        {connected && (
          <button type="button" className="btn" disabled={busy} onClick={() => void connect(true)}>
            New key and certificate
          </button>
        )}
      </div>
      <div className="mut small">This till makes its own signing key, which never leaves this device. Each till is connected on its own, with its own POS ID.</div>
    </div>
  );
}
