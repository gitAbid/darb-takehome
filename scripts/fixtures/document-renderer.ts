import { documentFileName, FALLBACK_LINES, PRINTED_TEXT_OVERRIDES, type DocumentSpec } from './document-catalog';
import { readExtractionText } from './extraction-file';
import { receiptLines } from './receipt-lines';
import { renderGarbageJpeg, renderInterimPhotoJpeg, renderReceiptJpeg } from './render-image';
import { renderInvoicePdf, renderThermalPdf } from './render-pdf';
import { SCENARIOS_DIR } from './paths';

export interface RenderedFile {
  fileName: string;
  bytes: Uint8Array;
}

/** Renders the scenario's committed document from the text its extraction says is printed on it. */
export async function renderDocument(spec: DocumentSpec, scenariosDir: string = SCENARIOS_DIR): Promise<RenderedFile> {
  const lines = printedLines(spec.folder, scenariosDir);
  const seed = seedFor(spec.folder);
  const fileName = documentFileName(spec.style);
  switch (spec.style) {
    case 'invoice-pdf':
      return { fileName, bytes: await renderInvoicePdf(lines) };
    case 'receipt-jpeg':
      return { fileName, bytes: await renderReceiptJpeg(lines, seed) };
    case 'interim-photo-jpeg':
      return { fileName, bytes: await renderInterimPhotoJpeg(lines, seed) };
    case 'garbage-jpeg':
      return { fileName, bytes: await renderGarbageJpeg(lines, seed) };
  }
}

/** The 80 mm print version of a photo scenario's receipt. */
export async function renderPrintable(spec: DocumentSpec, scenariosDir: string = SCENARIOS_DIR): Promise<RenderedFile> {
  return {
    fileName: `receipt-${spec.folder}.pdf`,
    bytes: await renderThermalPdf(printedLines(spec.folder, scenariosDir)),
  };
}

export function printedLines(folder: string, scenariosDir: string = SCENARIOS_DIR): string[] {
  const { rawText } = readExtractionText(folder, scenariosDir);
  if (rawText !== null) return receiptLines(rawText, PRINTED_TEXT_OVERRIDES[folder]);
  const fallback = FALLBACK_LINES[folder];
  if (!fallback) throw new Error(`${folder}: extraction has no rawText and no fallback lines are defined`);
  return [...fallback];
}

/** A stable seed per folder, so re-rendering produces identical bytes. */
export function seedFor(folder: string): number {
  return [...folder].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7);
}
