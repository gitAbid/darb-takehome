import { randomUUID } from 'node:crypto';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

import { RUNS_DIR, TEMPLATE_DB } from './test-database-paths';

// Runs before each test file: give it a private copy of the migrated database.
const databaseFile = join(RUNS_DIR, `${process.env.JEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);
copyFileSync(TEMPLATE_DB, databaseFile);
process.env.DATABASE_URL = `file:${databaseFile}`;
