import type { ExtractorConfig } from '@/lib/config/extractor-config';

import { FixtureRegistry } from './fixture-registry';
import { OpenAiCompatibleClient } from './llm/chat-completions-client';
import { LlmExtractor } from './llm/llm-extractor';
import { UnpdfTextReader } from './llm/pdf-text-reader';
import { MockExtractor } from './mock-extractor';
import type { DocumentExtractor } from './types';

/** Factory: the configured extractor. Nothing else in the pipeline knows which one runs. */
export function createExtractor(config: ExtractorConfig, fixturesDir: string): DocumentExtractor {
  if (config.kind === 'mock') return new MockExtractor(FixtureRegistry.load(fixturesDir));
  return new LlmExtractor({ client: new OpenAiCompatibleClient(config), pdfText: new UnpdfTextReader() });
}
