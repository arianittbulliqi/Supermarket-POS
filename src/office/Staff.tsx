/** Staff with roles and PINs, and the audit log of who did what. */
import { useState } from 'react';
import { fmtDateTime, useStore } from '../app/state';
import { ROLE_DETAIL, ROLE_LABEL, ROLES } from '../domain/permissions';
import type { AuditAction, PublicUser, Role } from '../domain/types';
import { Icon } from '../ui/icons';
import { errText, Sheet, Toggle, useToast } from '../ui/kit';
import { Empty, Field, Text, Top } from './ui';

const ACTION_LABEL: Record<AuditAction, string> = {
  sign_in: 'Sign-in', discount: 'Discount', price_override: 'Price change at till', void_line: 'Void', clear_cart: 'Void sale', return: 'Return', cash_in: 'Cash in', cash_out: 'Cash out', open_shift: 'Shift opened', close_shift: 'Shift closed', stock_adjust: 'Stock adjusted', receive: 'Delivery', product_change: 'Product', import: 'Import', user_change: 'Staff', settings_change: 'Settings', restore: 'Restore',
};
const SENSITIVE = new Set<AuditAction>(['discount', 'price_override', 'void_line', 'clear_cart', 'return', 'cash_out', 'stock_adjust']);

export function Staff({ user }: { user: PublicUser }) {
  const s = useStore();
  const [tab, setTab] = useState<'staff' | 'audit'>('staff');
  const [edit, setEdit] = useState<PublicUser | 'new' | null>(null);
  const [filter, setFilter] = useState<'all' | 'sensitive'>('sensitive');
  const audit = [...s.audit].reverse().filter((a) => filter === 'all' || SENSITIVE.has(a.action));
  return (
    <>
      <Top title="Staff" sub="Everyone signs in with their own 4-digit PIN, so the audit log shows who did what.">
        {tab === 'staff' && (
          <button type="button" className="btn go" onClick={() => setEdit('new')}>
            <Icon n="plus" sm /> Add person
          </button>
        )}
      </Top>
      <div className="tabs">
        <button type="button" className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>
          People
        </button>
        <button type="button" className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>
          Audit log
        </button>
      </div>
      {tab === 'staff' ? (
        <div className="split">
          <div className="main card scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.users.map((u) => (
                  <tr key={u.id} className="click" onClick={() => setEdit(u)}>
                    <td>
                      <button type="button" className="rowlink">{u.name}</button>
                      {u.must_change_pin && <span className="tag a" style={{ marginLeft: 6 }}>Starting PIN</span>}
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td className="num">{u.last_sign_in ? fmtDateTime(u.last_sign_in) : 'Never'}</td>
                    <td>{u.active ? <span className="tag g">Active</span> : <span className="tag">Left</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="aside card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ marginBottom: 6 }}>What each role can do</h2>
            {ROLES.map((r) => (
              <div key={r} className="kv" style={{ flexDirection: 'column', gap: 2 }}>
                <b style={{ textAlign: 'left' }}>{ROLE_LABEL[r]}</b>
                <span className="small">{ROLE_DETAIL[r]}</span>
              </div>
            ))}
            <div className="mut small" style={{ marginTop: 8 }}>A cashier who needs more (a big discount, a void, a return) gets a supervisor to type their PIN on the till.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={filter === 'sensitive' ? 'on' : ''} onClick={() => setFilter('sensitive')}>
              Discounts, voids, returns, cash
            </button>
            <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              Everything
            </button>
          </div>
          <div className="card scroll">
            {audit.length === 0 ? (
              <Empty>Nothing logged yet.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>Who</th>
                    <th>Approved by</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(0, 400).map((a) => (
                    <tr key={a.id}>
                      <td className="num">{fmtDateTime(a.created_at)}</td>
                      <td>
                        <span className={SENSITIVE.has(a.action) ? 'tag a' : 'tag'}>{ACTION_LABEL[a.action]}</span>
                      </td>
                      <td>{a.user_name}</td>
                      <td>{a.approved_by ?? '—'}</td>
                      <td className="small">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      {edit && <PersonSheet by={user} person={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PersonSheet({ by, person, onClose }: { by: PublicUser; person: PublicUser | null; onClose: () => void }) {
  const s = useStore();
  const toast = useToast();
  const [name, setName] = useState(person?.name ?? '');
  const [role, setRole] = useState<Role>(person?.role ?? 'cashier');
  const [active, setActive] = useState(person?.active ?? true);
  const [pin, setPin] = useState('');
  return (
    <div className="bo" style={{ minHeight: 0, position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}>
      <Sheet title={person ? person.name : 'Add a person'} onClose={onClose} right width={480}>
        <Field label="Name">
          <Text label="Name" value={name} onChange={setName} />
        </Field>
        <Field label="Role">
          <div className="col" style={{ gap: 8 }}>
            {ROLES.map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} className="card row" style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', font: 'inherit', borderColor: role === r ? '#0B7A47' : undefined, background: role === r ? '#E6F3EC' : '#fff' }}>
                <span className={role === r ? 'ck on' : 'ck'}>{role === r && <Icon n="check" sm />}</span>
                <div className="grow">
                  <b>{ROLE_LABEL[r]}</b>
                  <div className="mut small">{ROLE_DETAIL[r]}</div>
                </div>
              </button>
            ))}
          </div>
        </Field>
        <Field label={person ? 'New PIN (leave empty to keep)' : 'PIN'} hint="4 digits, different for everyone. They can't see it again here.">
          <Text label="PIN" value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" />
        </Field>
        {person && (
          <div className="row">
            <span className="grow">Still works here</span>
            <Toggle on={active} onChange={setActive} label="Active" />
          </div>
        )}
        <button
          type="button"
          className="btn go"
          onClick={() => {
            try {
              if (person) s.updateUser(person.id, { name, role, active }, pin || undefined, by);
              else s.addUser({ name, role, active: true }, pin, false, by);
              toast('Saved.');
              onClose();
            } catch (e) {
              toast(errText(e), 'bad');
            }
          }}
        >
          Save
        </button>
      </Sheet>
    </div>
  );
}
