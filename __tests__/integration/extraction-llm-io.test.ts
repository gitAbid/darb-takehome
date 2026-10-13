/** The LLM extractor's real I/O: PDF text layers via unpdf, and (opt-in) a live provider call. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';

import { loadAppConfig } from '@/lib/config/app-config';
import { createExtractor } from '@/lib/extraction/create-extractor';
import { ExtractionFailedError } from '@/lib/extraction/extraction-errors';
import { UnpdfTextReader } from '@/lib/extraction/llm/pdf-text-reader';

import { FIXTURES_DIR } from '../helpers/e2e-app';

const fixture = (folder: string, file: string) => readFileSync(join(FIXTURES_DIR, 'scenarios', folder, file));

describe('PDF text layer', () => {
  it('reads a real invoice PDF, and refuses scanned (text-less) or corrupt PDFs', async () => {
    const reader = new UnpdfTextReader();
    expect(await reader.read(fixture('02-ambiguous-same-chain', 'document.pdf'))).toContain(
      'Total incl. VAT SAR 200.00',
    );

    const blank = await PDFDocument.create();
    blank.addPage();
    const failures = await Promise.all(
      [Buffer.from(await blank.save()), Buffer.from('%PDF-1.7 not really')].map((file) =>
        reader.read(file).catch((error: unknown) => [error instanceof ExtractionFailedError, (error as Error).message]),
      ),
    );
    expect(failures).toEqual([
      [true, 'PDF has no text layer (scanned PDFs are not supported)'],
      [true, 'PDF could not be read'],
    ]);
  });
});

// Opt-in: LLM_LIVE_TEST=1 EXTRACTOR=llm LLM_BASE_URL=… LLM_MODEL=… LLM_API_KEY=… npx jest extraction-llm-io
const live = process.env.LLM_LIVE_TEST === '1' ? describe : describe.skip;

live('live provider (opt-in)', () => {
  it('reads the S01 phone photo: total, card and date as printed', async () => {
    const extractor = createExtractor(loadAppConfig(process.env).extractor, FIXTURES_DIR);
    expect(await extractor.extract(fixture('01-exact-match', 'document.jpg'), 'image/jpeg')).toMatchObject({
      totalAmount: 15000,
      cardLast4: '4471',
      documentDate: '2025-06-10',
    });
  }, 60_000);
});
