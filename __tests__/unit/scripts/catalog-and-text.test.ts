import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { DOCUMENT_SPECS, documentFileName, isPhotoScenario } from '@/scripts/fixtures/document-catalog';
import { parseExtractionText, readExtractionText } from '@/scripts/fixtures/extraction-file';
import { SCENARIOS_DIR } from '@/scripts/fixtures/paths';
import { receiptLines } from '@/scripts/fixtures/receipt-lines';

describe('document catalog', () => {
  it('lists each scenario once, and every listed scenario has an extraction', () => {
    const folders = DOCUMENT_SPECS.map((spec) => spec.folder);
    expect(new Set(folders).size).toBe(folders.length);
    for (const folder of folders) expect(existsSync(join(SCENARIOS_DIR, folder, 'extraction.json'))).toBe(true);
  });

  it('has 4 photo scenarios out of 12 documents (≈ 67/33 generated/photographed)', () => {
    expect(DOCUMENT_SPECS).toHaveLength(12);
    expect(DOCUMENT_SPECS.filter(isPhotoScenario).map((spec) => spec.folder)).toEqual([
      '01-exact-match',
      '03-restaurant-tip',
      '09-card-misread',
      '12-back-to-back-refuel',
    ]);
  });

  it('names PDFs and images by style', () => {
    expect(documentFileName('invoice-pdf')).toBe('document.pdf');
    expect(documentFileName('garbage-jpeg')).toBe('document.jpg');
  });
});

describe('receiptLines', () => {
  it('splits lines and trims trailing whitespace', () => {
    expect(receiptLines('A  \nB\n')).toEqual(['A', 'B', '']);
  });

  it('applies every printed-text override', () => {
    expect(receiptLines('MADA **** 4477\nREF 4477', [['4477', '4471']])).toEqual(['MADA **** 4471', 'REF 4471']);
  });
});

describe('extraction text', () => {
  it('reads the raw text of a result fixture', () => {
    expect(readExtractionText('01-exact-match').rawText).toContain('TOTAL SAR 150.00');
  });

  it('reads an error fixture as having no text', () => {
    expect(readExtractionText('10-extractor-error')).toEqual({ kind: 'error', rawText: null });
  });

  it.each([
    ['not an object', null, 'must be an object'],
    ['unknown kind', { kind: 'maybe' }, 'kind must be'],
    ['result without text', { kind: 'result' }, 'needs a rawText'],
  ])('rejects %s', (_label, json, message) => {
    expect(() => parseExtractionText(json, 'x.json')).toThrow(message);
  });
});
