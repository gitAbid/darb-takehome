import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ExtractedDocument } from '@/lib/extraction/types';

export const RECEIPT: ExtractedDocument = {
  documentType: 'RECEIPT',
  merchantName: 'Alfanar Fuel Station 04',
  vatNumber: '300123456700003',
  totalAmount: 15000,
  currency: 'SAR',
  documentDate: '2025-06-10',
  cardLast4: '4471',
  invoiceNumber: null,
  rawText: 'ALFANAR FUEL STATION 04\nTOTAL SAR 150.00',
  extractionConfidence: 0.95,
};

/** A throwaway fixtures directory; call cleanup() in afterEach. */
export function createTempFixtures() {
  const root = mkdtempSync(join(tmpdir(), 'darb-fixtures-'));
  return {
    root,
    addScenario(folder: string, files: Record<string, string | Buffer>) {
      const dir = join(root, 'scenarios', folder);
      mkdirSync(dir, { recursive: true });
      for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    },
    writeRootFile(name: string, content: string) {
      writeFileSync(join(root, name), content);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function resultJson(document: ExtractedDocument = RECEIPT): string {
  return JSON.stringify({ kind: 'result', ...document });
}
