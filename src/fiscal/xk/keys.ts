/**
 * This till's ATK signing key: one ECDSA P-256 key pair per installed till,
 * as ATK requires. The private key is made non-extractable by the browser,
 * so it can sign but can never be read, copied or exported, and it is kept
 * in IndexedDB, apart from the store's data and its backups.
 */
import { csrDer, csrInfo, pem, rawSigToDer, type CsrSubject } from './asn1';
import { toBase64 } from './pb';

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface KeyStore {
  get(): Promise<CryptoKeyPair | null>;
  put(k: CryptoKeyPair): Promise<void>;
  clear(): Promise<void>;
}

export function memoryKeyStore(start: CryptoKeyPair | null = null): KeyStore {
  let k = start;
  return {
    async get() {
      return k;
    },
    async put(v) {
      k = v;
    },
    async clear() {
      k = null;
    },
  };
}

function idbKeyStore(): KeyStore {
  const open = () =>
    new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('grocery-pos-fiscal', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const run = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((res, rej) => {
        const req = f(db.transaction('keys', mode).objectStore('keys'));
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: async () => (await run<CryptoKeyPair | undefined>('readonly', (s) => s.get('xk-atk'))) ?? null,
    put: async (k) => void (await run('readwrite', (s) => s.put(k, 'xk-atk'))),
    clear: async () => void (await run('readwrite', (s) => s.delete('xk-atk'))),
  };
}

let store: KeyStore | null = null;
const keyStore = (): KeyStore => {
  if (!store) {
    try {
      store = typeof indexedDB !== 'undefined' ? idbKeyStore() : memoryKeyStore();
    } catch {
      store = memoryKeyStore();
    }
  }
  return store;
};

/** Tests (and a future secure-hardware store) swap the key store here. */
export const setKeyStore = (k: KeyStore) => {
  store = k;
};

export const hasKey = async () => (await keyStore().get()) != null;
export const forgetKey = () => keyStore().clear();

async function ensureKey(): Promise<CryptoKeyPair> {
  const k = await keyStore().get();
  if (k) return k;
  const made = (await crypto.subtle.generateKey(ALG, false, ['sign', 'verify'])) as CryptoKeyPair;
  await keyStore().put(made);
  return made;
}

/**
 * Sign text the way ATK expects: ECDSA P-256 over SHA-256 of the text's bytes,
 * the signature in ASN.1 DER, then base64.
 */
export async function signText(text: string): Promise<string> {
  const k = await keyStore().get();
  if (!k) throw new Error('This till is not connected to ATK yet (no signing key).');
  const raw = new Uint8Array(await crypto.subtle.sign(SIGN, k.privateKey, new TextEncoder().encode(text)));
  return toBase64(rawSigToDer(raw));
}

/** A new certificate signing request for onboarding, in PEM. Makes the key on first use. */
export async function makeCsr(subject: CsrSubject): Promise<string> {
  const k = await ensureKey();
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', k.publicKey));
  const info = csrInfo(subject, spki);
  const raw = new Uint8Array(await crypto.subtle.sign(SIGN, k.privateKey, info));
  return pem('CERTIFICATE REQUEST', csrDer(info, rawSigToDer(raw)));
}
