/** Words that identify a branch/outlet rather than the merchant ("ST 04", "Branch 7"). */
export const STORE_MARKERS: ReadonlySet<string> = new Set([
  'st',
  'stn',
  'station',
  'br',
  'branch',
  'no',
  'store',
  'outlet',
  'unit',
  'pos',
]);

/** Company-form suffixes that receipts and acquirers include inconsistently. */
export const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  'co',
  'company',
  'llc',
  'ltd',
  'limited',
  'est',
  'establishment',
  'trading',
  'corp',
  'corporation',
  'inc',
  'plc',
]);

/** Articles and connectors, including the Arabic article "al" common in transliterated names. */
export const ARTICLES: ReadonlySet<string> = new Set(['al', 'el', 'the', 'and', 'of']);

/** City names and the short codes acquirers append ("ALFANAR FUEL ST 04 RUH"). */
export const CITY_CODES: ReadonlySet<string> = new Set([
  'ruh',
  'jed',
  'dmm',
  'mak',
  'med',
  'khb',
  'tif',
  'abh',
  'dxb',
  'auh',
  'riyadh',
  'jeddah',
  'dammam',
  'makkah',
  'mecca',
  'madinah',
  'medina',
  'khobar',
  'taif',
  'abha',
  'dubai',
  'ksa',
  'uae',
]);

/** Acquirer abbreviations expanded to the word a receipt would print. */
export const ABBREVIATIONS: ReadonlyMap<string, string> = new Map([
  ['svc', 'service'],
  ['svcs', 'service'],
  ['srv', 'service'],
  ['rest', 'restaurant'],
  ['rstrnt', 'restaurant'],
  ['mkt', 'market'],
  ['supmkt', 'supermarket'],
  ['ctr', 'center'],
  ['pharm', 'pharmacy'],
  ['petro', 'petrol'],
]);

/** Category words shared by many unrelated merchants; they weigh less than distinctive brand words. */
export const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'fuel',
  'petrol',
  'petroleum',
  'gas',
  'oil',
  'grill',
  'restaurant',
  'cafe',
  'coffee',
  'kitchen',
  'food',
  'car',
  'wash',
  'auto',
  'service',
  'market',
  'supermarket',
  'hypermarket',
  'pharmacy',
  'center',
  'centre',
  'road',
]);

export const GENERIC_TOKEN_WEIGHT = 0.3;
export const DISTINCTIVE_TOKEN_WEIGHT = 1;

export function tokenWeight(token: string): number {
  return GENERIC_TOKENS.has(token) ? GENERIC_TOKEN_WEIGHT : DISTINCTIVE_TOKEN_WEIGHT;
}
