/** Fixture registry and media store against a real (temporary) fixtures directory. */
import { contentHash } from '@/lib/domain/content-hash';
import { FixtureRegistry } from '@/lib/extraction/fixture-registry';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';
import { MediaNotFoundError } from '@/lib/media/media-errors';

import { createTempFixtures, resultJson } from '../helpers/temp-fixtures';

let fixtures: ReturnType<typeof createTempFixtures>;

beforeEach(() => {
  fixtures = createTempFixtures();
});
afterEach(() => fixtures.cleanup());

describe('FixtureRegistry.load', () => {
  it('indexes each document by the SHA-256 of its bytes, skipping payload-only folders and stray files', () => {
    expect(FixtureRegistry.load(fixtures.root).size).toBe(0);
    fixtures.addScenario('01-exact-match', { 'document.jpg': 'jpeg-bytes', 'extraction.json': resultJson() });
    fixtures.addScenario('04-duplicate-photo', { 'payload.json': '{}' });
    fixtures.writeRootFile('README.txt', 'not a scenario');
    const registry = FixtureRegistry.load(fixtures.root);
    expect(registry.size).toBe(1);
    expect(registry.lookup(contentHash(Buffer.from('jpeg-bytes')))).toMatchObject({
      folder: '01-exact-match',
      storageKey: 'scenarios/01-exact-match/document.jpg',
    });
    expect(registry.lookup(contentHash(Buffer.from('other')))).toBeUndefined();
  });

  it('rejects a folder missing extraction.json or holding two documents', () => {
    fixtures.addScenario('05-missing', { 'document.pdf': 'a' });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow('Fixture 05-missing: missing extraction.json');
    fixtures.cleanup();
    fixtures = createTempFixtures();
    fixtures.addScenario('06-two', { 'document.jpg': 'a', 'document.png': 'b', 'extraction.json': resultJson() });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow(/Fixture 06-two: more than one document file/);
  });
});

describe('FixtureMediaStore', () => {
  const PHOTO = { file: 'scenarios/01-exact-match/document.jpg', mimeType: 'image/jpeg' };
  const storeWith = (map: unknown) => {
    fixtures.writeRootFile('media-map.json', JSON.stringify(map));
    return FixtureMediaStore.load(fixtures.root);
  };

  beforeEach(() => fixtures.addScenario('01-exact-match', { 'document.jpg': 'photo-bytes' }));

  it('serves bytes, mime type and storage key — the same file for two media ids (resend)', async () => {
    const store = storeWith({ media_0101: PHOTO, media_0102: PHOTO });
    await expect(store.fetch('media_0101')).resolves.toEqual({
      bytes: Buffer.from('photo-bytes'),
      mimeType: 'image/jpeg',
      storageKey: PHOTO.file,
    });
    expect((await store.fetch('media_0102')).bytes).toEqual(Buffer.from('photo-bytes'));
  });

  it('raises MediaNotFoundError for an unknown id, a prototype key, or a file missing on disk', async () => {
    const store = storeWith({
      media_0101: PHOTO,
      media_0103: { file: 'scenarios/gone/document.jpg', mimeType: 'image/jpeg' },
    });
    for (const id of ['media_9999', 'constructor', 'media_0103']) {
      await expect(store.fetch(id)).rejects.toBeInstanceOf(MediaNotFoundError);
    }
  });

  it('refuses a media map that escapes the fixtures directory, is incomplete, not JSON, or absent', () => {
    for (const file of ['../secrets.txt', 'scenarios/../../secrets.txt', '/etc/passwd']) {
      expect(() => storeWith({ media_x: { file, mimeType: 'image/jpeg' } })).toThrow(/fixtures directory/);
    }
    expect(() => storeWith({ media_x: { file: 'a.jpg' } })).toThrow(/media_x.mimeType/);
    fixtures.writeRootFile('media-map.json', '{ nope');
    expect(() => FixtureMediaStore.load(fixtures.root)).toThrow('media-map.json is not valid JSON');
    fixtures.cleanup();
    fixtures = createTempFixtures();
    expect(() => FixtureMediaStore.load(fixtures.root)).toThrow();
  });
});
