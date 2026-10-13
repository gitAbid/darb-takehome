/**
 * CLI: npx tsx scripts/fixtures/sanitize-photo.ts <photo-file> <scenario-folder>
 * Replaces fixtures/scenarios/<scenario-folder>/document.jpg with a sanitized phone photo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SCENARIOS_DIR } from './paths';
import { sanitizePhoto } from './photo-sanitizer';

async function main(): Promise<void> {
  const [photo, folder] = process.argv.slice(2);
  if (!photo || !folder) throw new Error('Usage: sanitize-photo.ts <photo-file> <scenario-folder>');
  const target = join(SCENARIOS_DIR, folder, 'document.jpg');
  if (!existsSync(join(SCENARIOS_DIR, folder))) throw new Error(`Unknown scenario folder: ${folder}`);
  const sanitized = await sanitizePhoto(readFileSync(photo));
  writeFileSync(target, sanitized);
  console.log(`wrote ${target} (${(sanitized.length / 1024).toFixed(1)} KB, metadata stripped)`);
  console.log('Now run `npm run fixtures:payloads` so payloads carry the new bytes and hash.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
