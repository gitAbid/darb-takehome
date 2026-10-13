/** A failure while re-matching one document must not stop the others or the transaction ingestion. */
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { createPrismaRepositories } from '@/lib/repositories/prisma/prisma-unit-of-work';
import type { MatchStage } from '@/lib/services/ingestion/match-stage';
import { SenderResolver } from '@/lib/services/ingestion/sender-resolver';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { RematchService } from '@/lib/services/transactions/rematch-service';
import { seedDatabase } from '@/prisma/seed-data/seed-database';

import { db } from '../../helpers/test-database';

const unmatchedInvoice = (externalId: string) =>
  db.document.create({
    data: {
      source: 'EMAIL',
      externalId,
      contentHash: externalId,
      senderIdentifier: 'fleet@najd-logistics.example',
      clientId: 1,
      mimeType: 'application/pdf',
      status: 'UNMATCHED',
      documentType: 'TAX_INVOICE',
      merchantName: 'Sahara Auto Service',
      totalAmount: 34000,
      currency: 'SAR',
      documentDate: new Date('2025-06-15T00:00:00Z'),
      rawText: '',
      extractionConfidence: 0.93,
    },
  });

beforeEach(() => seedDatabase(db));
afterAll(() => db.$disconnect());

it('logs the failing document and still re-matches the rest', async () => {
  const [broken, healthy] = [await unmatchedInvoice('inv-broken'), await unmatchedInvoice('inv-healthy')];
  const run = jest.fn(async (input: { documentId: number }) => {
    if (input.documentId === broken.id) throw new Error('boom');
    return {
      outcome: 'AUTO_MATCHED' as const,
      candidates: [],
      reasons: [],
      excluded: { scope: 0, currency: 0, dateWindow: 0, amount: 0, card: 0 },
    };
  });
  const repositories = createPrismaRepositories(db);
  const logger = new RecordingLogger();
  const rematch = new RematchService({
    repositories,
    matchStage: { run } as unknown as MatchStage,
    senders: new SenderResolver(repositories.senders),
    dateRules: defaultMatchingConfig.date,
    logger,
  });

  const summary = await rematch.rematchFor({
    id: 99,
    clientId: 1,
    driverPhone: null,
    transactionAt: new Date('2025-06-15T08:00:00Z'),
  });

  expect(summary).toEqual({ examined: 2, rematched: 1 });
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ documentId: healthy.id, from: 'UNMATCHED' }));
  expect(logger.find('document.failed')).toEqual([
    expect.objectContaining({ context: expect.objectContaining({ documentId: broken.id, stage: 'rematch' }) }),
  ]);
});
