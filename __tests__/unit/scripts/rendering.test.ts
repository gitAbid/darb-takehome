import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

import { greyNoise, seededRandom } from '@/scripts/fixtures/seeded-noise';
import {
  renderGarbageJpeg,
  renderInterimPhotoJpeg,
  renderLogoPng,
  renderReceiptJpeg,
} from '@/scripts/fixtures/render-image';
import { renderInvoicePdf, renderThermalPdf, thermalPageWidth } from '@/scripts/fixtures/render-pdf';

const LINES = ['ALFANAR FUEL STATION 04', 'RIYADH', 'UNLEADED 91  45.60 L', 'TOTAL SAR 150.00', 'MADA **** 4471'];
const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;
const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-';

describe('seeded noise', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(greyNoise(4, 4, 1, 0, 255)).toEqual(greyNoise(4, 4, 1, 0, 255));
    expect(greyNoise(4, 4, 1, 0, 255)).not.toEqual(greyNoise(4, 4, 2, 0, 255));
  });

  it('stays within the requested range and returns RGB triplets of equal value', () => {
    const pixels = greyNoise(10, 10, 3, 200, 210);
    expect(pixels).toHaveLength(300);
    expect(Math.min(...pixels)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...pixels)).toBeLessThanOrEqual(210);
    expect(pixels[0]).toBe(pixels[1]);
  });

  it('produces values in [0, 1)', () => {
    const random = seededRandom(42);
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value >= 0 && value < 1).toBe(true);
    }
  });
});

describe('image rendering', () => {
  it.each([
    ['clean receipt', renderReceiptJpeg],
    ['interim photo', renderInterimPhotoJpeg],
    ['garbage photo', renderGarbageJpeg],
  ])('renders a %s as a JPEG of at least 10 KB, identically every time', async (_label, render) => {
    const first = await render(LINES, 7);
    expect(isJpeg(first)).toBe(true);
    expect(first.length).toBeGreaterThanOrEqual(10 * 1024);
    expect(await render(LINES, 7)).toEqual(first);
  });

  it('renders a small PNG logo below the 8 KB logo heuristic', async () => {
    const logo = await renderLogoPng();
    const metadata = await sharp(logo).metadata();
    expect(metadata.format).toBe('png');
    expect(logo.length).toBeLessThan(8 * 1024);
  });
});

describe('PDF rendering', () => {
  it('renders an A4 invoice deterministically with fixed metadata', async () => {
    const first = await renderInvoicePdf(LINES);
    expect(isPdf(first)).toBe(true);
    expect(await renderInvoicePdf(LINES)).toEqual(first);
    const pdf = await PDFDocument.load(first, { updateMetadata: false });
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
    expect(pdf.getProducer()).toBe('darb-takehome fixture renderer');
    expect(pdf.getCreationDate()?.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('renders an invoice with no lines', async () => {
    expect(isPdf(await renderInvoicePdf([]))).toBe(true);
  });

  it('renders an 80 mm thermal receipt whose height grows with the content', async () => {
    const short = await PDFDocument.load(await renderThermalPdf(['A']));
    const long = await PDFDocument.load(await renderThermalPdf(LINES));
    expect(long.getPage(0).getWidth()).toBeCloseTo(thermalPageWidth(), 3);
    expect(thermalPageWidth()).toBeCloseTo(226.77, 1);
    expect(long.getPage(0).getHeight()).toBeGreaterThan(short.getPage(0).getHeight());
  });
});
