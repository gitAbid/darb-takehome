/**
 * CLI: npx tsx scripts/fixtures/build-sample-payloads.ts
 * Regenerates every webhook payload and the media map from the committed documents. Safe to rerun: same input, no diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readScenarioDocument } from './document-reader';
import { writeJson } from './file-writer';
import { assemblePayloadFiles } from './payload-assembler';
import { prettierJson } from './prettier-json';
import { SCENARIO_PAYLOAD_SPECS } from './payload-specs';
import { FIXTURES_DIR, LOGO_FILE } from './paths';

async function main(): Promise<void> {
  const files = assemblePayloadFiles(
    SCENARIO_PAYLOAD_SPECS,
    (folder) => readScenarioDocument(folder),
    readFileSync(LOGO_FILE),
  );
  for (const file of files) {
    await writeJson(join(FIXTURES_DIR, file.path), file.content, prettierJson);
    console.log(`wrote fixtures/${file.path}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
