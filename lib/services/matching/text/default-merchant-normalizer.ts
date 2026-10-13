import type { MerchantNormalizer } from './merchant-normalizer';
import { ABBREVIATIONS, ARTICLES, CITY_CODES, LEGAL_SUFFIXES, STORE_MARKERS } from './merchant-vocabulary';

const COMBINING_MARKS = /\p{M}+/gu;
const APOSTROPHES = /['’`ʼ]/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
const CONTAINS_DIGIT = /\p{N}/u;
const NOISE_SETS: readonly ReadonlySet<string>[] = [STORE_MARKERS, LEGAL_SUFFIXES, ARTICLES, CITY_CODES];

/**
 * Reduces a merchant name to its identifying tokens:
 * "ALFANAR FUEL ST 04 RUH" and "Alfanar Fuel Station" both become ["alfanar", "fuel"].
 */
export class DefaultMerchantNormalizer implements MerchantNormalizer {
  normalize(name: string): string[] {
    const tokens = this.tokenize(name).map(expandAbbreviation).filter(isMeaningful);
    return [...new Set(tokens)];
  }

  private tokenize(name: string): string[] {
    return name
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(APOSTROPHES, '')
      .replace(NON_ALPHANUMERIC, ' ')
      .split(' ')
      .filter((token) => token.length > 0);
  }
}

function expandAbbreviation(token: string): string {
  return ABBREVIATIONS.get(token) ?? token;
}

function isMeaningful(token: string): boolean {
  return !CONTAINS_DIGIT.test(token) && !NOISE_SETS.some((set) => set.has(token));
}
