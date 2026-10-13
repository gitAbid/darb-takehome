import { InvalidExtractionError } from '@/lib/extraction/extraction-errors';
import {
  extractedDocumentSchema,
  fixtureExtractionSchema,
  parseExtractedDocument,
} from '@/lib/extraction/extraction-result.schema';

import { RECEIPT } from './temp-fixtures';

describe('extractedDocumentSchema', () => {
  it('accepts a full receipt and an all-null garbage result', () => {
    expect(extractedDocumentSchema.parse(RECEIPT)).toEqual(RECEIPT);
    const garbage = {
      ...RECEIPT,
      documentType: 'UNKNOWN',
      merchantName: null,
      vatNumber: null,
      totalAmount: null,
      currency: null,
      documentDate: null,
      cardLast4: null,
      rawText: '#&@',
      extractionConfidence: 0.12,
    };
    expect(extractedDocumentSchema.safeParse(garbage).success).toBe(true);
  });

  it.each([
    ['unknown document type', { documentType: 'INVOICE' }],
    ['confidence above 1', { extractionConfidence: 1.2 }],
    ['negative confidence', { extractionConfidence: -0.1 }],
    ['amount as a decimal string', { totalAmount: '150.00' }],
    ['fractional amount', { totalAmount: 150.5 }],
    ['missing rawText', { rawText: undefined }],
    ['merchant as a number', { merchantName: 42 }],
  ])('rejects %s', (_label, overrides) => {
    expect(extractedDocumentSchema.safeParse({ ...RECEIPT, ...overrides }).success).toBe(false);
  });
});

describe('fixtureExtractionSchema', () => {
  it('accepts a result fixture and an error fixture', () => {
    expect(fixtureExtractionSchema.parse({ kind: 'result', ...RECEIPT }).kind).toBe('result');
    expect(fixtureExtractionSchema.parse({ kind: 'error', message: 'provider 503' })).toEqual({
      kind: 'error',
      message: 'provider 503',
    });
  });

  it.each([
    ['missing kind', RECEIPT],
    ['unknown kind', { kind: 'timeout', message: 'x' }],
    ['error without a message', { kind: 'error', message: '' }],
    ['result with invalid fields', { kind: 'result', ...RECEIPT, extractionConfidence: 2 }],
  ])('rejects %s', (_label, value) => {
    expect(fixtureExtractionSchema.safeParse(value).success).toBe(false);
  });
});

describe('parseExtractedDocument', () => {
  it('returns the validated document', () => {
    expect(parseExtractedDocument(RECEIPT)).toEqual(RECEIPT);
  });

  it('strips unexpected fields from provider output', () => {
    expect(parseExtractedDocument({ ...RECEIPT, providerDebug: 'x' })).not.toHaveProperty('providerDebug');
  });

  it('throws InvalidExtractionError listing every offending path', () => {
    try {
      parseExtractedDocument({ ...RECEIPT, totalAmount: 'abc', extractionConfidence: 5 });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidExtractionError);
      const issues = (error as InvalidExtractionError).issues;
      expect(issues.some((issue) => issue.startsWith('totalAmount:'))).toBe(true);
      expect(issues.some((issue) => issue.startsWith('extractionConfidence:'))).toBe(true);
      expect((error as Error).message).toContain('totalAmount');
    }
  });

  it.each([null, 'text', 42])('reports a non-object value (%p) at the root', (value) => {
    expect(() => parseExtractedDocument(value)).toThrow('(root)');
  });
});
