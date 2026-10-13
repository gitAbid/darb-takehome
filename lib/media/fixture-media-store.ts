import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';

import { z } from 'zod';

import { describeIssues } from '@/lib/extraction/extraction-result.schema';

import { MediaNotFoundError } from './media-errors';
import type { MediaObject, MediaStore } from './media-store';

const MEDIA_MAP_FILE = 'media-map.json';

const mediaMapSchema = z.record(
  z.string().min(1),
  z.object({
    file: z.string().min(1).refine(isContainedRelativePath, 'must be a relative path inside the fixtures directory'),
    mimeType: z.string().min(1),
  }),
);

type MediaMap = z.infer<typeof mediaMapSchema>;

/** Media store backed by fixtures/media-map.json (media id → fixture file). Several ids may share one file. */
export class FixtureMediaStore implements MediaStore {
  private constructor(
    private readonly fixturesDir: string,
    private readonly mediaMap: MediaMap,
  ) {}

  static load(fixturesDir: string): FixtureMediaStore {
    return new FixtureMediaStore(fixturesDir, parseMediaMap(readFileSync(join(fixturesDir, MEDIA_MAP_FILE), 'utf8')));
  }

  async fetch(mediaId: string): Promise<MediaObject> {
    const entry = Object.hasOwn(this.mediaMap, mediaId) ? this.mediaMap[mediaId] : undefined;
    if (entry === undefined) throw new MediaNotFoundError(mediaId, 'unknown media id');
    const path = join(this.fixturesDir, entry.file);
    if (!existsSync(path)) throw new MediaNotFoundError(mediaId, `file ${entry.file} is missing`);
    return { bytes: readFileSync(path), mimeType: entry.mimeType, storageKey: entry.file };
  }
}

function parseMediaMap(json: string): MediaMap {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`${MEDIA_MAP_FILE} is not valid JSON (${(error as Error).message})`);
  }
  const parsed = mediaMapSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${MEDIA_MAP_FILE}: ${describeIssues(parsed.error).join('; ')}`);
  return parsed.data;
}

function isContainedRelativePath(file: string): boolean {
  if (isAbsolute(file)) return false;
  const normalized = normalize(file);
  return normalized !== '..' && !normalized.startsWith(`..${sep}`);
}
