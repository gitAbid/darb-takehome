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
  it('rejects a second document with the same externalId (redelivery)', async () => {
    await createDocument({ externalId: 'wamid.1' });
    expect(await violation(() => createDocument({ externalId: 'wamid.1' }))).toEqual({
      unique: ['externalId'],
      check: null,
    });
  });

  it('rejects a second document with the same content hash (resend)', async () => {
    await createDocument({ contentHash: 'abc' });
    expect((await violation(() => createDocument({ contentHash: 'abc' }))).unique).toEqual(['contentHash']);
  });

  it('allows many FAILED documents without a content hash', async () => {
    const failed = { contentHash: null, status: 'FAILED' as const, failureReason: 'MEDIA_UNAVAILABLE' };
    await createDocument(failed);
    await createDocument(failed);
    expect(await db.document.count({ where: { contentHash: null } })).toBe(2);
  });

  it('rejects a missing content hash unless the document FAILED', async () => {
    expect((await violation(() => createDocument({ contentHash: null }))).check).toBe('Document_hash_or_failed');
  });

  it('rejects a FAILED document without a failure reason', async () => {
    expect((await violation(() => createDocument({ status: 'FAILED' }))).check).toBe('Document_failed_has_reason');
  });

  it('rejects a second confirmed document on the same transaction', async () => {
    const { transaction } = await createTransactionGraph();
    const first = await createDocument();
    const second = await createDocument();
    await db.documentMatch.create({ data: confirmed(first.id, transaction.id) });
    expect(
      (await violation(() => db.documentMatch.create({ data: confirmed(second.id, transaction.id) }))).unique,
    ).toEqual(['confirmedTransactionId']);
  });

  it('rejects a second confirmed transaction for the same document', async () => {
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

  it('allows many unconfirmed candidates on the same transaction', async () => {
    const { transaction } = await createTransactionGraph();
    for (const document of [await createDocument(), await createDocument()]) {
      await db.documentMatch.create({
        data: {
          documentId: document.id,
          transactionId: transaction.id,
          rank: 1,
          confidence: 0.9,
          signals: {},
          flags: [],
        },
      });
    }
    expect(await db.documentMatch.count()).toBe(2);
  });

  it.each([
    [
      'confirmed without the confirmed ids',
      { confirmedTransactionId: null, confirmedDocumentId: null },
      'DocumentMatch_confirmed_txn_iff_confirmed',
    ],
    [
      'a candidate that claims the confirmed slot',
      { status: 'CANDIDATE' as const, decidedBy: null, decidedAt: null },
      'DocumentMatch_confirmed_txn_iff_confirmed',
    ],
    [
      'decided without who/when',
      { status: 'REJECTED' as const, confirmedTransactionId: null, confirmedDocumentId: null, decidedBy: null },
      'DocumentMatch_decided_when_not_candidate',
    ],
    ['confidence above 1', { confidence: 1.2 }, 'DocumentMatch_confidence_range'],
  ])('rejects %s', async (_label, overrides, constraint) => {
    const { transaction } = await createTransactionGraph();
    const document = await createDocument();
    const write = () => db.documentMatch.create({ data: { ...confirmed(document.id, transaction.id), ...overrides } });
    expect((await violation(write)).check).toBe(constraint);
  });

  it('rejects confirmed ids that point at another row', async () => {
    const { transaction } = await createTransactionGraph();
    const document = await createDocument();
    const write = () =>
      db.documentMatch.create({
        data: { ...confirmed(document.id, transaction.id), confirmedTransactionId: transaction.id + 99 },
      });
    expect((await violation(write)).check).toBe('DocumentMatch_confirmed_txn_is_own');
  });

  it('rejects a non-positive transaction amount', async () => {
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
