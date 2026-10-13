import { contentHash } from '@/lib/domain/content-hash';
import { FixtureRegistry } from '@/lib/extraction/fixture-registry';

import { createTempFixtures, resultJson } from './temp-fixtures';

let fixtures: ReturnType<typeof createTempFixtures>;

beforeEach(() => {
  fixtures = createTempFixtures();
});
afterEach(() => fixtures.cleanup());

describe('FixtureRegistry.load', () => {
  it('indexes each document by the SHA-256 of its bytes', () => {
    fixtures.addScenario('01-exact-match', { 'document.jpg': 'jpeg-bytes', 'extraction.json': resultJson() });
    fixtures.addScenario('10-extractor-error', {
      'document.pdf': 'pdf-bytes',
      'extraction.json': JSON.stringify({ kind: 'error', message: 'provider 503' }),
    });
    const registry = FixtureRegistry.load(fixtures.root);
    expect(registry.size).toBe(2);
    expect(registry.lookup(contentHash(Buffer.from('jpeg-bytes')))).toMatchObject({
      folder: '01-exact-match',
      storageKey: 'scenarios/01-exact-match/document.jpg',
      extraction: { kind: 'result', merchantName: 'Alfanar Fuel Station 04' },
    });
    expect(registry.lookup(contentHash(Buffer.from('pdf-bytes')))?.extraction).toEqual({
      kind: 'error',
      message: 'provider 503',
    });
  });

  it('skips payload-only folders and stray files', () => {
    fixtures.addScenario('04-duplicate-photo', { 'payload.json': '{}' });
    fixtures.writeRootFile('README.txt', 'not a scenario');
    fixtures.addScenario('01-exact-match', {
      'document.jpg': 'a',
      'extraction.json': resultJson(),
      'payload.json': '{}',
    });
    expect(FixtureRegistry.load(fixtures.root).size).toBe(1);
  });

  it('returns an empty registry when there is no scenarios directory', () => {
    expect(FixtureRegistry.load(fixtures.root).size).toBe(0);
  });

  it('returns undefined for an unknown hash', () => {
    fixtures.addScenario('01', { 'document.jpg': 'a', 'extraction.json': resultJson() });
    expect(FixtureRegistry.load(fixtures.root).lookup(contentHash(Buffer.from('other')))).toBeUndefined();
  });

  it('names the folder and the offending paths when extraction.json is invalid', () => {
    fixtures.addScenario('03-bad', {
      'document.jpg': 'a',
      'extraction.json': JSON.stringify({ kind: 'result', documentType: 'RECEIPT' }),
    });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow(/Fixture 03-bad: .*merchantName/);
  });

  it('names the folder when extraction.json is not JSON', () => {
    fixtures.addScenario('03-broken', { 'document.jpg': 'a', 'extraction.json': '{ nope' });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow(/Fixture 03-broken: extraction.json is not valid JSON/);
  });

  it('rejects a folder whose extraction.json is missing', () => {
    fixtures.addScenario('05-missing', { 'document.pdf': 'a' });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow('Fixture 05-missing: missing extraction.json');
  });

  it('rejects a folder with two document files', () => {
    fixtures.addScenario('06-two', { 'document.jpg': 'a', 'document.png': 'b', 'extraction.json': resultJson() });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow(/Fixture 06-two: more than one document file/);
  });

  it('rejects two folders with identical document bytes (ambiguous fixture)', () => {
    fixtures.addScenario('01-a', { 'document.jpg': 'same', 'extraction.json': resultJson() });
    fixtures.addScenario('02-b', { 'document.jpg': 'same', 'extraction.json': resultJson() });
    expect(() => FixtureRegistry.load(fixtures.root)).toThrow('Fixtures 01-a and 02-b have identical document bytes');
  });
});
