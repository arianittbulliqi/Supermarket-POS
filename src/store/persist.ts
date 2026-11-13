/**
 * Where the till keeps its data: IndexedDB, which has room for years of
 * receipts and does not block the screen. Falls back to localStorage where
 * IndexedDB is refused (some private windows), and to memory in tests.
 *
 * In IndexedDB the data is encrypted (AES-GCM, 256-bit), as ATK requires for
 * fiscal data kept on the device. The key is made by the browser as
 * non-extractable: it can be used on this device but never read out.
 */
import type { Persist } from './store';

const DB = 'grocery-pos';
const STORE = 'kv';
const KEY = 'data';
const AES_KEY = 'aes';

interface Sealed {
  iv: Uint8Array;
  ct: ArrayBuffer;
}

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
  const req = <T>(r: IDBRequest) =>
    new Promise<T>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
    });
  let aes: Promise<CryptoKey | null> | null = null;
  // crypto runs between transactions: an IndexedDB transaction closes while it waits
  const key = () =>
    (aes ??= (async () => {
      if (typeof crypto === 'undefined' || !crypto.subtle) return null;
      const s = await tx('readonly');
      if (!s) return null;
      const have = await req<CryptoKey | undefined>(s.get(AES_KEY));
      if (have) return have;
      const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const w = await tx('readwrite');
      if (!w) return null;
      await req(w.put(made, AES_KEY));
      return made;
    })().catch(() => null));
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
      const v = await req<string | Sealed | undefined>(s.get(KEY));
      if (v == null || typeof v === 'string') return v ?? null; // empty, or saved before encryption
      const k = await key();
      if (!k) throw new Error('The key for this till’s data is missing.');
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: v.iv }, k, v.ct));
    },
    async save(json) {
      memory = json;
      const k = await key();
      let value: string | Sealed = json;
      if (k) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        value = { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(json)) };
      }
      const s = await tx('readwrite');
      if (!s) {
        try {
          localStorage.setItem(KEY, json);
        } catch {
          /* storage blocked (private window): keep it in memory for this visit */
        }
        return;
      }
      await req(s.put(value, KEY));
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
