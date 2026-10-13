import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';
import { buildRotatingFileTransportOptions, LOG_FILE_NAME } from '@/lib/logging/rotating-file-options';

describe('buildRotatingFileTransportOptions', () => {
  it('rotates by size and interval, gzips, and caps the number of files', () => {
    const options = buildRotatingFileTransportOptions({
      enabled: true,
      dir: 'logs',
      size: '10M',
      interval: '1d',
      maxFiles: 14,
    });

    expect(options).toEqual({
      fileName: LOG_FILE_NAME,
      streamOptions: { path: 'logs', size: '10M', interval: '1d', compress: 'gzip', maxFiles: 14 },
    });
  });
});

describe('rotation with the built options (real files)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-rotate-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeChunk(stream: RotatingFileStream, chunk: string): Promise<void> {
    return new Promise((resolve) => {
      stream.once('rotated', () => resolve());
      stream.write(chunk);
    });
  }

  it('produces gzip-compressed rotated files and keeps at most maxFiles', async () => {
    const { fileName, streamOptions } = buildRotatingFileTransportOptions({
      enabled: true,
      dir,
      size: '1K',
      interval: '1d',
      maxFiles: 2,
    });
    const stream = createStream(fileName, streamOptions);
    const chunk = `${'x'.repeat(1100)}\n`;

    for (let i = 0; i < 4; i++) await writeChunk(stream, chunk);
    await new Promise<void>((resolve) => stream.end(resolve));

    const rotated = fs.readdirSync(dir).filter((name) => name.endsWith('.gz'));
    expect(rotated.length).toBeGreaterThan(0);
    expect(rotated.length).toBeLessThanOrEqual(2);
    const gzipMagic = fs.readFileSync(path.join(dir, rotated[0])).subarray(0, 2);
    expect([...gzipMagic]).toEqual([0x1f, 0x8b]);
  });
});
