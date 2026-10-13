import { extractText, getDocumentProxy } from 'unpdf';

import { ExtractionFailedError } from '../extraction-errors';

/** A PDF's embedded text layer. Interface so a rasterizing reader (for scanned PDFs) can replace it later. */
export interface PdfTextReader {
  read(file: Buffer): Promise<string>;
}

const PDFJS_ERRORS_ONLY = 0;

export class UnpdfTextReader implements PdfTextReader {
  async read(file: Buffer): Promise<string> {
    let text: string;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(file), { verbosity: PDFJS_ERRORS_ONLY });
      text = (await extractText(pdf, { mergePages: true })).text;
    } catch {
      throw new ExtractionFailedError('PDF could not be read');
    }
    if (text.trim() === '') throw new ExtractionFailedError('PDF has no text layer (scanned PDFs are not supported)');
    return text;
  }
}
