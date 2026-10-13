import type { NewDocument } from '@/lib/repositories/records';
import { PrismaDocumentRepository } from '@/lib/repositories/prisma/prisma-document-repository';

import { createDocument, db, resetDatabase } from '../../helpers/test-database';

const repository = new PrismaDocumentRepository(db);

function newDocument(overrides: Partial<NewDocument> = {}): NewDocument {
  return {
    source: 'EMAIL',
    externalId: 'msg_8f2a1:0',
    contentHash: 'sha256-a',
    senderIdentifier: 'fleet@najd-logistics.example',
    recipientIdentifier: 'receipts+najd@darb.example.com',
    clientId: null,
    status: 'RECEIVED',
    failureReason: null,
    storageKey: 'scenarios/02/document.pdf',
    mimeType: 'application/pdf',
    ...overrides,
  };
}

const EXTRACTION = {
  documentType: 'TAX_INVOICE' as const,
  merchantName: 'Alfanar Fuel Company',
  vatNumber: '300123456700003',
  totalAmount: 20000,
  currency: 'SAR',
  documentDate: new Date('2025-06-14T00:00:00.000Z'),
  cardLast4: null,
  invoiceNumber: 'INV-99830',
  rawText: 'TAX INVOICE INV-99830',
  extractionConfidence: 0.92,
};

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaDocumentRepository', () => {
  it('reports a message-id duplicate even when the first delivery had no file (media failed)', async () => {
    await repository.insert(
      newDocument({ contentHash: null, status: 'FAILED', failureReason: 'MEDIA_UNAVAILABLE', storageKey: null }),
    );
    expect(await repository.insert(newDocument({ contentHash: 'sha256-b' }))).toEqual({
      kind: 'duplicate',
      field: 'externalId',
    });
  });

  it('reads back the extraction, decision reasons and failure reason written with a status change', async () => {
    const inserted = await repository.insert(newDocument());
    const id = inserted.kind === 'created' ? inserted.id : -1;
    await repository.changeStatus({ id, from: 'RECEIVED', to: 'EXTRACTED', extraction: EXTRACTION });
    await repository.changeStatus({ id, from: 'EXTRACTED', to: 'NEEDS_REVIEW', decisionReasons: ['NEAR_TIE'] });
    expect(await repository.findById(id)).toMatchObject({
      status: 'NEEDS_REVIEW',
      decisionReasons: ['NEAR_TIE'],
      extraction: EXTRACTION,
    });
    expect(await repository.findById(id + 1000)).toBeNull();
  });

  it('stores a FAILED document without a hash, and rethrows database rule violations that are not duplicates', async () => {
    const failed = newDocument({
      externalId: 'm:1',
      contentHash: null,
      status: 'FAILED',
      failureReason: 'MEDIA_UNAVAILABLE',
    });
    expect((await repository.insert(failed)).kind).toBe('created');
    await expect(repository.insert(newDocument({ contentHash: null, status: 'FAILED' }))).rejects.toThrow(
      /CHECK constraint failed: Document_failed_has_reason/,
    );
    const { id } = await createDocument();
    await expect(repository.changeStatus({ id, from: 'RECEIVED', to: 'FAILED' })).rejects.toThrow(/CHECK constraint/);
  });

  it('refuses to map corrupt stored decision reasons instead of casting them', async () => {
    for (const decisionReasons of [['NOT_A_REASON'], { reason: 'NEAR_TIE' }]) {
      const { id } = await createDocument({ decisionReasons });
      await expect(repository.findById(id)).rejects.toThrow(`Corrupt stored JSON in Document ${id}.decisionReasons`);
    }
  });

  it('changes status only from the expected status (guarded write), otherwise reports stale and writes nothing', async () => {
    const { id } = await createDocument();
    expect(await repository.changeStatus({ id, from: 'RECEIVED', to: 'EXTRACTED' })).toBe(true);
    expect(
      await repository.changeStatus({ id, from: 'RECEIVED', to: 'FAILED', failureReason: 'EXTRACTION_ERROR' }),
    ).toBe(false);
    expect(await repository.findById(id)).toMatchObject({ status: 'EXTRACTED', failureReason: null });
    expect(await repository.changeStatus({ id: 404, from: 'RECEIVED', to: 'EXTRACTED' })).toBe(false);
  });
});
