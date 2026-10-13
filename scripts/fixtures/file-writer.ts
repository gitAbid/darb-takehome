import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type WriteOutcome = 'written' | 'skipped';
export type JsonFormatter = (path: string, value: unknown) => Promise<string>;

/** Writes bytes unless the file exists (committed fixtures keep their hashes) or force is set. */
export function writeIfMissing(path: string, bytes: Uint8Array, force: boolean): WriteOutcome {
  if (existsSync(path) && !force) return 'skipped';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return 'written';
}

/** Writes JSON through the given formatter (Prettier in the CLI), so reruns produce no diff. */
export async function writeJson(path: string, value: unknown, format: JsonFormatter): Promise<void> {
  const formatted = await format(path, value);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatted);
}
