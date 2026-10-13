import { z } from 'zod';

import { parseExtractorConfig } from '@/lib/config/extractor-config';
import { createExtractor } from '@/lib/extraction/create-extractor';
import { ExtractionFailedError } from '@/lib/extraction/extraction-errors';
import { OpenAiCompatibleClient, type LlmClient } from '@/lib/extraction/llm/chat-completions-client';
import { buildExtractionMessages, replyJsonSchema } from '@/lib/extraction/llm/extraction-prompt';
import {
  normalizeCardLast4,
  normalizeCurrency,
  normalizeText,
  normalizeVatNumber,
  parseAmountToHalalas,
  parseDateAsPrinted,
} from '@/lib/extraction/llm/field-parsers';
import { llmExtractionSchema } from '@/lib/extraction/llm/llm-extraction.schema';
import { LlmExtractor } from '@/lib/extraction/llm/llm-extractor';
import { toExtractedDocument } from '@/lib/extraction/llm/to-extracted-document';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import { RecordingLogger } from '@/lib/logging/recording-logger';

import { FIXTURES_DIR } from '../../helpers/e2e-app';

const SETTINGS = {
  baseUrl: 'https://llm.example/v1/',
  model: 'vision-model',
  apiKey: 'sk-test',
  timeoutMs: 1000,
  temperature: null,
  structuredOutput: false,
};
const REPLY = {
  documentType: 'RECEIPT',
  merchantName: '  Alfanar   Fuel Station 04 ',
  vatNumber: '300 123 456 700 003',
  invoiceNumber: null,
  totalAsPrinted: 'SAR 150.00',
  currency: 'ر.س',
  dateAsPrinted: '10/06/2025 10:41',
  cardLast4: 'MADA **** 4471',
  rawText: 'ALFANAR FUEL STATION 04',
  confidence: 0.95,
};
const reply = (body: unknown) => ({ choices: [{ message: { content: JSON.stringify(body) } }] });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('reading "as printed" values', () => {
  it('converts amounts, dates and identifiers conservatively — anything unclear becomes null', () => {
    expect(
      ['SAR 1,234.50', '57,50', '٥٧٫٥٠', '150', '57.5', '0.00', '-12.00', '1.234.50', 'about 50', null].map(
        parseAmountToHalalas,
      ),
    ).toEqual([123450, 5750, 5750, 15000, 5750, null, null, null, 5000, null]);
    expect(
      ['2025-06-14', '14/06/2025 20:38', '١٤/٠٦/٢٠٢٥', '2025/6/4', '31/02/2025', '15/12/1446', 'June 14', null].map(
        parseDateAsPrinted,
      ),
    ).toEqual(['2025-06-14', '2025-06-14', '2025-06-14', '2025-06-04', null, null, null, null]);
    expect([
      normalizeVatNumber('300 123 456 700 003'),
      normalizeVatNumber('30012345'),
      normalizeVatNumber(null),
    ]).toEqual(['300123456700003', null, null]);
    expect([normalizeCardLast4('**** 4471'), normalizeCardLast4('٤٤٧١'), normalizeCardLast4('71')]).toEqual([
      '4471',
      '4471',
      null,
    ]);
    expect(['ر.س', 'sar', 'SR', 'Riyal', null].map(normalizeCurrency)).toEqual(['SAR', 'SAR', 'SAR', null, null]);
    expect([normalizeText('  A   B '), normalizeText('   '), normalizeText(null)]).toEqual(['A B', null, null]);
  });

  it('keeps every other field when one is missing or invalid, and caps confidence at what can be verified', () => {
    const lenient = llmExtractionSchema.parse({ ...REPLY, documentType: 'MENU', totalAsPrinted: 150, extra: 'x' });
    expect(lenient).not.toHaveProperty('extra');
    expect(lenient).toMatchObject({ documentType: 'UNKNOWN', totalAsPrinted: null, merchantName: REPLY.merchantName });
    expect(llmExtractionSchema.parse({})).toMatchObject({ merchantName: null, rawText: '', confidence: 0 });

    expect(toExtractedDocument(llmExtractionSchema.parse(REPLY))).toEqual({
      documentType: 'RECEIPT',
      merchantName: 'Alfanar Fuel Station 04',
      vatNumber: '300123456700003',
      invoiceNumber: null,
      totalAmount: 15000,
      currency: 'SAR',
      documentDate: '2025-06-10',
      cardLast4: '4471',
      rawText: 'ALFANAR FUEL STATION 04',
      extractionConfidence: 0.95,
    });
    // A confident model that missed the date (1 of 4 essentials) lands at 0.75 — below the 0.80 auto-match gate.
    const missingDate = toExtractedDocument(llmExtractionSchema.parse({ ...REPLY, dateAsPrinted: 'n/a' }));
    expect(missingDate.extractionConfidence).toBe(0.75);
    expect(toExtractedDocument(llmExtractionSchema.parse({ ...REPLY, confidence: 0.4 })).extractionConfidence).toBe(
      0.4,
    );
  });
});

