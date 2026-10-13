/** The business rules the database itself enforces (IMPLEMENTATION.md §6.2), proven against the real migrated schema. */
import { checkViolationName, uniqueViolationFields } from '@/lib/repositories/prisma/map-prisma-error';

import { createDocument, createTransactionGraph, db, resetDatabase } from '../helpers/test-database';

const confirmed = (documentId: number, transactionId: number) => ({
  documentId,
  transactionId,
  rank: 1,
  confidence: 1,
  signals: {},
  flags: [],
  status: 'CONFIRMED' as const,
  decidedBy: 'reviewer:test',
  decidedAt: new Date(),
  confirmedTransactionId: transactionId,
  confirmedDocumentId: documentId,
});

async function violation(write: () => Promise<unknown>): Promise<{ unique: string[] | null; check: string | null }> {
  try {
    await write();
  } catch (error) {
    return { unique: uniqueViolationFields(error), check: checkViolationName(error) };
  }
  throw new Error('Expected the database to reject the write');
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('database-enforced rules', () => {
  it('one document per provider message: a redelivered externalId is rejected', async () => {
    await createDocument({ externalId: 'wamid.1' });
    expect(await violation(() => createDocument({ externalId: 'wamid.1' }))).toEqual({
      unique: ['externalId'],
      check: null,
    });
  });

  it('one document per file: a resent content hash is rejected, while hash-less FAILED documents may repeat', async () => {
    await createDocument({ contentHash: 'abc' });
    expect((await violation(() => createDocument({ contentHash: 'abc' }))).unique).toEqual(['contentHash']);
    const failed = { contentHash: null, status: 'FAILED' as const, failureReason: 'MEDIA_UNAVAILABLE' };
    await createDocument(failed);
    await createDocument(failed);
    expect(await db.document.count({ where: { contentHash: null } })).toBe(2);
  });

  it('a document without a hash must be FAILED, and a FAILED document must say why', async () => {
    expect((await violation(() => createDocument({ contentHash: null }))).check).toBe('Document_hash_or_failed');
    expect((await violation(() => createDocument({ status: 'FAILED' }))).check).toBe('Document_failed_has_reason');
  });

  it('at most one confirmed document per transaction, while unconfirmed candidates may repeat', async () => {
    const { transaction } = await createTransactionGraph();
    const [first, second, third] = [await createDocument(), await createDocument(), await createDocument()];
    await db.documentMatch.create({
      data: { documentId: third.id, transactionId: transaction.id, rank: 1, confidence: 0.9, signals: {}, flags: [] },
    });
    await db.documentMatch.create({ data: confirmed(first.id, transaction.id) });
    expect(
      (await violation(() => db.documentMatch.create({ data: confirmed(second.id, transaction.id) }))).unique,
    ).toEqual(['confirmedTransactionId']);
  });

  it('at most one confirmed transaction per document', async () => {
    const { client, card, transaction } = await createTransactionGraph();
    const other = await db.transaction.create({
      data: {
        clientId: client.id,
        cardId: card.id,
        merchantName: 'X',
        mcc: '5541',
        amount: 100,
        transactionAt: new Date(),
      },
    });
    const document = await createDocument();
    await db.documentMatch.create({ data: confirmed(document.id, transaction.id) });
    expect((await violation(() => db.documentMatch.create({ data: confirmed(document.id, other.id) }))).unique).toEqual(
      ['confirmedDocumentId'],
    );
  });

  it('a match’s confirmed ids, decision audit and confidence stay consistent (CHECK constraints)', async () => {
    const { transaction } = await createTransactionGraph();
    const document = await createDocument();
    const cases = [
      [{ confirmedTransactionId: null, confirmedDocumentId: null }, 'DocumentMatch_confirmed_txn_iff_confirmed'],
      [{ status: 'CANDIDATE' as const, decidedBy: null, decidedAt: null }, 'DocumentMatch_confirmed_txn_iff_confirmed'],
      [{ confirmedTransactionId: transaction.id + 99 }, 'DocumentMatch_confirmed_txn_is_own'],
      [
        { status: 'REJECTED' as const, confirmedTransactionId: null, confirmedDocumentId: null, decidedBy: null },
        'DocumentMatch_decided_when_not_candidate',
      ],
      [{ confidence: 1.2 }, 'DocumentMatch_confidence_range'],
    ] as const;
    for (const [overrides, constraint] of cases) {
      const write = () =>
        db.documentMatch.create({ data: { ...confirmed(document.id, transaction.id), ...overrides } });
      expect((await violation(write)).check).toBe(constraint);
    }
  });

  it('transaction amounts are positive', async () => {
    const { client, card } = await createTransactionGraph();
    const write = () =>
      db.transaction.create({
        data: {
          clientId: client.id,
          cardId: card.id,
          merchantName: 'X',
          mcc: '1',
          amount: 0,
          transactionAt: new Date(),
        },
      });
    expect((await violation(write)).check).toBe('Transaction_amount_positive');
  });
});
