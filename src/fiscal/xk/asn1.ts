/**
 * The little DER needed for ATK: turning WebCrypto's raw ECDSA signature
 * (r||s) into the ASN.1 form ATK verifies, and building the certificate
 * signing request (PKCS#10) for onboarding.
 */

const len = (n: number): number[] => {
  if (n < 0x80) return [n];
  const b: number[] = [];
  while (n > 0) {
    b.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | b.length, ...b];
};

export const tlv = (tag: number, body: Uint8Array | number[]): Uint8Array => Uint8Array.from([tag, ...len(body.length), ...body]);
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};
export const seq = (...parts: Uint8Array[]) => tlv(0x30, cat(...parts));
const set = (...parts: Uint8Array[]) => tlv(0x31, cat(...parts));

function oid(dotted: string): Uint8Array {
  const n = dotted.split('.').map(Number);
  const body = [40 * n[0] + n[1]];
  for (const v of n.slice(2)) {
    const b = [v & 0x7f];
    let x = v >>> 7;
    while (x > 0) {
      b.unshift((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    body.push(...b);
  }
  return tlv(0x06, body);
}

/** An unsigned big-endian integer as DER INTEGER (no extra zeros, a leading 0 when the top bit is set). */
function uint(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  const v = Array.from(b.slice(i));
  if (v[0] & 0x80) v.unshift(0);
  return tlv(0x02, v);
}

/** WebCrypto ECDSA P-256 signature (64 bytes r||s) to ASN.1 DER, as Go's ecdsa.SignASN1 gives. */
export function rawSigToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error('Unexpected signature length.');
  return seq(uint(raw.slice(0, 32)), uint(raw.slice(32)));
}

// Go's encoding/asn1 uses PrintableString when it can and UTF8String otherwise; do the same.
const printable = /^[A-Za-z0-9 '()+,\-./:=?]*$/;
const dirString = (s: string) => tlv(printable.test(s) ? 0x13 : 0x0c, new TextEncoder().encode(s));
const rdn = (o: string, v: string) => set(seq(oid(o), dirString(v)));

export interface CsrSubject {
  /** Business ID (NUI). */
  organization: string;
  /** POS ID. */
  unit: string;
  /** Branch ID. */
  locality: string;
  /** The business name ATK returned at verification. */
  commonName: string;
}

/** The part of the CSR that gets signed. `spki` is the public key as WebCrypto exports it ('spki'). */
export function csrInfo(subject: CsrSubject, spki: Uint8Array): Uint8Array {
  // same attribute order as Go's pkix.Name: C, L, O, OU, CN
  const name = seq(rdn('2.5.4.6', 'RKS'), rdn('2.5.4.7', subject.locality), rdn('2.5.4.10', subject.organization), rdn('2.5.4.11', subject.unit), rdn('2.5.4.3', subject.commonName));
  return seq(tlv(0x02, [0]), name, spki, Uint8Array.from([0xa0, 0x00]));
}

/** The whole CSR, from the signed info and its DER signature. */
export function csrDer(info: Uint8Array, derSig: Uint8Array): Uint8Array {
  const alg = seq(oid('1.2.840.10045.4.3.2'));
  return seq(info, alg, tlv(0x03, [0, ...derSig]));
}

export function pem(label: string, der: Uint8Array): string {
  let s = '';
  for (const x of der) s += String.fromCharCode(x);
  const b64 = btoa(s).replace(/.{1,64}/g, '$&\n');
  return `-----BEGIN ${label}-----\n${b64}-----END ${label}-----\n`;
}
