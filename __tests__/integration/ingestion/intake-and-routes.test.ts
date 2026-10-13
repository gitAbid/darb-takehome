/** Intake's media timeout and the real route modules wired through the composition root. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RecordingLogger } from '@/lib/logging/recording-logger';
import type { MediaStore } from '@/lib/media/media-store';
import { createPrismaRepositories } from '@/lib/repositories/prisma/prisma-unit-of-work';
import { IntakeService } from '@/lib/services/ingestion/intake-service';
import { SenderResolver } from '@/lib/services/ingestion/sender-resolver';
import { LocalFileBlobStore } from '@/lib/storage/local-file-blob-store';
import { seedDatabase } from '@/prisma/seed-data/seed-database';

import { db } from '../../helpers/test-database';

jest.mock('next/server', () => ({ after: jest.fn() }));

beforeEach(() => seedDatabase(db));
afterAll(() => db.$disconnect());

describe('IntakeService', () => {
  it('stores a document whose media does not arrive in time as FAILED (MEDIA_UNAVAILABLE)', async () => {
    const hangingMedia: MediaStore = { fetch: () => new Promise(() => undefined) };
    const repositories = createPrismaRepositories(db);
    const intake = new IntakeService({
      documents: repositories.documents,
      mediaStore: hangingMedia,
      blobStore: new LocalFileBlobStore(mkdtempSync(join(tmpdir(), 'blobs-'))),
      senders: new SenderResolver(repositories.senders),
      logger: new RecordingLogger(),
      mediaTimeoutMs: 20,
    });
    const result = await intake.intake({
      source: 'WHATSAPP',
      externalId: 'wamid.slow',
      sender: '+966551234567',
      recipient: null,
      content: { kind: 'media', mediaId: 'media_slow', mimeType: 'image/jpeg' },
    });
    expect(result.kind).toBe('created');
    expect(await db.document.findUniqueOrThrow({ where: { externalId: 'wamid.slow' } })).toMatchObject({
      status: 'FAILED',
      failureReason: 'MEDIA_UNAVAILABLE',
      contentHash: null,
      clientId: 1,
    });
  });
});

describe('route modules', () => {
  beforeAll(() => {
    process.env.LOG_SINK = 'test';
    process.env.BLOB_DIR = mkdtempSync(join(tmpdir(), 'blobs-'));
  });

  it('serve the webhooks and the card feed through the process-wide container and schedule work with after()', async () => {
    const { POST: email } = await import('@/app/api/webhooks/email/route');
    const { POST: whatsapp } = await import('@/app/api/webhooks/whatsapp/route');
    const { POST: transactions } = await import('@/app/api/transactions/route');
    const { after } = await import('next/server');
    const bad = await email(new Request('http://test', { method: 'POST', body: '{}' }));
    expect(bad.status).toBe(400);
    expect((await transactions(new Request('http://test', { method: 'POST', body: '{}' }))).status).toBe(400);
    const payload = await import('@/fixtures/scenarios/01-exact-match/payload.json');
    const ok = await whatsapp(new Request('http://test', { method: 'POST', body: JSON.stringify(payload.default) }));
    expect(ok.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