describe('guided prompt', () => {
  it('embeds the JSON Schema generated from the reply schema, so a new field is asked for automatically', () => {
    const extended = llmExtractionSchema.extend({
      tipAsPrinted: z.string().nullable().catch(null).describe('Tip line as printed'),
    });
    const schema = replyJsonSchema(extended);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema.required).toEqual([...Object.keys(llmExtractionSchema.shape), 'tipAsPrinted']);
    expect(schema).toMatchObject({
      additionalProperties: false,
      properties: { tipAsPrinted: { type: ['string', 'null'] } },
    });

    const [system, user] = buildExtractionMessages({ kind: 'image', mimeType: 'image/jpeg', base64: 'AAAA' }, schema);
    expect(system.content).toContain('"tipAsPrinted"');
    expect(system.content).toContain('Tip line as printed');
    expect(system.content).toMatch(/use null when unknown/);
    expect(user.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
    const [, pdfUser] = buildExtractionMessages({ kind: 'text', text: 'TAX INVOICE' }, schema);
    expect(pdfUser.content).toContain('<document>\nTAX INVOICE\n</document>');
  });
});

describe('LlmExtractor', () => {
  const extractorReplying = (content: string) => {
    const client: LlmClient = { complete: jest.fn().mockResolvedValue(content) };
    const pdfText = { read: jest.fn().mockResolvedValue('TAX INVOICE') };
    return { client, pdfText, extractor: new LlmExtractor({ client, pdfText }) };
  };

  it('extracts an image (fenced JSON tolerated) and sends PDFs as their text layer', async () => {
    const { client, pdfText, extractor } = extractorReplying('```json\n' + JSON.stringify(REPLY) + '\n```');
    expect(await extractor.extract(Buffer.from('jpg'), 'IMAGE/JPEG')).toMatchObject({
      totalAmount: 15000,
      cardLast4: '4471',
    });
    await extractor.extract(Buffer.from('%PDF'), 'application/pdf');
    expect(pdfText.read).toHaveBeenCalledTimes(1);
    const [{ messages }] = (client.complete as jest.Mock).mock.calls[1];
    expect(messages[1].content).toContain('TAX INVOICE');
  });

  it('fails the document (ExtractionFailedError) on replies it cannot use and on unsupported files', async () => {
    const failures = await Promise.all(
      [
        extractorReplying('Sorry, I cannot read this.').extractor.extract(Buffer.from('x'), 'image/png'),
        extractorReplying('[1, 2]').extractor.extract(Buffer.from('x'), 'image/png'),
        extractorReplying('{}').extractor.extract(Buffer.from('x'), 'text/plain'),
      ].map((attempt) =>
        attempt.then(
          () => 'resolved',
          (error: unknown) => error,
        ),
      ),
    );
    expect(failures.map((error) => [error instanceof ExtractionFailedError, (error as Error).message])).toEqual([
      [true, 'LLM reply is not valid JSON'],
      [true, 'LLM reply is not a JSON object'],
      [true, 'Unsupported document type for LLM extraction: text/plain'],
    ]);
  });
});

