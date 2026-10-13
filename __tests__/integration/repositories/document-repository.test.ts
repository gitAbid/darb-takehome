import type { NewDocument } from '@/lib/repositories/records';
import { toDocumentDate } from '@/lib/repositories/prisma/document-mapper';
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

describe('PrismaDocumentRepository.insert', () => {
  it('creates a document and returns its id', async () => {
    const result = await repository.insert(newDocument());
    expect(result).toEqual({ kind: 'created', id: expect.any(Number) });
    expect(await db.document.count()).toBe(1);
  });

  it('reports a redelivery as a duplicate by externalId', async () => {
    await repository.insert(newDocument());
    expect(await repository.insert(newDocument({ contentHash: 'sha256-b' }))).toEqual({
      kind: 'duplicate',
      field: 'externalId',
    });
    expect(await db.document.count()).toBe(1);
  });

  it('reports the same file under a new message as a duplicate by contentHash', async () => {
    await repository.insert(newDocument());
    expect(await repository.insert(newDocument({ externalId: 'msg_other:0' }))).toEqual({
      kind: 'duplicate',
      field: 'contentHash',
    });
  });

  it('stores a FAILED document without a content hash', async () => {
    const result = await repository.insert(
      newDocument({ contentHash: null, status: 'FAILED', failureReason: 'MEDIA_UNAVAILABLE' }),
    );
    expect(result.kind).toBe('created');
  });

  it('rethrows errors that are not duplicates (CHECK: FAILED without a reason)', async () => {
    await expect(repository.insert(newDocument({ contentHash: null, status: 'FAILED' }))).rejects.toThrow(
      /CHECK constraint failed: Document_failed_has_reason/,
    );
  });
});

describe('PrismaDocumentRepository.findById', () => {
  it('returns null for an unknown id', async () => {
    expect(await repository.findById(999)).toBeNull();
  });

  it('maps a fresh document with no extraction and no reasons', async () => {
    const { id } = await createDocument({ recipientIdentifier: null });
    expect(await repository.findById(id)).toEqual({
      id,
      source: 'WHATSAPP',
      externalId: expect.any(String),
      contentHash: expect.any(String),
      senderIdentifier: '+966551234567',
      recipientIdentifier: null,
      clientId: null,
      status: 'RECEIVED',
      failureReason: null,
      storageKey: null,
      mimeType: 'image/jpeg',
      decisionReasons: [],
      extraction: null,
      receivedAt: expect.any(Date),
    });
  });

  it('maps the extraction and decision reasons once stored', async () => {
    const { id } = await createDocument({
      ...EXTRACTION,
      status: 'NEEDS_REVIEW',
      decisionReasons: ['NEAR_TIE'],
    });
    const stored = await repository.findById(id);
    expect(stored?.extraction).toEqual(EXTRACTION);
    expect(stored?.decisionReasons).toEqual(['NEAR_TIE']);
  });

  it('defaults missing raw text and confidence on a stored extraction', async () => {
    const { id } = await createDocument({ documentType: 'UNKNOWN' });
    expect((await repository.findById(id))?.extraction).toMatchObject({ rawText: '', extractionConfidence: 0 });
  });

  it.each([
    ['an unknown reason code', ['NOT_A_REASON']],
    ['a non-array value', { reason: 'NEAR_TIE' }],
  ])('throws on corrupt decisionReasons JSON (%s)', async (_label, decisionReasons) => {
    const { id } = await createDocument({ decisionReasons });
    await expect(repository.findById(id)).rejects.toThrow(`Corrupt stored JSON in Document ${id}.decisionReasons`);
  });
});

describe('PrismaDocumentRepository.changeStatus', () => {
  it('moves the document when it is still in the expected status', async () => {
    const { id } = await createDocument();
    expect(await repository.changeStatus({ id, from: 'RECEIVED', to: 'EXTRACTED' })).toBe(true);
    expect((await repository.findById(id))?.status).toBe('EXTRACTED');
  });

  it('returns false and writes nothing when the status moved on (stale)', async () => {
    const { id } = await createDocument({ status: 'EXTRACTED' });
    const changed = await repository.changeStatus({
      id,
      from: 'RECEIVED',
      to: 'FAILED',
      failureReason: 'EXTRACTION_ERROR',
    });
    expect(changed).toBe(false);
    expect(await repository.findById(id)).toMatchObject({ status: 'EXTRACTED', failureReason: null });
  });

  it('returns false for an unknown document', async () => {
    expect(await repository.changeStatus({ id: 404, from: 'RECEIVED', to: 'EXTRACTED' })).toBe(false);
  });

  it('persists the extraction with the status change', async () => {
    const { id } = await createDocument();
    await repository.changeStatus({ id, from: 'RECEIVED', to: 'EXTRACTED', extraction: EXTRACTION });
    expect((await repository.findById(id))?.extraction).toEqual(EXTRACTION);
  });

  it('persists a date-time document date exactly', async () => {
    const { id } = await createDocument();
    const documentDate = toDocumentDate('2025-06-14T20:38:00+03:00');
    await repository.changeStatus({
      id,
      from: 'RECEIVED',
      to: 'EXTRACTED',
      extraction: { ...EXTRACTION, documentDate },
    });
    expect((await repository.findById(id))?.extraction?.documentDate?.toISOString()).toBe('2025-06-14T17:38:00.000Z');
  });

  it('persists decision reasons and a failure reason', async () => {
    const { id } = await createDocument({ status: 'EXTRACTED' });
    await repository.changeStatus({
      id,
      from: 'EXTRACTED',
      to: 'NEEDS_REVIEW',
      decisionReasons: ['NEAR_TIE', 'WEAK_IDENTITY'],
    });
    expect((await repository.findById(id))?.decisionReasons).toEqual(['NEAR_TIE', 'WEAK_IDENTITY']);
    const failed = await createDocument();
    await repository.changeStatus({ id: failed.id, from: 'RECEIVED', to: 'FAILED', failureReason: 'EXTRACTION_ERROR' });
    expect((await repository.findById(failed.id))?.failureReason).toBe('EXTRACTION_ERROR');
  });

  it('lets the database reject an invalid change (FAILED without a reason)', async () => {
    const { id } = await createDocument();
    await expect(repository.changeStatus({ id, from: 'RECEIVED', to: 'FAILED' })).rejects.toThrow(
      /CHECK constraint failed/,
    );
  });
});

describe('toDocumentDate', () => {
  it.each([
    ['2025-06-14', '2025-06-14T00:00:00.000Z'],
    [' 2025-06-14 ', '2025-06-14T00:00:00.000Z'],
    ['2025-06-14T09:21:00Z', '2025-06-14T09:21:00.000Z'],
  ])('%p → %p', (input, expected) => {
    expect(toDocumentDate(input)?.toISOString()).toBe(expected);
  });

  it.each([null, 'garbage', '2025-13-40'])('returns null for %p', (input) => {
    expect(toDocumentDate(input)).toBeNull();
  });
});
