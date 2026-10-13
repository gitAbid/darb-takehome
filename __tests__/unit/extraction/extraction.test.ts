/** The extraction contract and the fixture-based mock extractor (IMPLEMENTATION.md §5.4, brief "OCR Extraction"). */
import { ExtractionFailedError, InvalidExtractionError } from '@/lib/extraction/extraction-errors';
import {
  extractedDocumentSchema,
  fixtureExtractionSchema,
  parseExtractedDocument,
} from '@/lib/extraction/extraction-result.schema';
import type { ScenarioFolderFiles } from '@/lib/extraction/fixture-files';
import { FixtureRegistry } from '@/lib/extraction/fixture-registry';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';

import { RECEIPT, resultJson } from '../../helpers/temp-fixtures';

const folder = (name: string, bytes: string, extractionJson: string): ScenarioFolderFiles => ({
  folder: name,
  documentFile: 'document.jpg',
  documentBytes: Buffer.from(bytes),
  extractionJson,
});

describe('extraction contract', () => {
  it('accepts a full receipt, an all-null unreadable result, and both fixture kinds', () => {
    expect(extractedDocumentSchema.parse(RECEIPT)).toEqual(RECEIPT);
    const unreadable = {
      ...RECEIPT,
      documentType: 'UNKNOWN',
      merchantName: null,
      totalAmount: null,
      documentDate: null,
    };
    expect(extractedDocumentSchema.safeParse(unreadable).success).toBe(true);
    expect(fixtureExtractionSchema.parse({ kind: 'result', ...RECEIPT }).kind).toBe('result');
    expect(fixtureExtractionSchema.parse({ kind: 'error', message: 'provider 503' }).kind).toBe('error');
  });

  it('rejects output that does not honour the contract', () => {
    const invalid = [
      { documentType: 'INVOICE' },
      { extractionConfidence: 1.2 },
      { totalAmount: '150.00' },
      { totalAmount: 150.5 },
      { rawText: undefined },
      { merchantName: 42 },
    ];
    for (const overrides of invalid)
      expect(extractedDocumentSchema.safeParse({ ...RECEIPT, ...overrides }).success).toBe(false);
    for (const value of [RECEIPT, { kind: 'timeout' }, { kind: 'error', message: '' }]) {
      expect(fixtureExtractionSchema.safeParse(value).success).toBe(false);
    }
  });

  it('parseExtractedDocument strips unknown fields and reports every offending path', () => {
    expect(parseExtractedDocument({ ...RECEIPT, providerDebug: 'x' })).toEqual(RECEIPT);
    try {
      parseExtractedDocument({ ...RECEIPT, totalAmount: 'abc', extractionConfidence: 5 });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidExtractionError);
      expect((error as InvalidExtractionError).issues.map((issue) => issue.split(':')[0])).toEqual([
        'totalAmount',
        'extractionConfidence',
      ]);
    }
    expect(() => parseExtractedDocument(null)).toThrow('(root)');
  });
});

describe('FixtureRegistry', () => {
  it('rejects ambiguous fixtures (identical bytes) and invalid extraction files, naming the folder', () => {
    const same = [folder('01-a', 'same', resultJson()), folder('02-b', 'same', resultJson())];
    expect(() => FixtureRegistry.fromFolders(same)).toThrow('Fixtures 01-a and 02-b have identical document bytes');
    expect(() => FixtureRegistry.fromFolders([folder('03-bad', 'a', '{"kind":"result"}')])).toThrow(/Fixture 03-bad: /);
    expect(() => FixtureRegistry.fromFolders([folder('03-broken', 'a', '{ nope')])).toThrow(/not valid JSON/);
  });
});

describe('MockExtractor', () => {
  const extractor: DocumentExtractor = new MockExtractor(
    FixtureRegistry.fromFolders([
      folder('01-exact-match', 'receipt-bytes', resultJson()),
      folder(
        '10-extractor-error',
        'failing-bytes',
        JSON.stringify({ kind: 'error', message: 'provider returned 503' }),
      ),
    ]),
  );

  it('returns the scripted extraction for known bytes, deterministically and whatever the mime type', async () => {
    await expect(extractor.extract(Buffer.from('receipt-bytes'), 'image/jpeg')).resolves.toEqual(RECEIPT);
    await expect(extractor.extract(Buffer.from('receipt-bytes'), 'application/octet-stream')).resolves.toEqual(RECEIPT);
  });

  it('throws ExtractionFailedError for a fixture that simulates a provider failure', async () => {
    await expect(extractor.extract(Buffer.from('failing-bytes'), 'application/pdf')).rejects.toThrow(
      new ExtractionFailedError('provider returned 503'),
    );
  });

  it('returns a fresh unreadable result (UNKNOWN, all null, confidence 0) for bytes it has never seen', async () => {
    const first = await extractor.extract(Buffer.from('never-seen'), 'image/jpeg');
    expect(first).toEqual({
      documentType: 'UNKNOWN',
      merchantName: null,
      vatNumber: null,
      totalAmount: null,
      currency: null,
      documentDate: null,
      cardLast4: null,
      invoiceNumber: null,
      rawText: '',
      extractionConfidence: 0,
    });
    first.merchantName = 'mutated';
    expect((await extractor.extract(Buffer.from('other'), 'image/jpeg')).merchantName).toBeNull();
  });
});
