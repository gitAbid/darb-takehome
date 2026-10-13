import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAppConfig } from '@/lib/config/app-config';
import { createContainer, type ContainerOverrides } from '@/lib/container';
import { FixedClock } from '@/lib/domain/clock';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { seedDatabase } from '@/prisma/seed-data/seed-database';
import { TRANSACTIONS } from '@/prisma/seed-data/transactions';

import { InlineScheduler } from './inline-scheduler';
import { db } from './test-database';

export const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

/** The real application wired for tests: real DB, fixtures and services; inline scheduler, recorded logs, fixed clock. */
export function createTestApp(overrides: ContainerOverrides = {}) {
  const scheduler = new InlineScheduler();
  const logger = new RecordingLogger();
  const config = loadAppConfig({
    FIXTURES_DIR: FIXTURES_DIR,
    BLOB_DIR: process.env.BLOB_DIR ?? mkdtempSync(join(tmpdir(), 'blobs-')),
    MEDIA_FETCH_TIMEOUT_MS: '500',
    LOG_SINK: 'test',
  });
  const container = createContainer(config, {
    db,
    logger,
    scheduler,
    clock: new FixedClock(new Date('2025-06-20T09:00:00Z')),
    ...overrides,
  });
  return {
    logger,
    /** POSTs a payload to a webhook and waits for the post-response processing to finish. */
    async post(channel: 'email' | 'whatsapp', body: unknown) {
      const request = new Request(`http://test/api/webhooks/${channel}`, {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const response = await container.webhooks[channel](request);
      await scheduler.flush();
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    /** POSTs a card-feed transaction and waits for the re-matching it triggers. */
    async postTransaction(body: unknown) {
      const request = new Request('http://test/api/transactions', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const response = await container.transactions(request);
      await scheduler.flush();
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
  };
}

export async function resetAndSeed(): Promise<void> {
  await seedDatabase(db);
}

export function readFixtureJson<T = unknown>(...path: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, ...path), 'utf8')) as T;
}

const REF_BY_ID = new Map(TRANSACTIONS.map((transaction) => [transaction.id, transaction.ref]));

/** A document's persisted outcome in scenario vocabulary (transaction refs like 'T01'). */
export async function documentOutcome(externalId: string) {
  const document = await db.document.findUniqueOrThrow({
    where: { externalId },
    include: { matches: { orderBy: { rank: 'asc' } } },
  });
  return {
    status: document.status,
    reasons: document.decisionReasons,
    failureReason: document.failureReason,
    matches: document.matches.map((match) => [REF_BY_ID.get(match.transactionId), match.status, match.confidence]),
  };
}
