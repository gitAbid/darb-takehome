/**
 * docs/SCENARIOS.md is the single source of truth. This test fails if the seed, the fixture documents, the extraction
 * results, the media map or the sample payloads drift away from it or from each other.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contentHash } from '@/lib/domain/content-hash';
import { ExtractionFailedError } from '@/lib/extraction/extraction-errors';
import { FixtureRegistry } from '@/lib/extraction/fixture-registry';
import { MockExtractor } from '@/lib/extraction/mock-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';
import { TRANSACTIONS } from '@/prisma/seed-data/transactions';

const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'fixtures');
const SCENARIOS_DOC = readFileSync(join(ROOT, 'docs', 'SCENARIOS.md'), 'utf8');
const LOGO_MAX_BYTES = 8 * 1024;

interface EmailPayload {
  attachments: { filename: string; contentType: string; contentBase64: string }[];
}
interface WhatsAppPayload {
  entry: { changes: { value: { messages: { image: { id: string; sha256: string } }[] } }[] }[];
}

const registry = FixtureRegistry.load(FIXTURES);
const mediaStore = FixtureMediaStore.load(FIXTURES);
const extractor: DocumentExtractor = new MockExtractor(registry);
const folders = readdirSync(join(FIXTURES, 'scenarios')).sort();

function readJson<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...path), 'utf8')) as T;
}

function folderFor(id: string): string {
  const folder = folders.find((name) => name.startsWith(`${id}-`));
  if (!folder) throw new Error(`No fixture folder for ${id}`);
  return folder;
}

function documentFile(folder: string): string {
  const file = readdirSync(join(FIXTURES, 'scenarios', folder)).find((name) => name.startsWith('document.'));
  if (!file) throw new Error(`No document in ${folder}`);
  return file;
}

function documentHashesInPayload(folder: string): Promise<string[]> {
  const payload = readJson<EmailPayload | WhatsAppPayload>('scenarios', folder, 'payload.json');
  if ('attachments' in payload) {
    const documents = payload.attachments
      .map((attachment) => Buffer.from(attachment.contentBase64, 'base64'))
      .filter((bytes) => bytes.length >= LOGO_MAX_BYTES || !isImage(bytes));
    return Promise.resolve(documents.map(contentHash));
  }
  const messages = payload.entry.flatMap((entry) => entry.changes.flatMap((change) => change.value.messages));
  return Promise.all(
    messages.map(async ({ image }) => {
      const media = await mediaStore.fetch(image.id);
      expect(contentHash(media.bytes)).toBe(image.sha256);
      return image.sha256;
    }),
  );
}

function isImage(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || bytes[0] === 0xff;
}

describe('fixtures ⇄ docs/SCENARIOS.md ⇄ seed', () => {
  const fixtureIds = [...SCENARIOS_DOC.matchAll(/^\| F(\d\d) +\| (GEN|PHOTO) /gm)].map((match) => match[1]);
  const scenarioIds = [...SCENARIOS_DOC.matchAll(/^\| S(\d\d) +\|/gm)].map((match) => match[1]);

  it('documents 12 fixtures and 13 end-to-end scenarios', () => {
    expect(fixtureIds).toHaveLength(12);
    expect(scenarioIds).toHaveLength(13);
  });

  it('has a folder with document + extraction for every fixture row, and nothing unlisted', () => {
    for (const id of fixtureIds) expect(documentFile(folderFor(id))).toMatch(/^document\.(pdf|jpg)$/);
    expect(registry.size).toBe(fixtureIds.length);
  });

  it('registers each document under its own folder’s extraction', () => {
    for (const id of fixtureIds) {
      const folder = folderFor(id);
      const bytes = readFileSync(join(FIXTURES, 'scenarios', folder, documentFile(folder)));
      const entry = registry.lookup(contentHash(bytes));
      expect(entry?.folder).toBe(folder);
      expect(entry?.extraction).toEqual(readJson('scenarios', folder, 'extraction.json'));
    }
  });

  it('has a payload for every scenario whose document hashes resolve to that scenario’s fixture', async () => {
    for (const id of scenarioIds) {
      const folder = folderFor(id);
      const hashes = await documentHashesInPayload(folder);
      expect(hashes).toHaveLength(1);
      const expectedFolder = id === '04' ? folderFor('01') : folder;
      expect(registry.lookup(hashes[0])?.folder).toBe(expectedFolder);
    }
  });

  it('S04 resends S01’s exact bytes under a new message id and media id', async () => {
    const [resent] = await documentHashesInPayload(folderFor('04'));
    const [original] = await documentHashesInPayload(folderFor('01'));
    expect(resent).toBe(original);
  });

  it('S11 is the brief’s literal example payload', () => {
    expect(readJson('scenarios', folderFor('11'), 'payload.json')).toMatchObject({
      messageId: 'msg_8f2a1',
      from: 'billing@alfanar-fuel.com.sa',
      to: 'receipts@darb.example.com',
      subject: 'Tax Invoice #INV-99812',
      receivedAt: '2025-06-14T09:21:00Z',
      attachments: [{ filename: 'invoice-99812.pdf', contentType: 'application/pdf' }],
    });
  });

  it('extracts every result fixture exactly as committed, and fails the error fixture', async () => {
    for (const id of fixtureIds) {
      const folder = folderFor(id);
      const bytes = readFileSync(join(FIXTURES, 'scenarios', folder, documentFile(folder)));
      const { kind, ...expected } = readJson<{ kind: string; message?: string }>(
        'scenarios',
        folder,
        'extraction.json',
      );
      if (kind === 'error')
        await expect(extractor.extract(bytes, 'application/pdf')).rejects.toThrow(ExtractionFailedError);
      else await expect(extractor.extract(bytes, 'image/jpeg')).resolves.toEqual(expected);
    }
  });

  it('seeds exactly the transactions listed in §1', () => {
    const documented = [...SCENARIOS_DOC.matchAll(/^\| (T\d\d) +\| C\d/gm)].map((match) => match[1]);
    expect(TRANSACTIONS.map((transaction) => transaction.ref)).toEqual(documented);
  });
});
