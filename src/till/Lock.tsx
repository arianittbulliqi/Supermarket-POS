/** Sign-in with name tiles and PIN, a new PIN on first sign-in, and opening the shift. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../app/state';
import { money } from '../domain/money';
import { ROLE_LABEL } from '../domain/permissions';
import type { PublicUser, Shift } from '../domain/types';
import { Icon } from '../ui/icons';
import { errText, PinPad } from '../ui/kit';
import { countTotal, DenomGrid, TillBar, type Counts } from './frame';
import { fmtTime } from '../app/state';

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Lock({ onSignedIn }: { onSignedIn: (u: PublicUser) => void }) {
  const s = useStore();
  const people = s.users.filter((u) => u.active);
  const [pick, setPick] = useState<PublicUser | null>(people.length === 1 ? people[0] : null);
  const waiting = s.pendingFiscal().length;
  return (
    <>
      <TillBar sub={`Till ${s.settings.till_no}`} />
      <div className="body" style={{ gap: 18, padding: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 24, gap: 18 }}>
          <div>
            <h1 className="h1">Who is working?</h1>
            <div className="mut">Tap your name, then type your PIN.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPick(p)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', borderRadius: 14, border: `2px solid ${pick?.id === p.id ? '#0B7A47' : '#E1E4DF'}`, background: pick?.id === p.id ? '#E6F3EC' : '#fff', font: 'inherit', color: '#16201B', cursor: 'pointer' }}
              >
                <span style={{ width: 56, height: 56, borderRadius: 99, background: '#16201B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20 }}>{initials(p.name)}</span>
                <b>{p.name}</b>
                <span className="mut small">{ROLE_LABEL[p.role]}{s.openShift(p.id) ? ' · on shift' : ''}</span>
              </button>
            ))}
          </div>
          <div className="grow" />
          <div className="row mut small" style={{ gap: 10 }}>
            <Icon n="wifi" sm />
            <span className="grow">
              The till keeps selling while offline. Receipts are sent to the tax service when the connection is back{waiting ? ` (${waiting} waiting now)` : ''}.
            </span>
            <Link className="btn" to="/office">
              <Icon n="chart" sm />
              Back office
            </Link>
          </div>
        </div>
        <div className="panel col" style={{ width: 400, padding: 24, gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 className="h2">{pick ? pick.name : 'Pick your name'}</h2>
            <div className="mut">Enter your 4-digit PIN</div>
          </div>
          <PinPad
            key={pick?.id ?? 'none'}
            onPin={(pin) => {
              const u = pick ? s.signInAs(pick.id, pin) : null;
              if (!u) return false;
              onSignedIn(u);
            }}
          />
        </div>
      </div>
    </>
  );
}

/** First sign-in on the starting PIN: choose a new one, twice. */
export function NewPin({ user, onDone, onCancel }: { user: PublicUser; onDone: () => void; onCancel: () => void }) {
  const s = useStore();
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <TillBar sub={user.name} onBack={onCancel} backLabel="Sign out" />
      <div className="body" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="panel col" style={{ width: 420, padding: 28, gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <h2 className="h2">{first ? 'Type it again' : 'Choose your own PIN'}</h2>
            <div className="mut">{first ? 'To be sure it is right.' : 'You are on the starting PIN 0000. Pick 4 digits only you know.'}</div>
          </div>
          <PinPad
            key={first ?? 'a'}
            error={err}
            onPin={(pin) => {
              if (!first) {
                if (pin === '0000') {
                  setErr('Pick something other than 0000.');
                  return false;
                }
                setFirst(pin);
                return;
              }
              if (pin !== first) {
                setErr('The two PINs are different. Start again.');
                setFirst(null);
                return false;
              }
              try {
                s.updateUser(user.id, {}, pin, user);
                onDone();
              } catch (e) {
                setErr(errText(e));
                setFirst(null);
                return false;
              }
            }}
          />
        </div>
      </div>
    </>
  );
}

export function OpenShift({ user, onOpened, onCancel }: { user: PublicUser; onOpened: (s: Shift) => void; onCancel: () => void }) {
  const s = useStore();
  const cur = s.settings.currency;
  const m = (c: number) => money(c, cur);
  const [counts, setCounts] = useState<Counts>({});
  const total = countTotal(counts);
  const last = s.lastClosed();
  const usual = s.settings.usual_float;
  const diff = total - usual;
  return (
    <>
      <TillBar sub={`Till ${s.settings.till_no} · ${user.name}`} />
      <div className="body" style={{ gap: 18 }}>
        <div className="panel col" style={{ flex: 1, padding: 20, gap: 14, overflow: 'auto' }}>
          <div>
            <h1 className="h1">Open shift</h1>
            <div className="mut">Count the cash in the drawer by note and coin. This opens the day for Till {s.settings.till_no}.</div>
          </div>
          <DenomGrid counts={counts} onChange={setCounts} money={m} compact />
        </div>
        <div className="col" style={{ width: 400, gap: 12 }}>
          <div className="total">
            <div className="mut" style={{ fontWeight: 600 }}>Opening float counted</div>
            <div className="num" style={{ fontSize: 52, lineHeight: '60px', fontWeight: 800, letterSpacing: -1 }}>{m(total)}</div>
            <div className="mut small num">
              Usual float {m(usual)} · {diff === 0 ? 'matches' : diff > 0 ? `${m(diff)} over` : `${m(-diff)} short`}
            </div>
          </div>
          <div className="panel" style={{ padding: '6px 18px' }}>
            <div className="row" style={{ padding: '10px 0' }}>
              <span className="mut grow">Last Z report</span>
              <b className="num">{last?.z_number ? `Z #${String(last.z_number).padStart(4, '0')} · ${fmtTime(last.closed_at!)}` : 'None yet'}</b>
            </div>
            <div className="row" style={{ padding: '10px 0', borderTop: '1px solid #EDEFEB' }}>
              <span className="mut grow">Left in drawer last time</span>
              <b className="num">{last?.float_left != null ? m(last.float_left) : '—'}</b>
            </div>
          </div>
          <button type="button" className="btn soft" onClick={() => setCounts({ [usual >= 1000 ? 1000 : 100]: usual >= 1000 ? Math.floor(usual / 1000) : Math.floor(usual / 100) })}>
            Same as usual float ({m(usual)})
          </button>
          <div className="grow" />
          <button type="button" className="btn go xl" onClick={() => onOpened(s.startShift(user, total))}>
            Open shift
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Not me, sign out
          </button>
        </div>
      </div>
    </>
  );
}
