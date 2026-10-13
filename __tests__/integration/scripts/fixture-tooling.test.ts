/**
 * Fixture tooling (scripts/fixtures): the rules that keep committed fixtures trustworthy. What the committed files
 * contain is proven by fixtures-consistency.test.ts; this file proves the generators themselves.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { printedLines } from '@/scripts/fixtures/document-renderer';
import { readScenarioDocument } from '@/scripts/fixtures/document-reader';
import { writeIfMissing } from '@/scripts/fixtures/file-writer';
import { assemblePayloadFiles } from '@/scripts/fixtures/payload-assembler';
import { SCENARIO_PAYLOAD_SPECS } from '@/scripts/fixtures/payload-specs';
import type { EmailPayload } from '@/scripts/fixtures/payload-types';
import { LOGO_FILE } from '@/scripts/fixtures/paths';
import { MAX_PHOTO_WIDTH, sanitizePhoto } from '@/scripts/fixtures/photo-sanitizer';

describe('photo sanitizer', () => {
  const phonePhoto = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#d9d4c7' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'PhoneMaker' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 42/1 0/1' } })
      .toBuffer();

  it('strips all EXIF metadata (GPS included) and caps width at 1600 px without enlarging', async () => {
    const large = await sharp(await sanitizePhoto(await phonePhoto(4000, 3000))).metadata();
    expect(large).toMatchObject({ format: 'jpeg', width: MAX_PHOTO_WIDTH, height: 1200 });
    expect(large.exif).toBeUndefined();
    expect((await sharp(await sanitizePhoto(await phonePhoto(640, 480))).metadata()).width).toBe(640);
  });
});

describe('document rendering', () => {
  it('prints the real card on the misread scenario while its extraction reads 4477', () => {
    expect(printedLines('09-card-misread')).toContain('MADA **** 4471');
    expect(printedLines('09-card-misread').join('\n')).not.toContain('4477');
  });

  it('never overwrites a committed document (its hash is load-bearing) unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-io-'));
    const path = join(dir, 'document.jpg');
    writeFileSync(path, 'original');
    expect(writeIfMissing(path, Buffer.from('new'), false)).toBe('skipped');
    expect(readFileSync(path, 'utf8')).toBe('original');
    expect(writeIfMissing(path, Buffer.from('new'), true)).toBe('written');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('payload generation', () => {
  it('is deterministic and attaches the signature logo only to S02', () => {
    const logo = readFileSync(LOGO_FILE);
    const files = assemblePayloadFiles(SCENARIO_PAYLOAD_SPECS, readScenarioDocument, logo);
    expect(assemblePayloadFiles(SCENARIO_PAYLOAD_SPECS, readScenarioDocument, logo)).toEqual(files);
    const withLogo = files.filter(
      (file) =>
        file.path.startsWith('scenarios/') &&
        ((file.content as EmailPayload).attachments ?? []).some((attachment) => attachment.contentType === 'image/png'),
    );
    expect(withLogo.map((file) => file.path)).toEqual(['scenarios/02-ambiguous-same-chain/payload.json']);
    expect(files.filter((file) => file.path.startsWith('payloads/ingestion/'))).toHaveLength(6);
  });
});
