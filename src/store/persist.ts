/**
 * Where the till keeps its data: IndexedDB, which has room for years of
 * receipts and does not block the screen. Falls back to localStorage where
 * IndexedDB is refused (some private windows), and to memory in tests.
 */
import type { Persist } from './store';

const DB = 'grocery-pos';
const STORE = 'kv';
const KEY = 'data';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let r: IDBOpenDBRequest;
    try {
      r = indexedDB.open(DB, 1);
    } catch {
      return resolve(null); // storage blocked in this browser: fall back
    }
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
}

export function browserPersist(): Persist {
  let memory: string | null = null;
  let db: Promise<IDBDatabase | null> | null = null;
  const get = () => (db ??= openDb());
  const tx = async (mode: IDBTransactionMode) => {
    const d = await get();
    if (!d) return null;
    try {
      return d.transaction(STORE, mode).objectStore(STORE);
    } catch {
      db = null; // the browser closed the connection (iOS in the background): reopen once
      const again = await get();
      return again ? again.transaction(STORE, mode).objectStore(STORE) : null;
    }
  };
  return {
    async load() {
      const s = await tx('readonly');
      if (!s) {
        try {
          return localStorage.getItem(KEY) ?? memory;
        } catch {
          return memory;
        }
      }
      return new Promise((resolve, reject) => {
        const r = s.get(KEY);
        r.onsuccess = () => resolve((r.result as string | undefined) ?? null);
        r.onerror = () => reject(r.error);
      });
    },
    async save(json) {
      const s = await tx('readwrite');
      memory = json;
      if (!s) {
        try {
          localStorage.setItem(KEY, json);
        } catch {
          /* storage blocked (private window): keep it in memory for this visit */
        }
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const r = s.put(json, KEY);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    },
  };
}

/** Ask the browser not to clear the till's data when space runs low. */
export async function keepData(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
