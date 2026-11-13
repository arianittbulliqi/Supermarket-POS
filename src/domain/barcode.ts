/**
 * What a scanned code means. A USB or Bluetooth scanner types the digits and
 * presses Enter, so the till only ever sees a string.
 *
 * In-store scale labels follow the common EAN-13 layout
 *   PP IIIII VVVVV C
 * PP: prefix (20-29, set in Settings), IIIII: the product's PLU,
 * VVVVV: weight in grams or price in cents, C: check digit.
 */

/** GS1 check digit for EAN-8, UPC-A, EAN-13 and GTIN-14 (all digits but the last). */
export function checkDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

/** True for an 8, 12, 13 or 14 digit code whose check digit is right. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  return checkDigit(code.slice(0, -1)) === code.charCodeAt(code.length - 1) - 48;
}

/** The full EAN-13 for 12 digits, adding the check digit. */
export const withCheckDigit = (body12: string): string => body12 + checkDigit(body12);

export type Scan =
  | { kind: 'code'; code: string }
  | { kind: 'weight'; plu: string; grams: number; code: string }
  | { kind: 'price'; plu: string; cents: number; code: string };

export interface ScanRules {
  weight_prefixes: string[];
  price_prefixes: string[];
}

/** Read a scan. Leading and trailing spaces (some scanners add them) are dropped. */
export function parseScan(raw: string, rules: ScanRules): Scan {
  const code = raw.trim();
  if (code.length === 13 && isValidGtin(code)) {
    const prefix = code.slice(0, 2);
    const plu = String(parseInt(code.slice(2, 7), 10));
    const value = parseInt(code.slice(7, 12), 10);
    if (rules.weight_prefixes.includes(prefix)) return { kind: 'weight', plu, grams: value, code };
    if (rules.price_prefixes.includes(prefix)) return { kind: 'price', plu, cents: value, code };
  }
  return { kind: 'code', code };
}

/** Looks like a scan rather than a name typed into search: digits only, 4 or more. */
export const looksLikeCode = (text: string): boolean => /^\d{4,14}$/.test(text.trim());
