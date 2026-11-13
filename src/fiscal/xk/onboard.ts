/**
 * Connecting this till to ATK (onboarding), as in github.com/fiskalizimi:
 * ATK checks the business and gives a verification code, the till makes its
 * own key and a certificate request, and ATK signs the certificate. The
 * private key never leaves this device.
 */
import type { Settings } from '../../domain/types';
import { signCsr, verifyBusiness } from './api';
import { missing, xkConfig } from './coupon';
import { forgetKey, makeCsr } from './keys';

export async function connectToAtk(settings: Settings, opts: { newKey?: boolean } = {}): Promise<{ cert: string; business_name: string }> {
  const cfg = xkConfig(settings);
  const gaps = missing(cfg);
  if (!cfg.fiscal_no) gaps.push('Fiscalization number');
  if (gaps.length) throw new Error(`Fill in first: ${gaps.join(', ')}.`);
  const v = await verifyBusiness(cfg);
  if (opts.newKey) await forgetKey();
  const csr = await makeCsr({ organization: cfg.nui, unit: cfg.pos_id, locality: cfg.branch_id, commonName: v.business_name });
  const r = await signCsr(cfg, v.business_name, v.verification_code, csr);
  if (!r.signed_certificate) throw new Error('ATK did not return a certificate.');
  return { cert: r.signed_certificate, business_name: v.business_name };
}