describe('OpenAI-compatible client', () => {
  const request = { messages: [{ role: 'user' as const, content: 'hi' }], jsonSchema: { type: 'object' } };

  it('speaks the chat-completions wire format; key, temperature and strict output only when configured', async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => jsonResponse(reply(REPLY)));
    const logger = new RecordingLogger();
    expect(JSON.parse(await new OpenAiCompatibleClient(SETTINGS, logger, fetchImpl).complete(request))).toEqual(REPLY);
    expect(logger.find('llm.completed')).toEqual([
      {
        level: 'debug',
        event: 'llm.completed',
        context: expect.objectContaining({ model: 'vision-model', status: 200, promptTokens: null }),
      },
    ]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://llm.example/v1/chat/completions');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer sk-test' });
    expect(JSON.parse(init.body)).toEqual({ model: 'vision-model', messages: request.messages });

    const keyless = { ...SETTINGS, apiKey: null, temperature: 0, structuredOutput: true };
    const usage = { prompt_tokens: 812, completion_tokens: 64 };
    fetchImpl.mockImplementationOnce(async () => jsonResponse({ ...reply(REPLY), usage }));
    await new OpenAiCompatibleClient(keyless, logger, fetchImpl).complete(request);
    expect(logger.find('llm.completed')[1].context).toMatchObject({ promptTokens: 812, completionTokens: 64 });
    const [, structured] = fetchImpl.mock.calls[1];
    expect(structured.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(structured.body).temperature).toBe(0);
    expect(JSON.parse(structured.body).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'extracted_document', strict: true, schema: request.jsonSchema },
    });
  });

  it('turns HTTP errors, empty replies, timeouts and network failures into ExtractionFailedError', async () => {
    const logger = new RecordingLogger();
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const outcomes = await Promise.all(
      [
        () => Promise.resolve(jsonResponse({ error: 'rate limited' }, 429)),
        () => Promise.resolve(jsonResponse({ choices: [{ message: { content: '  ' } }] })),
        () => Promise.resolve(jsonResponse({})),
        () => Promise.reject(timeout),
        () => Promise.reject(new TypeError('fetch failed')),
      ].map((fetchImpl) =>
        new OpenAiCompatibleClient(SETTINGS, logger, fetchImpl as unknown as typeof fetch)
          .complete(request)
          .catch((error: unknown) => [error instanceof ExtractionFailedError, (error as Error).message]),
      ),
    );
    expect(outcomes).toEqual([
      [true, 'LLM request failed: HTTP 429'],
      [true, 'LLM reply was empty'],
      [true, 'LLM reply was empty'],
      [true, 'LLM request timed out after 1000 ms'],
      [true, 'LLM request unreachable'],
    ]);
    expect(logger.find('llm.failed').map((entry) => entry.context)).toEqual([
      expect.objectContaining({ status: 429, detail: '{"error":"rate limited"}' }),
    ]);
  });
});

describe('extractor selection', () => {
  it('defaults to the mock, requires base URL and model for the LLM, and the factory builds the configured one', () => {
    const mock = parseExtractorConfig({});
    expect(mock).toEqual({ ok: true, config: { kind: 'mock' } });
    expect(parseExtractorConfig({ EXTRACTOR: 'llm' })).toEqual({
      ok: false,
      issues: ['LLM_BASE_URL: required when EXTRACTOR=llm', 'LLM_MODEL: required when EXTRACTOR=llm'],
    });
    const llm = parseExtractorConfig({
      EXTRACTOR: 'llm',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'local',
    });
    expect(llm).toEqual({
      ok: true,
      config: {
        kind: 'llm',
        baseUrl: 'http://localhost:11434/v1',
        model: 'local',
        apiKey: null,
        timeoutMs: 30000,
        temperature: null,
        structuredOutput: false,
      },
    });
    const logger = new RecordingLogger();
    expect(createExtractor({ kind: 'mock' }, FIXTURES_DIR, logger)).toBeInstanceOf(MockExtractor);
    if (llm.ok) expect(createExtractor(llm.config, FIXTURES_DIR, logger)).toBeInstanceOf(LlmExtractor);
  });
});
