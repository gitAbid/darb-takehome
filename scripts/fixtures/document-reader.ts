import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { SCENARIOS_DIR } from './paths';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export interface ScenarioDocument {
  /** Relative to the fixtures directory, e.g. scenarios/01-exact-match/document.jpg */
  file: string;
  extension: string;
  contentType: string;
  bytes: Uint8Array;
}

export type DocumentReader = (folder: string) => ScenarioDocument;

/** Reads fixtures/scenarios/<folder>/document.* from disk. */
export function readScenarioDocument(folder: string, scenariosDir: string = SCENARIOS_DIR): ScenarioDocument {
  const fileName = readdirSync(join(scenariosDir, folder)).find((name) => name.startsWith('document.'));
  if (!fileName) throw new Error(`${folder}: no document.* file — run npm run fixtures:render first`);
  const extension = extname(fileName).toLowerCase();
  return {
    file: `scenarios/${folder}/${fileName}`,
    extension,
    contentType: contentTypeFor(extension),
    bytes: readFileSync(join(scenariosDir, folder, fileName)),
  };
}

export function contentTypeFor(extension: string): string {
  const contentType = CONTENT_TYPES[extension.toLowerCase()];
  if (!contentType) throw new Error(`Unsupported document extension: ${extension}`);
  return contentType;
}
