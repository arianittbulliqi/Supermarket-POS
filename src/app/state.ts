/** The one store on this device, the fiscal queue, and hooks to read them in React. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { FiscalQueue } from '../fiscal/queue';
import { browserPersist } from '../store/persist';
import { Store } from '../store/store';

export const store = new Store(browserPersist());
export const fiscal = new FiscalQueue(store);

/** Re-renders on every change to the store. */
export function useStore(): Store {
  useSyncExternalStore(store.subscribe, () => store.version);
  return store;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** The clock in the top bar, updated every 20 seconds. */
export function useClock(): string {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 20_000);
    return () => clearInterval(i);
  }, []);
  return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
