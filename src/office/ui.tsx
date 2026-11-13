/** Small pieces shared by back-office pages. */
import type { ReactNode } from 'react';
import { useStore } from '../app/state';
import { money } from '../domain/money';

export function Top({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="top">
      <div className="grow">
        <h1 className="h1">{title}</h1>
        {sub && <div className="mut">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export function useMoney() {
  const s = useStore();
  return (c: number) => money(c, s.settings.currency);
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <div className="mut small" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Text({ value, onChange, placeholder, label, type = 'text', inputMode }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; type?: string; inputMode?: 'decimal' | 'numeric' | 'text' }) {
  return (
    <label className="field">
      <input aria-label={label} type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <label className="field">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="mut" style={{ padding: 24, textAlign: 'center' }}>{children}</div>;
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const toCents = (t: string): number | null => {
  const v = parseFloat(t.replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
};
export const fromCents = (c: number) => (c / 100).toFixed(2);
