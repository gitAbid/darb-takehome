import { ExtractionFailedError } from '../extraction-errors';
import type { DocumentExtractor, ExtractedDocument } from '../types';

import type { LlmClient } from './chat-completions-client';
import { buildExtractionMessages, replyJsonSchema, type DocumentInput } from './extraction-prompt';
import { llmExtractionSchema } from './llm-extraction.schema';
import type { PdfTextReader } from './pdf-text-reader';
import { toExtractedDocument } from './to-extracted-document';

export interface LlmExtractorDependencies {
  client: LlmClient;
  pdfText: PdfTextReader;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const JSON_SCHEMA = replyJsonSchema(llmExtractionSchema);

/**
 * Real extraction with any vision LLM (bonus B4): document → guided prompt → JSON reply → lenient parse → our own
 * conversions. Provider failures and unusable replies throw ExtractionFailedError, so the document ends FAILED.
 */
export class LlmExtractor implements DocumentExtractor {
  constructor(private readonly deps: LlmExtractorDependencies) {}

  async extract(file: Buffer, mimeType: string): Promise<ExtractedDocument> {
    const messages = buildExtractionMessages(await this.toInput(file, mimeType), JSON_SCHEMA);
    const reply = await this.deps.client.complete({ messages, jsonSchema: JSON_SCHEMA });
    const parsed = llmExtractionSchema.safeParse(parseJsonReply(reply));
    if (!parsed.success) throw new ExtractionFailedError('LLM reply is not a JSON object');
    return toExtractedDocument(parsed.data);
  }

  private async toInput(file: Buffer, mimeType: string): Promise<DocumentInput> {
    const type = mimeType.toLowerCase();
    if (type === 'application/pdf') return { kind: 'text', text: await this.deps.pdfText.read(file) };
    if (IMAGE_TYPES.has(type)) return { kind: 'image', mimeType: type, base64: file.toString('base64') };
    throw new ExtractionFailedError(`Unsupported document type for LLM extraction: ${mimeType}`);
  }
}

/** The reply as JSON, tolerating the code fences some models add despite the rules. */
function parseJsonReply(reply: string): unknown {
  const unfenced = reply.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    throw new ExtractionFailedError('LLM reply is not valid JSON');
  }
}
