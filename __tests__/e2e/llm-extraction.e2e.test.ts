/**
 * Bonus B4 end to end: real webhooks → LlmExtractor (real prompt, real PDF text layer, real reply parsing) → matching
 * → database. Only the provider is faked; it answers "as printed", the way a vision model reads the document.
 */
import type { CompletionRequest, LlmClient } from '@/lib/extraction/llm/chat-completions-client';
import { LlmExtractor } from '@/lib/extraction/llm/llm-extractor';
import { UnpdfTextReader } from '@/lib/extraction/llm/pdf-text-reader';
import type { ExtractedDocument } from '@/lib/extraction/types';

import { createTestApp, documentOutcome, readFixtureJson, resetAndSeed } from '../helpers/e2e-app';
import { db } from '../helpers/test-database';

/** How a model reports a scenario's document: raw strings, day-first date, currency as printed in Arabic. */
function asPrinted(folder: string) {
  const expected = readFixtureJson<ExtractedDocument>('scenarios', folder, 'extraction.json');
  const [year, month, day] = (expected.documentDate ?? '').split('-');
  return {
    documentType: expected.documentType,
    merchantName: expected.merchantName,
    vatNumber: expected.vatNumber,
    invoiceNumber: expected.invoiceNumber,
    totalAsPrinted: expected.totalAmount === null ? null : (expected.totalAmount / 100).toFixed(2),
    currency: 'ر.س',
    dateAsPrinted: `${day}/${month}/${year}`,
    cardLast4: expected.cardLast4 === null ? null : `MADA **** ${expected.cardLast4}`,
    rawText: expected.rawText,
    confidence: expected.extractionConfidence,
  };
}

function appWithModel(reply: (request: CompletionRequest) => unknown) {
  const requests: CompletionRequest[] = [];
  const client: LlmClient = {
    complete: async (request) => {
      requests.push(request);
      return JSON.stringify(reply(request));
    },
  };
  return { requests, app: createTestApp({ extractor: new LlmExtractor({ client, pdfText: new UnpdfTextReader() }) }) };
}

beforeEach(resetAndSeed);
afterAll(() => db.$disconnect());

describe('LLM extractor through the pipeline (bonus B4)', () => {
  it('S01 phone photo → the model sees the image → same auto-match as the mock', async () => {
    const { app, requests } = appWithModel(() => asPrinted('01-exact-match'));
    await app.post('whatsapp', readFixtureJson('scenarios', '01-exact-match', 'payload.json'));
    expect(requests[0].messages[1].content).toContainEqual(
      expect.objectContaining({ image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } }),
    );
    expect(await documentOutcome('wamid.S01-0001')).toMatchObject({ status: 'MATCHED', reasons: ['ALL_GATES_PASSED'] });
  });

  it('S02 emailed PDF → the model reads its text layer → same near-tie review as the mock', async () => {
    const { app, requests } = appWithModel(() => asPrinted('02-ambiguous-same-chain'));
    await app.post('email', readFixtureJson('scenarios', '02-ambiguous-same-chain', 'payload.json'));
    expect(requests[0].messages[1].content).toContain('Total incl. VAT SAR 200.00');
    expect(await documentOutcome('msg_S02:0')).toMatchObject({ status: 'NEEDS_REVIEW', reasons: ['NEAR_TIE'] });
  });
});
