/** The till: who is signed in, their shift, the basket, and which screen shows. */
import { useEffect, useState } from 'react';
import { useStore } from '../app/state';
import { emptyCart } from '../domain/cart';
import type { Cart, PublicUser, Sale as SaleT, Shift } from '../domain/types';
import { TillFrame } from './frame';
import { Lock, NewPin, OpenShift } from './Lock';
import { CloseShift, More } from './More';
import { Payment, ReceiptScreen } from './Pay';
import { Return } from './Return';
import { Sale } from './Sale';

type Screen = 'sale' | 'pay' | 'receipt' | 'return' | 'more' | 'close';

/** The basket survives a reload or a lock, per cashier, on this device. */
const cartKey = (id: string) => `pos.cart.${id}`;
function loadCart(id: string): Cart {
  try {
    const raw = localStorage.getItem(cartKey(id));
    return raw ? (JSON.parse(raw) as Cart) : emptyCart();
  } catch {
    return emptyCart();
  }
}
function saveCart(id: string, c: Cart) {
  try {
    if (c.lines.length) localStorage.setItem(cartKey(id), JSON.stringify(c));
    else localStorage.removeItem(cartKey(id));
  } catch {
    /* private mode: the basket just isn't kept */
  }
}

export function Till() {
  const s = useStore();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [mustChange, setMustChange] = useState(false);
  const [screen, setScreen] = useState<Screen>('sale');
  const [cart, setCartState] = useState<Cart>(emptyCart());
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [last, setLast] = useState<SaleT | null>(null);
  const [closing, setClosing] = useState<Shift | null>(null);
  const shift: Shift | null = user ? s.openShift(user.id) : null;

  const setCart = (c: Cart) => {
    setCartState(c);
    if (user) saveCart(user.id, c);
  };

  // lock after 10 minutes without a touch, keeping the basket
  useEffect(() => {
    if (!user) return;
    let t = setTimeout(lock, 600_000);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(lock, 600_000);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [user]);

  function lock() {
    setUser(null);
    setScreen('sale');
  }

  const signedIn = (u: PublicUser) => {
    setUser(u);
    setMustChange(!!s.users.find((x) => x.id === u.id)?.must_change_pin);
    setCartState(loadCart(u.id));
    setApprovedBy(null);
    setScreen('sale');
  };

  let body;
  if (!user) body = <Lock onSignedIn={signedIn} />;
  else if (mustChange) body = <NewPin user={user} onDone={() => setMustChange(false)} onCancel={lock} />;
  else if (screen === 'close' && closing) body = <CloseShift user={user} shift={closing} onBack={() => setScreen('more')} onClosed={() => { setClosing(null); lock(); }} />;
  else if (!shift) body = <OpenShift user={user} onOpened={() => setScreen('sale')} onCancel={lock} />;
  else if (screen === 'pay') body = <Payment user={user} shift={shift} cart={cart} approvedBy={approvedBy} onBack={() => setScreen('sale')} onPaid={(sale) => { setLast(sale); setCart(emptyCart()); setApprovedBy(null); setScreen('receipt'); }} />;
  else if (screen === 'receipt' && last) body = <ReceiptScreen sale={last} user={user} onNew={() => setScreen('sale')} />;
  else if (screen === 'return') body = <Return user={user} shift={shift} onBack={() => setScreen('sale')} onDone={(r) => { setLast(r); setScreen('receipt'); }} />;
  else if (screen === 'more') body = <More user={user} shift={shift} cart={cart} onBack={() => setScreen('sale')} onClearCart={() => { setCart(emptyCart()); setApprovedBy(null); }} onClose={() => { setClosing(shift); setScreen('close'); }} />;
  else body = <Sale user={user} shift={shift} cart={cart} setCart={setCart} approvedBy={approvedBy} setApprovedBy={setApprovedBy} onPay={() => setScreen('pay')} onReturn={() => setScreen('return')} onMore={() => setScreen('more')} onLock={lock} />;

  return <TillFrame>{body}</TillFrame>;
}
