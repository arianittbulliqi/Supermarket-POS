/**
 * Fiscalization, as a module that plugs in per country.
 *
 * Kosovo, Albania and Serbia all require every receipt to be registered with
 * the tax authority, but in different ways:
 *   - Kosovo (ATK): a certified fiscal device prints or signs each receipt.
 *   - Albania (DPT): the till signs the receipt (NSLF/IIC) and sends it to the
 *     CIS service online, which returns the NIVF/FIC; offline receipts must be
 *     sent within the legal limit once the connection is back.
 *   - Serbia (PU): an L-PFR or V-PFR (ESDC/SDC) signs the receipt and returns
 *     its PFR number and verification link.
 *
 * The till never waits on this: a sale is saved first with fiscal status
 * 'pending', then the queue (src/fiscal/queue.ts) registers it and retries
 * until it succeeds. Choosing a module is one setting.
 *
 * The country modules here are TEST adapters: they build the receipt data and
 * the verification code and link in each country's shape, but sign with a
 * local test key and send nothing. A certified connection (device driver,
 * certificate, server endpoint) replaces `register` per module once the
 * launch country and its certification are settled.
 */
import { sha256 } from '../domain/sha256';
import type { Sale, Settings } from '../domain/types';

export interface FiscalField {
  key: string;
  label: string;
  placeholder: string;
}

export interface FiscalResult {
  /** The authority's code for the receipt. */
  code: string;
  /** Where the receipt's QR code points, for the customer to check it. */
  qr: string | null;
}

export interface FiscalModule {
  id: string;
  name: string;
  country: string;
  /** One sentence on how this country does it, for Settings. */
  how: string;
  /** What the code is called on the receipt. */
  codeLabel: string;
  fields: FiscalField[];
  /** True while the module is a test adapter that sends nothing. */
  test: boolean;
  register(sale: Sale, settings: Settings): Promise<FiscalResult>;
}

const stamp = (sale: Sale, settings: Settings) =>
  [settings.business_no, settings.till_no, sale.number, sale.created_at, sale.total].join('|');

const none: FiscalModule = {
  id: 'none',
  name: 'Off',
  country: '',
  how: 'Receipts are not registered with a tax authority. Every receipt says it is not a fiscal receipt.',
  codeLabel: '',
  fields: [],
  test: false,
  async register() {
    return { code: '', qr: null };
  },
};

const kosovo: FiscalModule = {
  id: 'xk-atk',
  name: 'Kosovo · ATK fiscal device',
  country: 'Kosovo',
  how: 'Each receipt goes to the ATK-certified fiscal device connected to this till, which signs and numbers it.',
  codeLabel: 'Fiscal no.',
  fields: [
    { key: 'device', label: 'Fiscal device address', placeholder: 'COM3 or 192.168.1.50:4999' },
    { key: 'device_id', label: 'Device number', placeholder: '[DEVICE NO]' },
  ],
  test: true,
  async register(sale, settings) {
    const h = sha256('xk|' + stamp(sale, settings)).toUpperCase();
    return { code: `${settings.fiscal_config.device_id || 'TEST'}-${h.slice(0, 10)}`, qr: null };
  },
};

const albania: FiscalModule = {
  id: 'al-cis',
  name: 'Albania · e-fiscalization (CIS)',
  country: 'Albania',
  how: 'The till signs each receipt (NSLF) and sends it to the tax service, which returns the NIVF. Offline receipts are sent when the connection is back.',
  codeLabel: 'NIVF',
  fields: [
    { key: 'nipt', label: 'NIPT (tax number)', placeholder: '[L00000000A]' },
    { key: 'bu', label: 'Business unit code', placeholder: '[ab123cd456]' },
    { key: 'tcr', label: 'TCR code', placeholder: '[xy789zz001]' },
    { key: 'operator', label: 'Operator code', placeholder: '[op000aa000]' },
    { key: 'software', label: 'Software code', placeholder: '[sw000aa000]' },
  ],
  test: true,
  async register(sale, settings) {
    const c = settings.fiscal_config;
    const iic = sha256('al-iic|' + stamp(sale, settings)).slice(0, 32).toUpperCase();
    const fic = sha256('al-fic|' + iic);
    const nivf = `${fic.slice(0, 8)}-${fic.slice(8, 12)}-${fic.slice(12, 16)}-${fic.slice(16, 20)}-${fic.slice(20, 32)}`;
    const q = new URLSearchParams({ iic, tin: c.nipt ?? '', crtd: sale.created_at, ord: String(sale.number), bu: c.bu ?? '', cr: c.tcr ?? '', sw: c.software ?? '', prc: (sale.total / 100).toFixed(2) });
    return { code: nivf, qr: `https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify?${q}` };
  },
};

const serbia: FiscalModule = {
  id: 'rs-esdc',
  name: 'Serbia · e-fiscalization (L-PFR / V-PFR)',
  country: 'Serbia',
  how: 'Each receipt goes to the accredited fiscal processor (L-PFR on the till, or V-PFR online), which signs it and returns the PFR number and check link.',
  codeLabel: 'PFR no.',
  fields: [
    { key: 'pfr_url', label: 'Fiscal processor address', placeholder: 'http://127.0.0.1:7200' },
    { key: 'pac', label: 'PAC', placeholder: '[PAC]' },
  ],
  test: true,
  async register(sale, settings) {
    const h = sha256('rs|' + stamp(sale, settings)).toUpperCase();
    const code = `${h.slice(0, 8)}-${h.slice(8, 16)}-${sale.number}`;
    return { code, qr: `https://suf.purs.gov.rs/v/?vl=${h.slice(0, 40)}` };
  },
};

export const FISCAL_MODULES: FiscalModule[] = [none, kosovo, albania, serbia];

export const fiscalModule = (id: string): FiscalModule => FISCAL_MODULES.find((m) => m.id === id) ?? none;
