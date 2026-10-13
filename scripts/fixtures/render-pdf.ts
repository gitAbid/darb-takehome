import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

const FIXED_DATE = new Date('2025-06-01T00:00:00Z');
const PRODUCER = 'darb-takehome fixture renderer';
const A4 = { width: 595.28, height: 841.89 };
/** 80 mm thermal paper, in PDF points. */
const THERMAL_WIDTH = (80 / 25.4) * 72;
const THERMAL = { margin: 14, fontSize: 10, lineHeight: 15 };
const SEPARATOR_BEFORE = /^(TOTAL|MIXED|UNLEADED|DIESEL|SPECIAL|EXTERIOR)/;

/** A supplier tax invoice on A4: a bold title line, then the remaining lines. */
export async function renderInvoicePdf(lines: readonly string[]): Promise<Uint8Array> {
  const pdf = await createDeterministicPdf('Tax invoice');
  const page = pdf.addPage([A4.width, A4.height]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const [title = '', ...rest] = lines;
  page.drawText(title, { x: 56, y: A4.height - 80, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
  rest.forEach((line, index) => drawLine(page, line, 56, A4.height - 130 - index * 22, regular, 12));
  return pdf.save({ useObjectStreams: false });
}

/** A print-ready 80 mm thermal receipt: Courier, dashed separators before item and total blocks. */
export async function renderThermalPdf(lines: readonly string[]): Promise<Uint8Array> {
  const pdf = await createDeterministicPdf('Thermal receipt');
  const height = THERMAL.margin * 2 + (lines.length + countSeparators(lines)) * THERMAL.lineHeight + THERMAL.lineHeight;
  const page = pdf.addPage([THERMAL_WIDTH, height]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  let y = height - THERMAL.margin - THERMAL.lineHeight;
  for (const line of lines) {
    if (SEPARATOR_BEFORE.test(line)) {
      drawSeparator(page, y + THERMAL.lineHeight / 3);
      y -= THERMAL.lineHeight;
    }
    drawLine(page, line, THERMAL.margin, y, font, THERMAL.fontSize);
    y -= THERMAL.lineHeight;
  }
  return pdf.save({ useObjectStreams: false });
}

export function thermalPageWidth(): number {
  return THERMAL_WIDTH;
}

async function createDeterministicPdf(title: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(title);
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  return pdf;
}

function drawLine(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number): void {
  page.drawText(text, { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
}

function drawSeparator(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: THERMAL.margin, y },
    end: { x: THERMAL_WIDTH - THERMAL.margin, y },
    thickness: 0.6,
    dashArray: [3, 2],
    color: rgb(0.2, 0.2, 0.2),
  });
}

function countSeparators(lines: readonly string[]): number {
  return lines.filter((line) => SEPARATOR_BEFORE.test(line)).length;
}
