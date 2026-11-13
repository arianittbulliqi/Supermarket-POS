/** Shared pieces: sheets, the number pad, PIN entry, supervisor approval and toasts. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../domain/permissions';
import type { PublicUser } from '../domain/types';
import { store } from '../app/state';
import { Icon } from './icons';

export function Sheet({ title, sub, onClose, children, width = 560, right, foot }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; children: ReactNode; width?: number; right?: boolean; foot?: ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={right ? 'scrim right' : 'scrim'} style={{ zIndex: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={{ width, maxHeight: right ? undefined : 'calc(100% - 40px)', overflow: 'auto' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <h2 className="h2">{title}</h2>
            {sub && <div className="mut small" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          {onClose && (
            <button className="x" type="button" aria-label="Close" onClick={onClose}>
              <Icon n="x" sm />
            </button>
          )}
        </div>
        {children}
        {foot && <div className="row" style={{ marginTop: 'auto' }}>{foot}</div>}
      </div>
    </div>
  );
}

/** A 3 × 4 number pad. `dot` adds a decimal key; otherwise the left key is 00. */
export function Keypad({ onKey, dot, height = 60 }: { onKey: (k: string) => void; dot?: boolean; height?: number }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', dot ? '.' : '00', '0', 'del'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
      {keys.map((k) => (
        <button key={k} type="button" className={k === 'del' ? 'key fn' : 'key'} style={{ height }} aria-label={k === 'del' ? 'Delete' : k} onClick={() => onKey(k)}>
          {k === 'del' ? <Icon n="del" /> : k}
        </button>
      ))}
    </div>
  );
}

/** Applies a keypad key to typed text (with an optional length limit). */
export function typeKey(text: string, k: string, max = 12): string {
  if (k === 'del') return text.slice(0, -1);
  if (k === '.' && text.includes('.')) return text;
  return (text + k).slice(0, max);
}

/** Cents typed on a pad as whole digits: "1250" is €12.50. */
export const padCents = (digits: string) => (digits ? parseInt(digits, 10) : 0);

export function PinDots({ n, len = 4, error }: { n: number; len?: number; error?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 14 }} aria-label={`${n} of ${len} digits`}>
      {Array.from({ length: len }, (_, i) => (
        <span key={i} style={{ width: 16, height: 16, borderRadius: 99, border: `2px solid ${error ? '#B42318' : '#16201B'}`, background: i < n ? (error ? '#B42318' : '#16201B') : 'transparent' }} />
      ))}
    </div>
  );
}

/** A PIN pad that also takes typing from a keyboard. Calls onPin with 4 digits. */
export function PinPad({ onPin, error, height = 64 }: { onPin: (pin: string) => boolean | void; error?: string | null; height?: number }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  const push = useCallback(
    (k: string) => {
      setBad(false);
      setPin((p) => {
        const next = k === 'del' ? p.slice(0, -1) : k === '00' ? p : (p + k).slice(0, 4);
        if (next.length === 4) {
          setTimeout(() => {
            const ok = onPin(next);
            if (ok === false) setBad(true);
            setPin('');
          }, 60);
        }
        return next;
      });
    },
    [onPin],
  );
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === 'Backspace') push('del');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [push]);
  return (
    <div className="col" style={{ gap: 16 }}>
      <PinDots n={pin.length} error={bad} />
      <div className="small" style={{ textAlign: 'center', minHeight: 17, color: '#B42318', fontWeight: 600 }}>{bad ? error || 'That PIN is not right. Try again.' : ''}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={k} type="button" className={k === 'del' ? 'key fn' : 'key'} style={{ height }} aria-label={k === 'del' ? 'Delete' : k} onClick={() => push(k)}>
              {k === 'del' ? <Icon n="del" /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/* ── supervisor approval ─────────────────────────────────────────────────── */

type Ask = { action: Action; title: string; detail: string; resolve: (u: PublicUser | null) => void };
const ApprovalCtx = createContext<(action: Action, title: string, detail: string) => Promise<PublicUser | null>>(async () => null);

/** Supervisor PIN, asked on the spot. Resolves with the approver, or null if cancelled. */
export const useApproval = () => useContext(ApprovalCtx);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const request = useCallback((action: Action, title: string, detail: string) => new Promise<PublicUser | null>((resolve) => setAsk({ action, title, detail, resolve })), []);
  const done = (u: PublicUser | null) => {
    ask?.resolve(u);
    setAsk(null);
  };
  return (
    <ApprovalCtx.Provider value={request}>
      {children}
      {ask && (
        <Sheet title="Supervisor approval" sub={ask.title} onClose={() => done(null)} width={420}>
          <div className="row" style={{ background: '#FFF4E0', color: '#8A4B00', borderRadius: 12, padding: '10px 14px', gap: 10 }}>
            <Icon n="shield" sm />
            <span className="small" style={{ fontWeight: 600 }}>{ask.detail}</span>
          </div>
          <PinPad
            error="Not a supervisor or manager PIN."
            onPin={(pin) => {
              const u = store.approve(pin, ask.action);
              if (!u) return false;
              done(u);
            }}
          />
        </Sheet>
      )}
    </ApprovalCtx.Provider>
  );
}

/* ── toasts ──────────────────────────────────────────────────────────────── */

const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    setT({ text, tone, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 100, background: t.tone === 'bad' ? '#B42318' : '#16201B', color: '#fff', padding: '12px 18px', borderRadius: 12, fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 600, fontSize: 15, boxShadow: '0 10px 30px rgba(0,0,0,.3)', maxWidth: 560 }}>
          {t.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer' }}>
      <span className={on ? 'sw on' : 'sw'} />
    </button>
  );
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
