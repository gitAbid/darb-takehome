import { join } from 'node:path';

export const REPO_ROOT = join(__dirname, '..', '..');
export const FIXTURES_DIR = join(REPO_ROOT, 'fixtures');
export const SCENARIOS_DIR = join(FIXTURES_DIR, 'scenarios');
export const PRINT_DIR = join(FIXTURES_DIR, 'print');
export const ASSETS_DIR = join(FIXTURES_DIR, 'assets');
export const LOGO_FILE = join(ASSETS_DIR, 'logo.png');
export const INGESTION_PAYLOADS_DIR = join(FIXTURES_DIR, 'payloads', 'ingestion');
export const MEDIA_MAP_FILE = join(FIXTURES_DIR, 'media-map.json');
