import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOCUMENT_FILE = /^document\.[a-z0-9]+$/i;
const EXTRACTION_FILE = 'extraction.json';

/** Raw contents of one scenario folder, before validation. */
export interface ScenarioFolderFiles {
  folder: string;
  documentFile: string;
  documentBytes: Buffer;
  extractionJson: string;
}

/**
 * The only file-system access of the registry: reads every `<fixturesDir>/scenarios/<folder>/` that holds a
 * `document.*`. Folders without one (payload-only scenarios) are skipped.
 */
export function readScenarioFolders(fixturesDir: string): ScenarioFolderFiles[] {
  const scenariosDir = join(fixturesDir, 'scenarios');
  return listDirectories(scenariosDir).flatMap((folder) => {
    const documentFile = findDocumentFile(join(scenariosDir, folder), folder);
    if (documentFile === null) return [];
    return [readFolder(scenariosDir, folder, documentFile)];
  });
}

function listDirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();
}

function findDocumentFile(folderPath: string, folder: string): string | null {
  const documents = readdirSync(folderPath).filter((name) => DOCUMENT_FILE.test(name));
  if (documents.length > 1) throw new Error(`Fixture ${folder}: more than one document file (${documents.join(', ')})`);
  return documents[0] ?? null;
}

function readFolder(scenariosDir: string, folder: string, documentFile: string): ScenarioFolderFiles {
  const extractionPath = join(scenariosDir, folder, EXTRACTION_FILE);
  if (!existsSync(extractionPath)) throw new Error(`Fixture ${folder}: missing ${EXTRACTION_FILE}`);
  return {
    folder,
    documentFile,
    documentBytes: readFileSync(join(scenariosDir, folder, documentFile)),
    extractionJson: readFileSync(extractionPath, 'utf8'),
  };
}
