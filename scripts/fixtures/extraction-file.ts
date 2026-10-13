import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCENARIOS_DIR } from './paths';

/** The parts of a scenario's extraction.json that rendering needs. */
export interface ExtractionText {
  kind: 'result' | 'error';
  rawText: string | null;
}

export function readExtractionText(folder: string, scenariosDir: string = SCENARIOS_DIR): ExtractionText {
  const file = join(scenariosDir, folder, 'extraction.json');
  return parseExtractionText(JSON.parse(readFileSync(file, 'utf8')), file);
}

export function parseExtractionText(json: unknown, source: string): ExtractionText {
  if (typeof json !== 'object' || json === null) throw new Error(`${source}: extraction must be an object`);
  const { kind, rawText } = json as Record<string, unknown>;
  if (kind !== 'result' && kind !== 'error') throw new Error(`${source}: kind must be "result" or "error"`);
  if (kind === 'result' && typeof rawText !== 'string') throw new Error(`${source}: result needs a rawText string`);
  return { kind, rawText: typeof rawText === 'string' ? rawText : null };
}
