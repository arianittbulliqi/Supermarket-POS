/** Back office: sign in with a supervisor or manager PIN, then the sidebar and pages. */
import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from '../app/state';
import { can, ROLE_LABEL, type Action } from '../domain/permissions';
import type { PublicUser } from '../domain/types';
import { Icon } from '../ui/icons';
import { PinPad } from '../ui/kit';
import { Dashboard } from './Dashboard';
import { Products, ImportPage } from './Catalog';
import { Stock, Receive, Suppliers } from './Inventory';
import { Receipts, Shifts } from './Sales';
import { Reports } from './Reports';
import { Staff } from './Staff';
import { SettingsPage } from './Settings';

const KEY = 'pos.office.user';

export interface OfficeProps {
  user: PublicUser;
}

const NAV: { to: string; label: string; icon: string; need: Action; subs?: { to: string; label: string; need?: Action }[]; later?: boolean }[] = [
  { to: '/office', label: 'Dashboard', icon: 'home', need: 'reports.view' },
  { to: '/office/receipts', label: 'Sales', icon: 'receipt', need: 'reports.view', subs: [{ to: '/office/receipts', label: 'Receipts' }, { to: '/office/shifts', label: 'Shifts and Z reports' }] },
  { to: '/office/products', label: 'Catalog', icon: 'tag', need: 'stock.view', subs: [{ to: '/office/products', label: 'Products' }, { to: '/office/import', label: 'Import', need: 'products.edit' }] },
  { to: '/office/stock', label: 'Inventory', icon: 'box', need: 'stock.view', subs: [{ to: '/office/stock', label: 'Stock levels' }, { to: '/office/receive', label: 'Receive delivery', need: 'stock.receive' }, { to: '/office/suppliers', label: 'Suppliers' }] },
  { to: '/office/customers', label: 'Customers', icon: 'person', need: 'reports.view', later: true },
  { to: '/office/reports', label: 'Reports', icon: 'chart', need: 'reports.view' },
  { to: '/office/staff', label: 'Staff', icon: 'users', need: 'users.manage' },
  { to: '/office/settings', label: 'Settings', icon: 'cog', need: 'settings.edit' },
];

export function Office() {
  const s = useStore();
  const [uid, setUid] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const user = s.users.find((u) => u.id === uid && u.active) ?? null;
  const loc = useLocation();
  if (!user) return <OfficeSignIn onIn={(u) => { setUid(u.id); try { sessionStorage.setItem(KEY, u.id); } catch { /* ignore */ } }} />;
  const signOut = () => {
    setUid(null);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };
  const home = can(user.role, 'reports.view') ? <Dashboard user={user} /> : <Navigate to="/office/products" replace />;
  return (
    <div className="bo">
      <nav className="side">
        <div className="brand">
          <span className="logo">
            <Icon n="basket" sm />
          </span>
          <div className="col">
            <span>{s.settings.store_name}</span>
            <span className="mut small" style={{ fontWeight: 400 }}>Back office</span>
          </div>
        </div>
        {NAV.filter((n) => can(user.role, n.need)).map((n) => {
          const active = n.to === '/office' ? loc.pathname === '/office' || loc.pathname === '/office/' : n.subs ? n.subs.some((x) => loc.pathname.startsWith(x.to)) : loc.pathname.startsWith(n.to);
          return (
            <div key={n.label} className="col" style={{ gap: 2 }}>
              {n.later ? (
                <span className="nav" style={{ color: '#9AA49D' }}>
                  <Icon n={n.icon} sm /> {n.label} <span className="tag" style={{ marginLeft: 'auto' }}>Later</span>
                </span>
              ) : (
                <Link className={active ? 'nav on' : 'nav'} to={n.to}>
                  <Icon n={n.icon} sm /> {n.label}
                </Link>
              )}
              {active &&
                n.subs
                  ?.filter((x) => !x.need || can(user.role, x.need))
                  .map((x) => (
                    <NavLink key={x.to} className={({ isActive }) => (isActive ? 'sub on' : 'sub')} to={x.to} end>
                      {x.label}
                    </NavLink>
                  ))}
            </div>
          );
        })}
        <div className="grow" />
        <div className="col" style={{ gap: 6, padding: '12px 8px 0', borderTop: '1px solid #E1E4DF', marginTop: 12 }}>
          <div className="small">
            <b>{user.name}</b> <span className="mut">· {ROLE_LABEL[user.role]}</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn go" to="/" style={{ flex: 1 }}>
              <Icon n="basket" sm /> Till
            </Link>
            <button type="button" className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="content">
        <Routes>
          <Route index element={home} />
          <Route path="receipts" element={<Gate user={user} need="reports.view"><Receipts user={user} /></Gate>} />
          <Route path="shifts" element={<Gate user={user} need="reports.view"><Shifts user={user} /></Gate>} />
          <Route path="products" element={<Products user={user} />} />
          <Route path="import" element={<Gate user={user} need="products.edit"><ImportPage user={user} /></Gate>} />
          <Route path="stock" element={<Stock user={user} />} />
          <Route path="receive" element={<Gate user={user} need="stock.receive"><Receive user={user} /></Gate>} />
          <Route path="suppliers" element={<Suppliers user={user} />} />
          <Route path="reports" element={<Gate user={user} need="reports.view"><Reports user={user} /></Gate>} />
          <Route path="staff" element={<Gate user={user} need="users.manage"><Staff user={user} /></Gate>} />
          <Route path="settings" element={<Gate user={user} need="settings.edit"><SettingsPage user={user} /></Gate>} />
          <Route path="*" element={<Navigate to="/office" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate({ user, need, children }: { user: PublicUser; need: Action; children: React.ReactNode }) {
  return can(user.role, need) ? <>{children}</> : <div className="card" style={{ padding: 24 }}>Your role can't open this page. Ask a manager.</div>;
}

function OfficeSignIn({ onIn }: { onIn: (u: PublicUser) => void }) {
  const s = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const first = s.users.length === 1 && s.users[0].must_change_pin;
  return (
    <div className="bo" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="card col" style={{ width: 400, maxWidth: 'calc(100% - 32px)', padding: 28, gap: 16, margin: 'auto' }}>
        <div className="row">
          <span className="logo">
            <Icon n="basket" sm />
          </span>
          <div className="grow">
            <h2 className="h2">{s.settings.store_name}</h2>
            <div className="mut small">Back office · supervisor or manager PIN</div>
          </div>
          <Link className="btn ghost" to="/">
            Till
          </Link>
        </div>
        {first && <div className="tag a" style={{ height: 'auto', padding: '8px 10px', whiteSpace: 'normal' }}>First time: the manager PIN is 0000. You'll be asked to change it on the till.</div>}
        <PinPad
          error={msg}
          onPin={(pin) => {
            const u = s.signIn(pin);
            if (!u) {
              setMsg('That PIN is not right.');
              return false;
            }
            if (u.role === 'cashier') {
              setMsg('Cashiers sign in on the till. The back office is for supervisors and managers.');
              return false;
            }
            s.log('sign_in', u, 'Signed in to the back office');
            onIn(u);
          }}
        />
      </div>
    </div>
  );
}
