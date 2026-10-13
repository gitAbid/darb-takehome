import { contentHash } from '@/lib/domain/content-hash';

import { describeIssues, fixtureExtractionSchema, type FixtureExtraction } from './extraction-result.schema';
import { readScenarioFolders, type ScenarioFolderFiles } from './fixture-files';

export interface FixtureEntry {
  folder: string;
  /** Path relative to the fixtures directory, e.g. 'scenarios/01-exact-match/document.jpg'. */
  storageKey: string;
  extraction: FixtureExtraction;
}

/** Maps the SHA-256 of each committed fixture document to its scripted extraction. Hashes are computed at load. */
export class FixtureRegistry {
  private constructor(private readonly entries: ReadonlyMap<string, FixtureEntry>) {}

  static load(fixturesDir: string): FixtureRegistry {
    return FixtureRegistry.fromFolders(readScenarioFolders(fixturesDir));
  }

  static fromFolders(folders: readonly ScenarioFolderFiles[]): FixtureRegistry {
    const entries = new Map<string, FixtureEntry>();
    for (const files of folders) {
      const hash = contentHash(files.documentBytes);
      const existing = entries.get(hash);
      if (existing) throw new Error(`Fixtures ${existing.folder} and ${files.folder} have identical document bytes`);
      entries.set(hash, toEntry(files));
    }
    return new FixtureRegistry(entries);
  }

  get size(): number {
    return this.entries.size;
  }

  lookup(hash: string): FixtureEntry | undefined {
    return this.entries.get(hash);
  }
}

function toEntry(files: ScenarioFolderFiles): FixtureEntry {
  return {
    folder: files.folder,
    storageKey: `scenarios/${files.folder}/${files.documentFile}`,
    extraction: parseFixtureExtraction(files.folder, files.extractionJson),
  };
}

function parseFixtureExtraction(folder: string, json: string): FixtureExtraction {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`Fixture ${folder}: extraction.json is not valid JSON (${(error as Error).message})`);
  }
  const parsed = fixtureExtractionSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Fixture ${folder}: ${describeIssues(parsed.error).join('; ')}`);
  return parsed.data;
}
