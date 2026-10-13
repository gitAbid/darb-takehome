import { PrismaUnitOfWork } from '@/lib/repositories/prisma/prisma-unit-of-work';
import type { NewDocument } from '@/lib/repositories/records';

import { createTransactionGraph, db, resetDatabase } from '../../helpers/test-database';

const unitOfWork = new PrismaUnitOfWork(db);

const newDocument = (externalId: string): NewDocument => ({
  source: 'EMAIL',
  externalId,
  contentHash: `hash-${externalId}`,
  senderIdentifier: 'fleet@najd-logistics.example',
  recipientIdentifier: 'receipts+najd@darb.example.com',
  clientId: null,
  status: 'RECEIVED',
  failureReason: null,
  storageKey: null,
  mimeType: 'application/pdf',
});

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaUnitOfWork', () => {
  it('commits every write when the work succeeds', async () => {
    const result = await unitOfWork.run(async ({ documents }) => {
      await documents.insert(newDocument('a'));
      return documents.insert(newDocument('b'));
    });
    expect(result.kind).toBe('created');
    expect(await db.document.count()).toBe(2);
  });

  it('rolls back every write when the work throws or a later write violates a database rule', async () => {
    await expect(
      unitOfWork.run(async ({ documents }) => {
        await documents.insert(newDocument('a'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { transaction } = await createTransactionGraph();
    const confirmed = {
      transactionId: transaction.id,
      rank: 1,
      confidence: 1,
      signals: {},
      flags: [],
      status: 'CONFIRMED' as const,
      decidedBy: 'reviewer:test',
      decidedAt: new Date(),
    };
    await expect(
      unitOfWork.run(async ({ documents, matches }) => {
        const first = await documents.insert(newDocument('b'));
        const second = await documents.insert(newDocument('c'));
        if (first.kind !== 'created' || second.kind !== 'created') throw new Error('setup');
        await matches.createMany(first.id, [confirmed]);
        await matches.createMany(second.id, [confirmed]);
      }),
    ).rejects.toThrow();
    expect(await db.document.count()).toBe(0);
    expect(await db.documentMatch.count()).toBe(0);
  });

  it('lets repositories read their own uncommitted writes', async () => {
    const found = await unitOfWork.run(async ({ documents }) => {
      const inserted = await documents.insert(newDocument('a'));
      return inserted.kind === 'created' ? documents.findById(inserted.id) : null;
    });
    expect(found?.externalId).toBe('a');
  });
});
