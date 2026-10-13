import { rmSync } from 'node:fs';

import { TEST_DB_ROOT } from './test-database-paths';

export default function globalTeardown(): void {
  rmSync(TEST_DB_ROOT, { recursive: true, force: true });
}
