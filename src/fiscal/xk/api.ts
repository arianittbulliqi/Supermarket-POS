/**
 * ATK's fiscalization service (github.com/fiskalizimi): sending POS coupons,
 * and the two onboarding calls that get this till its certificate.
 *
 * Browsers only allow these calls when ATK's server permits the till's
 * address (CORS). If it does not, set a relay address in Settings: a small
 * pass-through on the store's own server that forwards the same paths to ATK.
 */
import type { XkConfig } from './coupon';

export const ATK_URL = { test: 'https://fiskalizimi-test.atk-ks.org', prod: 'https://fiskalizimi.atk-ks.org' } as const;

export const baseUrl = (cfg: Pick<XkConfig, 'env' | 'relay'>) => (cfg.relay ? cfg.relay.replace(/\/+$/, '') : ATK_URL[cfg.env]);

/** ATK said no (400 or 500 with an error message). Network trouble is a plain Error. */
export class AtkError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** Tests replace the network here. */
export const setFetch = (f: Fetch) => {
  fetcher = f;
};

async function post<T>(url: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new Error(ctl.signal.aborted ? 'ATK did not answer in time.' : `Cannot reach ATK (${e instanceof Error ? e.message : String(e)}).`);
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty or not JSON */
  }
  if (!res.ok) throw new AtkError(typeof data.error === 'string' ? `ATK: ${data.error}` : `ATK answered ${res.status}.`, res.status);
  return data as T;
}

export interface SendResult {
  message: string;
  transaction_id: string;
}

/** Send one signed POS coupon. */
export function sendCoupon(cfg: XkConfig, details: string, signature: string, timeoutMs?: number) {
  return post<SendResult>(`${baseUrl(cfg)}/pos/coupon`, { details, signature }, timeoutMs);
}

/** Onboarding step 1: ATK checks the business and gives a one-time verification code. */
export function verifyBusiness(cfg: XkConfig) {
  return post<{ business_name: string; verification_code: string }>(`${baseUrl(cfg)}/ca/verify/${encodeURIComponent(cfg.nui)}`, {
    fiscalization_no: cfg.fiscal_no,
    pos_id: Number(cfg.pos_id),
    branch_id: Number(cfg.branch_id),
    application_id: Number(cfg.app_id),
  });
}

/** Onboarding step 2: ATK signs this till's certificate request. */
export function signCsr(cfg: XkConfig, businessName: string, verificationCode: string, csr: string) {
  return post<{ signed_certificate: string }>(`${baseUrl(cfg)}/ca/signcsr`, {
    business_name: businessName,
    business_id: Number(cfg.nui),
    branch_id: Number(cfg.branch_id),
    verification_code: verificationCode,
    pos_id: Number(cfg.pos_id),
    application_id: Number(cfg.app_id),
    csr,
  });
}
