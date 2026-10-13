/** The review UI's read side against the real database, fed by real webhooks. */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaReviewQueueReader } from '@/lib/repositories/prisma/prisma-review-queue-reader';

import { createTestApp, FIXTURES_DIR, readFixtureJson, resetAndSeed } from '../helpers/e2e-app';
import { db } from '../helpers/test-database';

// The file route uses the process-wide container: share one blob directory with the test app.
process.env.BLOB_DIR = mkdtempSync(join(tmpdir(), 'blobs-'));
process.env.LOG_SINK = 'test';

const reader = new PrismaReviewQueueReader(db);

beforeEach(resetAndSeed);
afterAll(() => db.$disconnect());

describe('review read model', () => {
  it('lists NEEDS_REVIEW documents oldest first with pending counts, details and status totals', async () => {
    const app = createTestApp();
    await app.post('whatsapp', readFixtureJson('scenarios', '03-restaurant-tip', 'payload.json'));
    await app.post('email', readFixtureJson('scenarios', '02-ambiguous-same-chain', 'payload.json'));
    await app.post('whatsapp', readFixtureJson('scenarios', '01-exact-match', 'payload.json'));

    const queue = await reader.listQueue(10);
    expect(queue.map((item) => [item.merchantName, item.pendingCandidates, item.reasons])).toEqual([
      ['Al Mashwar Grill', 1, ['AMOUNT_TIP_TOLERANCE']],
      ['Alfanar Fuel Company', 2, ['NEAR_TIE']],
    ]);
    expect(await reader.countByStatus()).toMatchObject({ NEEDS_REVIEW: 2, MATCHED: 2, RECEIVED: 0, FAILED: 0 });

    const detail = await reader.findDocument(queue[1].documentId);
    expect(detail?.candidates.map((candidate) => [candidate.transaction.cardLabel, candidate.status])).toEqual([
      ['Najd van 03', 'CANDIDATE'],
      ['Najd truck 18', 'CANDIDATE'],
    ]);
    expect(await reader.findDocument(999_999)).toBeNull();

    await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'bare',
        contentHash: 'bare',
        senderIdentifier: 'x',
        mimeType: 'application/pdf',
        status: 'NEEDS_REVIEW',
      },
    });
    expect((await reader.listQueue(10)).at(-1)).toMatchObject({
      merchantName: null,
      totalAmount: null,
      pendingCandidates: 0,
    });
  });

  it('serves the original file for a document, and 404 for unknown or invalid ids', async () => {
    await createTestApp().post('whatsapp', readFixtureJson('scenarios', '03-restaurant-tip', 'payload.json'));
    const { id } = await db.document.findUniqueOrThrow({ where: { externalId: 'wamid.S03-0001' } });
    const { GET } = await import('@/app/api/documents/[id]/file/route');
    const file = (documentId: string) =>
      GET(new Request('http://test'), { params: Promise.resolve({ id: documentId }) });

    const response = await file(String(id));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      readFileSync(join(FIXTURES_DIR, 'scenarios', '03-restaurant-tip', 'document.jpg')),
    );
    const lostBlob = await db.document.create({
      data: {
        source: 'EMAIL',
        externalId: 'lost',
        contentHash: 'lost',
        storageKey: 'lost',
        senderIdentifier: 'x',
        mimeType: 'application/pdf',
      },
    });
    expect((await Promise.all(['999999', 'abc', '-1', String(lostBlob.id)].map(file))).map((r) => r.status)).toEqual([
      404, 404, 404, 404,
    ]);
  });
});
