import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DOCUMENT_SPECS } from '@/scripts/fixtures/document-catalog';
import { printedLines, renderDocument, renderPrintable, seedFor } from '@/scripts/fixtures/document-renderer';

describe('renderDocument', () => {
  it.each(DOCUMENT_SPECS.map((spec) => [spec.folder, spec] as const))('renders %s', async (_folder, spec) => {
    const rendered = await renderDocument(spec);
    expect(rendered.fileName).toBe(spec.style === 'invoice-pdf' ? 'document.pdf' : 'document.jpg');
    expect(rendered.bytes.length).toBeGreaterThan(1000);
  });

  it('renders the print version of a photo scenario', async () => {
    const printable = await renderPrintable({ folder: '03-restaurant-tip', style: 'interim-photo-jpeg' });
    expect(printable.fileName).toBe('receipt-03-restaurant-tip.pdf');
  });
});

describe('printedLines', () => {
  it('prints the real card on the misread scenario (the extraction says 4477)', () => {
    const lines = printedLines('09-card-misread');
    expect(lines).toContain('MADA **** 4471');
    expect(lines.join('\n')).not.toContain('4477');
  });

  it('uses fallback lines for the extractor-error invoice', () => {
    expect(printedLines('10-extractor-error')[0]).toBe('TAX INVOICE INV-RS-7781');
  });

  it('fails clearly for an error fixture without fallback lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'));
    try {
      mkdirSync(join(dir, '99-unknown'));
      writeFileSync(join(dir, '99-unknown', 'extraction.json'), JSON.stringify({ kind: 'error', message: 'x' }));
      expect(() => printedLines('99-unknown', dir)).toThrow('no fallback lines');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('seedFor', () => {
  it('is stable per folder and differs between folders', () => {
    expect(seedFor('01-exact-match')).toBe(seedFor('01-exact-match'));
    expect(seedFor('01-exact-match')).not.toBe(seedFor('12-back-to-back-refuel'));
  });
});
