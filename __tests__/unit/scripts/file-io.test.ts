import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentTypeFor, readScenarioDocument } from '@/scripts/fixtures/document-reader';
import { writeIfMissing, writeJson } from '@/scripts/fixtures/file-writer';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fixture-io-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('writeIfMissing', () => {
  it('creates missing directories and writes the file', () => {
    const path = join(dir, 'a', 'b', 'doc.bin');
    expect(writeIfMissing(path, Buffer.from('one'), false)).toBe('written');
    expect(readFileSync(path, 'utf8')).toBe('one');
  });

  it('keeps an existing file (its hash is committed) unless forced', () => {
    const path = join(dir, 'doc.bin');
    writeFileSync(path, 'original');
    expect(writeIfMissing(path, Buffer.from('new'), false)).toBe('skipped');
    expect(readFileSync(path, 'utf8')).toBe('original');
    expect(writeIfMissing(path, Buffer.from('new'), true)).toBe('written');
    expect(readFileSync(path, 'utf8')).toBe('new');
  });
});

describe('writeJson', () => {
  const format = async (_path: string, value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

  it('writes the formatter output, creating missing directories', async () => {
    const path = join(dir, 'nested', 'payload.json');
    await writeJson(path, { b: [{ c: 1 }], a: 'x' }, format);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ b: [{ c: 1 }], a: 'x' });
  });

  it('passes the target path to the formatter (Prettier resolves its config from it)', async () => {
    const seen: string[] = [];
    const path = join(dir, 'p.json');
    await writeJson(path, {}, async (target) => {
      seen.push(target);
      return '{}\n';
    });
    expect(seen).toEqual([path]);
  });

  it('propagates formatter failures without writing', async () => {
    const path = join(dir, 'bad.json');
    await expect(writeJson(path, {}, () => Promise.reject(new Error('format failed')))).rejects.toThrow(
      'format failed',
    );
    expect(existsSync(path)).toBe(false);
  });
});

describe('readScenarioDocument', () => {
  it('reads a committed document with its relative path and content type', () => {
    const document = readScenarioDocument('02-ambiguous-same-chain');
    expect(document).toMatchObject({
      file: 'scenarios/02-ambiguous-same-chain/document.pdf',
      extension: '.pdf',
      contentType: 'application/pdf',
    });
    expect(document.bytes.length).toBeGreaterThan(0);
  });

  it('fails clearly when the document has not been rendered', () => {
    mkdirSync(join(dir, '01-x'));
    expect(() => readScenarioDocument('01-x', dir)).toThrow('run npm run fixtures:render');
    expect(existsSync(join(dir, '01-x'))).toBe(true);
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['.pdf', 'application/pdf'],
    ['.JPG', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
  ])('%s → %s', (extension, expected) => {
    expect(contentTypeFor(extension)).toBe(expected);
  });

  it('rejects unsupported extensions', () => {
    expect(() => contentTypeFor('.docx')).toThrow('Unsupported document extension');
  });
});
