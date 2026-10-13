import sharp from 'sharp';

export const MAX_PHOTO_WIDTH = 1600;
const JPEG_QUALITY = 80;

/**
 * Prepares a phone photo for committing: applies EXIF orientation, shrinks to ≤ 1600 px wide and re-encodes as JPEG.
 * sharp drops all metadata on output by default, which removes EXIF — including GPS location.
 */
export function sanitizePhoto(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: MAX_PHOTO_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
