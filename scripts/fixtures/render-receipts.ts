/**
 * CLI: npx tsx scripts/fixtures/render-receipts.ts [--force]
 * Renders every scenario document, the 80 mm print versions of the photo scenarios, and the logo.
 * Existing files are kept (their hashes are committed) unless --force is passed.
 */
import { join } from 'node:path';

import { DOCUMENT_SPECS, isPhotoScenario } from './document-catalog';
import { renderDocument, renderPrintable } from './document-renderer';
import { writeIfMissing } from './file-writer';
import { LOGO_FILE, PRINT_DIR, SCENARIOS_DIR } from './paths';
import { renderLogoPng } from './render-image';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  for (const spec of DOCUMENT_SPECS) {
    const document = await renderDocument(spec);
    report(join(SCENARIOS_DIR, spec.folder, document.fileName), document.bytes, force);
    if (!isPhotoScenario(spec)) continue;
    const printable = await renderPrintable(spec);
    report(join(PRINT_DIR, printable.fileName), printable.bytes, force);
  }
  report(LOGO_FILE, await renderLogoPng(), force);
}

function report(path: string, bytes: Uint8Array, force: boolean): void {
  const outcome = writeIfMissing(path, bytes, force);
  console.log(`${outcome.padEnd(7)} ${path.replace(`${process.cwd()}/`, '')} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
