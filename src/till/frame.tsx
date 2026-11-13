/** The till's fixed 1280 × 800 touch frame, scaled to fit the screen, and its top bar. */
import { useEffect, useState, type ReactNode } from 'react';
import { useClock, useOnline, useStore } from '../app/state';
import { Icon } from '../ui/icons';

export function TillFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 800));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0E1511', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ width: 1280 * scale, height: 800 * scale }}>
        <div className="t" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function NetPill() {
  const s = useStore();
  const online = useOnline();
  const waiting = s.pendingFiscal().length;
  const fiscalOn = s.settings.fiscal_provider !== 'none';
  if (!online)
    return (
      <span className="pill off">
        <i />
        Offline · selling{waiting ? `, ${waiting} waiting to send` : ''}
      </span>
    );
  if (waiting)
    return (
      <span className="pill off">
        <i />
        Online · {waiting} receipt{waiting === 1 ? '' : 's'} waiting
      </span>
    );
  return (
    <span className="pill on">
      <i />
      Online{fiscalOn ? ' · fiscal OK' : ''}
    </span>
  );
}

export function TillBar({ title, sub, onBack, backLabel = 'Back to sale', right }: { title?: ReactNode; sub?: ReactNode; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  const s = useStore();
  const clock = useClock();
  return (
    <div className="bar">
      {onBack ? (
        <button type="button" className="pill dark" style={{ border: 0, cursor: 'pointer', height: 32, fontSize: 14 }} onClick={onBack}>
          ‹ {backLabel}
        </button>
      ) : (
        <span className="logo">
          <Icon n="basket" sm />
        </span>
      )}
      <b>{title ?? s.settings.store_name}</b>
      {sub && <span className="mut">{sub}</span>}
      <span className="grow" />
      <NetPill />
      {right}
      <span className="num" style={{ fontWeight: 600 }}>{clock}</span>
    </div>
  );
}

/** Notes and coins, for counting the drawer. Values in cents. */
export const DENOMS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
export type Counts = Record<number, number>;
export const countTotal = (c: Counts) => DENOMS.reduce((a, d) => a + d * (c[d] ?? 0), 0);

export function DenomGrid({ counts, onChange, money, compact }: { counts: Counts; onChange: (c: Counts) => void; money: (c: number) => string; compact?: boolean }) {
  const label = (d: number) => (d >= 100 ? `€${d / 100}` : `${d}c`);
  const set = (d: number, n: number) => onChange({ ...counts, [d]: Math.max(0, n) });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
      {DENOMS.map((d) => (
        <div key={d} className="row" style={{ gap: 10, padding: compact ? '4px 12px' : '7px 14px', border: '1px solid #E1E4DF', borderRadius: 12, background: '#fff' }}>
          <div className="grow">
            <b style={{ fontSize: 17 }}>{label(d)}</b>
            <div className="mut small">{d >= 500 ? 'note' : 'coin'}</div>
          </div>
          <div className="row" style={{ gap: 0, border: '1px solid #D3D8D2', borderRadius: 10, height: 42 }}>
            <button type="button" aria-label={`One less ${label(d)}`} onClick={() => set(d, (counts[d] ?? 0) - 1)} style={stepBtn}>
              −
            </button>
            <input
              aria-label={`${label(d)} count`}
              className="num"
              value={counts[d] ?? 0}
              onChange={(e) => set(d, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
              onFocus={(e) => e.target.select()}
              style={{ width: 44, textAlign: 'center', border: 0, font: 'inherit', fontWeight: 700, fontSize: 17, outline: 0 }}
            />
            <button type="button" aria-label={`One more ${label(d)}`} onClick={() => set(d, (counts[d] ?? 0) + 1)} style={stepBtn}>
              +
            </button>
          </div>
          <span className="num" style={{ width: 84, textAlign: 'right', fontWeight: 600 }}>{money(d * (counts[d] ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 42, height: 40, border: 0, background: 'transparent', font: 'inherit', fontSize: 22, fontWeight: 600, color: '#16201B', cursor: 'pointer' };

export function KV({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '8px 0', borderTop: '1px solid #EDEFEB', fontWeight: strong ? 700 : undefined }}>
      <span style={{ flex: 1, color: strong ? undefined : '#5B665F' }}>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
}
