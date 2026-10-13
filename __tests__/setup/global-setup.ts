import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

import { RUNS_DIR, TEMPLATE_DB, TEST_DB_ROOT } from './test-database-paths';

/** Builds a migrated template database once, so integration tests start from the real schema and CHECKs. */
export default function globalSetup(): void {
  rmSync(TEST_DB_ROOT, { recursive: true, force: true });
  mkdirSync(RUNS_DIR, { recursive: true });
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
    stdio: 'ignore',
  });
}
