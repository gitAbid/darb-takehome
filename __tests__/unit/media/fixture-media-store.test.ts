import { MediaNotFoundError } from '@/lib/media/media-errors';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';

import { createTempFixtures } from '../extraction/temp-fixtures';

let fixtures: ReturnType<typeof createTempFixtures>;

beforeEach(() => {
  fixtures = createTempFixtures();
  fixtures.addScenario('01-exact-match', { 'document.jpg': 'photo-bytes' });
});
afterEach(() => fixtures.cleanup());

function storeWith(map: unknown): FixtureMediaStore {
  fixtures.writeRootFile('media-map.json', JSON.stringify(map));
  return FixtureMediaStore.load(fixtures.root);
}

const PHOTO = { file: 'scenarios/01-exact-match/document.jpg', mimeType: 'image/jpeg' };

describe('FixtureMediaStore', () => {
  it('returns the bytes, mime type and storage key for a known media id', async () => {
    const media = await storeWith({ media_0101: PHOTO }).fetch('media_0101');
    expect(media).toEqual({
      bytes: Buffer.from('photo-bytes'),
      mimeType: 'image/jpeg',
      storageKey: 'scenarios/01-exact-match/document.jpg',
    });
  });

  it('serves the same file for two media ids (the resend scenario)', async () => {
    const store = storeWith({ media_0101: PHOTO, media_0102: PHOTO });
    expect((await store.fetch('media_0102')).bytes).toEqual((await store.fetch('media_0101')).bytes);
  });

  it('throws MediaNotFoundError for an unknown media id', async () => {
    const fetching = storeWith({ media_0101: PHOTO }).fetch('media_9999');
    await expect(fetching).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(storeWith({ media_0101: PHOTO }).fetch('media_9999')).rejects.toThrow('unknown media id');
  });

  it('does not treat object prototype keys as media ids', async () => {
    await expect(storeWith({ media_0101: PHOTO }).fetch('constructor')).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it('throws MediaNotFoundError when the mapped file is missing on disk', async () => {
    const store = storeWith({ media_0103: { file: 'scenarios/gone/document.jpg', mimeType: 'image/jpeg' } });
    await expect(store.fetch('media_0103')).rejects.toThrow('file scenarios/gone/document.jpg is missing');
  });

  it.each([
    ['a parent-directory escape', '../secrets.txt'],
    ['a nested escape', 'scenarios/../../secrets.txt'],
    ['an absolute path', '/etc/passwd'],
  ])('rejects %s in the media map', (_label, file) => {
    expect(() => storeWith({ media_x: { file, mimeType: 'image/jpeg' } })).toThrow(
      /media-map.json: .*fixtures directory/,
    );
  });

  it('rejects a media map with missing fields', () => {
    expect(() => storeWith({ media_x: { file: 'a.jpg' } })).toThrow(/media-map.json: media_x.mimeType/);
  });

  it('rejects a media map that is not JSON', () => {
    fixtures.writeRootFile('media-map.json', '{ nope');
    expect(() => FixtureMediaStore.load(fixtures.root)).toThrow('media-map.json is not valid JSON');
  });

  it('fails to load when the media map file is absent', () => {
    expect(() => FixtureMediaStore.load(fixtures.root)).toThrow();
  });
});
