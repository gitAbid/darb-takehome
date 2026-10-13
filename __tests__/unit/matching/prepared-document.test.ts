import { dayGap, prepareDocument } from '@/lib/services/matching/prepared-document';
import type { MerchantNormalizer } from '@/lib/services/matching/text/merchant-normalizer';

import { buildFields, buildTransaction } from '../../helpers/matching-builders';

const splitter: MerchantNormalizer = { normalize: (name) => name.toLowerCase().split(/\s+/).filter(Boolean) };

describe('prepareDocument', () => {
  it('prepares a valid receipt with its Riyadh day and merchant tokens', () => {
    const doc = prepareDocument(buildFields({ merchantName: 'Alfanar Fuel' }), splitter);
    expect(doc).toMatchObject({ documentType: 'RECEIPT', amount: 15000, merchantTokens: ['alfanar', 'fuel'] });
    expect(doc?.day).toBe(Date.UTC(2025, 5, 10) / 86_400_000);
  });

  it.each([
    ['UNKNOWN document type', { documentType: 'UNKNOWN' as const }],
    ['missing amount', { totalAmount: null }],
    ['zero amount', { totalAmount: 0 }],
    ['negative amount (refund)', { totalAmount: -500 }],
    ['fractional amount (not halalas)', { totalAmount: 57.5 }],
    ['NaN amount', { totalAmount: Number.NaN }],
    ['missing date', { documentDate: null }],
    ['unparseable date', { documentDate: '31/02/2025' }],
  ])('returns null for %s', (_label, overrides) => {
    expect(prepareDocument(buildFields(overrides), splitter)).toBeNull();
  });

  it('leaves merchant tokens null when the name is missing, empty or pure noise', () => {
    const noise: MerchantNormalizer = { normalize: () => [] };
    expect(prepareDocument(buildFields({ merchantName: null }), splitter)?.merchantTokens).toBeNull();
    expect(prepareDocument(buildFields({ merchantName: '' }), splitter)?.merchantTokens).toBeNull();
    expect(prepareDocument(buildFields({ merchantName: '#04 RUH' }), noise)?.merchantTokens).toBeNull();
  });
});

describe('dayGap', () => {
  const doc = prepareDocument(buildFields({ documentDate: '2025-06-14' }), splitter)!;

  it('is document day minus transaction day, on Riyadh days', () => {
    expect(dayGap(doc, buildTransaction({ transactionAt: new Date('2025-06-13T22:30:00Z') }))).toBe(0);
    expect(dayGap(doc, buildTransaction({ transactionAt: new Date('2025-06-13T12:00:00Z') }))).toBe(1);
    expect(dayGap(doc, buildTransaction({ transactionAt: new Date('2025-06-16T12:00:00Z') }))).toBe(-2);
  });

  it('is null for an invalid transaction date', () => {
    expect(dayGap(doc, buildTransaction({ transactionAt: new Date('invalid') }))).toBeNull();
  });
});
