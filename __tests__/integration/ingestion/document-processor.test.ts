/** Processor failure modes and races, against the real database (happy paths are covered end-to-end). */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentHash } from '@/lib/domain/content-hash';
import { FixedClock } from '@/lib/domain/clock';
import { ExtractionFailedError } from '@/lib/extraction/extraction-errors';
import type { DocumentExtractor, ExtractedDocument } from '@/lib/extraction/types';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { createPrismaRepositories, PrismaUnitOfWork } from '@/lib/repositories/prisma/prisma-unit-of-work';
import { DocumentProcessor } from '@/lib/services/ingestion/document-processor';
import { MatchStage } from '@/lib/services/ingestion/match-stage';
import { SenderResolver } from '@/lib/services/ingestion/sender-resolver';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { matchDocument } from '@/lib/services/transaction-matcher';
import { LocalFileBlobStore } from '@/lib/storage/local-file-blob-store';
import { seedDatabase } from '@/prisma/seed-data/seed-database';

import { db } from '../../helpers/test-database';

const BYTES = Buffer.from('a receipt for T01');
const T01_RECEIPT: ExtractedDocument = {
  documentType: 'RECEIPT',
  merchantName: 'Alfanar Fuel Station 04',
  vatNumber: null,
  totalAmount: 15000,
  currency: 'SAR',
  documentDate: '2025-06-10',
  cardLast4: '4471',
  invoiceNumber: null,
  rawText: 'ALFANAR',
  extractionConfidence: 0.95,
};

async function setup(
  extract: DocumentExtractor['extract'],
  tweak: (repos: ReturnType<typeof createPrismaRepositories>) => void = () => {},
) {
  const blobStore = new LocalFileBlobStore(mkdtempSync(join(tmpdir(), 'blobs-')));
  await blobStore.put(contentHash(BYTES), BYTES);
  const repositories = createPrismaRepositories(db);
  tweak(repositories);
  const logger = new RecordingLogger();
  const processor = new DocumentProcessor({
    repositories,
    blobStore,
    extractor: { extract },
    senders: new SenderResolver(repositories.senders),
    matchStage: new MatchStage({
      repositories,
      unitOfWork: new PrismaUnitOfWork(db),
      matchDocument,
      dateRules: defaultMatchingConfig.date,
      clock: new FixedClock(new Date('2025-06-20T09:00:00Z')),
    }),
    logger,
  });
  const document = await db.document.create({
    data: {
      source: 'WHATSAPP',
      externalId: `wamid.test-${Math.random()}`,
      contentHash: contentHash(BYTES),
      storageKey: contentHash(BYTES),
      senderIdentifier: '+966551234567',
      mimeType: 'image/jpeg',
    },
  });
  return { processor, logger, documentId: document.id };
}

async function claimT01ForAnotherDocument(): Promise<void> {
  const rival = await db.document.create({
    data: {
      source: 'EMAIL',
      externalId: 'rival',
      contentHash: 'rival',
      senderIdentifier: 'x',
      mimeType: 'application/pdf',
      status: 'MATCHED',
    },
  });
  await db.documentMatch.create({
    data: {
      documentId: rival.id,
      transactionId: 1,
      rank: 1,
      confidence: 1,
      signals: {},
      flags: [],
      status: 'AUTO_CONFIRMED',
      decidedBy: 'system',
      decidedAt: new Date(),
      confirmedTransactionId: 1,
      confirmedDocumentId: rival.id,
    },
  });
}

const stateOf = (id: number) => db.document.findUniqueOrThrow({ where: { id }, include: { matches: true } });

beforeEach(() => seedDatabase(db));
afterAll(() => db.$disconnect());

describe('DocumentProcessor failure modes', () => {
  it.each([
    ['the extractor fails', () => Promise.reject(new ExtractionFailedError('provider 503')), 'EXTRACTION_ERROR'],
    [
      'the extractor returns an invalid shape',
      () => Promise.resolve({ ...T01_RECEIPT, extractionConfidence: 7 }),
      'EXTRACTION_INVALID',
    ],
  ])('marks the document FAILED when %s, and logs it', async (_label, extract, failureReason) => {
    const { processor, logger, documentId } = await setup(extract as DocumentExtractor['extract']);
    await processor.process(documentId);
    expect(await stateOf(documentId)).toMatchObject({ status: 'FAILED', failureReason });
    expect(logger.find('document.failed')).toEqual([
      expect.objectContaining({ context: expect.objectContaining({ documentId, failureReason }) }),
    ]);
  });

  it('marks an already-extracted document FAILED when a later step breaks (PROCESSING_ERROR)', async () => {
    const { processor, documentId } = await setup(
      () => Promise.resolve(T01_RECEIPT),
      (repos) => {
        repos.transactions.findCandidates = () => Promise.reject(new Error('db timeout'));
      },
    );
    await processor.process(documentId);
    expect(await stateOf(documentId)).toMatchObject({
      status: 'FAILED',
      failureReason: 'PROCESSING_ERROR',
      merchantName: 'Alfanar Fuel Station 04',
    });
  });

  it('demotes an auto-match to review when another document claims the transaction between read and write', async () => {
    const { processor, documentId } = await setup(
      () => Promise.resolve(T01_RECEIPT),
      (repos) => {
        const findCandidates = repos.transactions.findCandidates.bind(repos.transactions);
        repos.transactions.findCandidates = async (query) => {
          const candidates = await findCandidates(query);
          await claimT01ForAnotherDocument(); // the race: T01 is confirmed elsewhere right after it was read as free
          return candidates;
        };
      },
    );
    await processor.process(documentId);
    const state = await stateOf(documentId);
    expect(state).toMatchObject({ status: 'NEEDS_REVIEW', decisionReasons: ['TXN_ALREADY_HAS_DOCUMENT'] });
    expect(state.matches.map((match) => match.status)).toEqual(['CANDIDATE', 'CANDIDATE']);
  });

  it('ignores documents that are not RECEIVED (already processed or unknown)', async () => {
    const extract = jest.fn();
    const { processor, documentId } = await setup(extract);
    await db.document.update({ where: { id: documentId }, data: { status: 'FAILED', failureReason: 'X' } });
    await processor.process(documentId);
    await processor.process(999_999);
    expect(extract).not.toHaveBeenCalled();
  });
});
