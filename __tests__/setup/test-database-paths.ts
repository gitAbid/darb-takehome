import { join } from 'node:path';

/** Scratch area for test databases (gitignored). */
export const TEST_DB_ROOT = join(__dirname, '..', '..', '.jest');
/** Migrated once per test run; every test file gets its own copy. */
export const TEMPLATE_DB = join(TEST_DB_ROOT, 'template.db');
export const RUNS_DIR = join(TEST_DB_ROOT, 'runs');
