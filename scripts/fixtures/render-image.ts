import sharp from 'sharp';

import { buildReceiptSvg, DEFAULT_RECEIPT_SVG_OPTIONS, type ReceiptSvgOptions } from './receipt-svg';
import { greyNoise } from './seeded-noise';

const PHOTO_LIKE_OPTIONS: ReceiptSvgOptions = {
  ...DEFAULT_RECEIPT_SVG_OPTIONS,
  margin: 70,
  background: '#8c8c88',
  paper: '#f4f1ea',
  rotateDegrees: -2.5,
};

/** A clean receipt image (as sent by a supplier or scanned). */
export function renderReceiptJpeg(lines: readonly string[], seed: number): Promise<Buffer> {
  return renderWithGrain(lines, DEFAULT_RECEIPT_SVG_OPTIONS, seed);
}

/** Stand-in for a phone photo until the printed receipt is photographed: tilted paper on a grey desk. */
export function renderInterimPhotoJpeg(lines: readonly string[], seed: number): Promise<Buffer> {
  return renderWithGrain(lines, PHOTO_LIKE_OPTIONS, seed);
}

/** An unreadable photo: heavily blurred text under strong noise (the garbage-extraction case). */
export async function renderGarbageJpeg(lines: readonly string[], seed: number): Promise<Buffer> {
  const { svg, width, height } = buildReceiptSvg(lines, PHOTO_LIKE_OPTIONS);
  const blurred = await sharp(Buffer.from(svg)).blur(9).toBuffer();
  return sharp(blurred)
    .composite([
      { input: greyNoise(width, height, seed, 60, 255), raw: { width, height, channels: 3 }, blend: 'multiply' },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** A small brand logo, the kind of image email signatures attach. */
export function renderLogoPng(): Promise<Buffer> {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    '<circle cx="32" cy="32" r="30" fill="#0b5d3b"/>' +
    '<text x="32" y="42" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#ffffff" text-anchor="middle">A</text>' +
    '</svg>';
  return sharp(Buffer.from(svg)).png({ palette: true }).toBuffer();
}

async function renderWithGrain(lines: readonly string[], options: ReceiptSvgOptions, seed: number): Promise<Buffer> {
  const { svg, width, height } = buildReceiptSvg(lines, options);
  return sharp(Buffer.from(svg))
    .composite([
      { input: greyNoise(width, height, seed, 215, 255), raw: { width, height, channels: 3 }, blend: 'multiply' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
