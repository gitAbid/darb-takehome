import { ExtractionFailedError } from '@/lib/extraction/extraction-errors';
import { FixtureRegistry } from '@/lib/extraction/fixture-registry';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';

import { createTempFixtures, RECEIPT, resultJson } from './temp-fixtures';

let fixtures: ReturnType<typeof createTempFixtures>;
/** Typed as the interface: the pipeline only ever sees a DocumentExtractor. */
let extractor: DocumentExtractor;

beforeEach(() => {
  fixtures = createTempFixtures();
  fixtures.addScenario('01-exact-match', { 'document.jpg': 'receipt-bytes', 'extraction.json': resultJson() });
  fixtures.addScenario('10-extractor-error', {
    'document.pdf': 'failing-bytes',
    'extraction.json': JSON.stringify({ kind: 'error', message: 'Extraction provider returned 503' }),
  });
  extractor = new MockExtractor(FixtureRegistry.load(fixtures.root));
});
afterEach(() => fixtures.cleanup());

describe('MockExtractor', () => {
  it('returns the scripted extraction for a known file, without the fixture-only kind field', async () => {
    const result = await extractor.extract(Buffer.from('receipt-bytes'), 'image/jpeg');
    expect(result).toEqual(RECEIPT);
    expect(result).not.toHaveProperty('kind');
  });

  it('is deterministic and ignores the declared mime type', async () => {
    const first = await extractor.extract(Buffer.from('receipt-bytes'), 'image/jpeg');
    const second = await extractor.extract(Buffer.from('receipt-bytes'), 'application/octet-stream');
    expect(second).toEqual(first);
  });

  it('throws ExtractionFailedError for a fixture that simulates a provider failure', async () => {
    const extraction = extractor.extract(Buffer.from('failing-bytes'), 'application/pdf');
    await expect(extraction).rejects.toBeInstanceOf(ExtractionFailedError);
    await expect(extractor.extract(Buffer.from('failing-bytes'), 'application/pdf')).rejects.toThrow(
      'Extraction provider returned 503',
    );
  });

  it('returns an unreadable result for unknown bytes instead of throwing', async () => {
    const result = await extractor.extract(Buffer.from('never-seen'), 'image/jpeg');
    expect(result).toEqual({
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
  });

  it('returns a fresh object each time so callers cannot corrupt the fallback', async () => {
    const first = await extractor.extract(Buffer.from('x'), 'image/jpeg');
    first.merchantName = 'mutated';
    expect((await extractor.extract(Buffer.from('y'), 'image/jpeg')).merchantName).toBeNull();
  });
});
