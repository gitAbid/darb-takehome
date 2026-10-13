import sharp from 'sharp';

import { MAX_PHOTO_WIDTH, sanitizePhoto } from '@/scripts/fixtures/photo-sanitizer';

function phonePhoto(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#d9d4c7' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'PhoneMaker', Model: 'Phone 15', Copyright: 'Driver Name' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 42/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '46/1 40/1 0/1' },
    })
    .toBuffer();
}

describe('sanitizePhoto', () => {
  it('strips EXIF metadata, including GPS location', async () => {
    const input = await phonePhoto(800, 600);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await sanitizePhoto(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.format).toBe('jpeg');
  });

  it('shrinks large photos to the maximum width, keeping the aspect ratio', async () => {
    const metadata = await sharp(await sanitizePhoto(await phonePhoto(4000, 3000))).metadata();
    expect(metadata.width).toBe(MAX_PHOTO_WIDTH);
    expect(metadata.height).toBe(1200);
  });

  it('never enlarges small photos', async () => {
    expect((await sharp(await sanitizePhoto(await phonePhoto(640, 480))).metadata()).width).toBe(640);
  });

  it('rejects input that is not an image', async () => {
    await expect(sanitizePhoto(Buffer.from('not an image'))).rejects.toThrow();
  });
});
