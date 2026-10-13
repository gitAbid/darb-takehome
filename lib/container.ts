import type { PrismaClient } from '@prisma/client';

import { loadAppConfig, type AppConfig } from './config/app-config';
import { SystemClock, type Clock } from './domain/clock';
import { FixtureRegistry } from './extraction/fixture-registry';
import { MockExtractor } from './extraction/mock-extractor';
import type { DocumentExtractor } from './extraction/types';
import { createLogger } from './logging/create-logger';
import type { Logger } from './logging/logger';
import { FixtureMediaStore } from './media/fixture-media-store';
import type { MediaStore } from './media/media-store';
import prisma from './prisma';
import { PrismaReviewQueueReader } from './repositories/prisma/prisma-review-queue-reader';
import { createPrismaRepositories, PrismaUnitOfWork } from './repositories/prisma/prisma-unit-of-work';
import type { ReviewQueueReader } from './repositories/review-queue-reader';
import { DocumentIngestion } from './services/document-ingestion';
import type { BackgroundScheduler } from './services/ingestion/background-scheduler';
import { DocumentProcessor } from './services/ingestion/document-processor';
import { IntakeService } from './services/ingestion/intake-service';
import { MatchStage } from './services/ingestion/match-stage';
import { SenderResolver } from './services/ingestion/sender-resolver';
import { DocumentFileService } from './services/review/document-file-service';
import { ReviewService } from './services/review/review-service';
import { defaultMatchingConfig } from './services/matching/matching-config';
import { matchDocument } from './services/transaction-matcher';
import type { BlobStore } from './storage/blob-store';
import { LocalFileBlobStore } from './storage/local-file-blob-store';
import { RematchService } from './services/transactions/rematch-service';
import { TransactionIngestionService } from './services/transactions/transaction-ingestion';
import { NextAfterScheduler } from './webhooks/http/next-after-scheduler';
import { createTransactionHandler } from './webhooks/http/transaction-handler';
import { createWebhookHandler, type WebhookHandler } from './webhooks/http/webhook-handler';
import { createWebhookVerifiers } from './webhooks/security/create-verifiers';
import { createWhatsAppVerificationHandler } from './webhooks/whatsapp/verification-handshake';

export interface Container {
  ingestion: DocumentIngestion;
  processor: DocumentProcessor;
  review: ReviewService;
  reviewQueue: ReviewQueueReader;
  documentFiles: DocumentFileService;
  webhooks: { email: WebhookHandler; whatsapp: WebhookHandler; whatsappVerification: WebhookHandler };
  transactions: WebhookHandler;
  logger: Logger;
}

/** Replaceable infrastructure. Anything not overridden gets the default implementation. */
export interface ContainerOverrides {
  db?: PrismaClient;
  logger?: Logger;
  extractor?: DocumentExtractor;
  mediaStore?: MediaStore;
  blobStore?: BlobStore;
  scheduler?: BackgroundScheduler;
  clock?: Clock;
}

/** Kept on globalThis so dev hot reloads reuse it instead of re-spawning logger workers and re-hashing fixtures. */
const globalForContainer = globalThis as unknown as { darbContainer?: Container };

/** The composition root: the one place that decides which implementation backs each interface. */
export function createContainer(config: AppConfig = loadAppConfig(), overrides: ContainerOverrides = {}): Container {
  const db = overrides.db ?? prisma;
  const logger = overrides.logger ?? createLogger(config.logging);
  const repositories = createPrismaRepositories(db);
  const unitOfWork = new PrismaUnitOfWork(db);
  const clock = overrides.clock ?? new SystemClock();
  const senders = new SenderResolver(repositories.senders);
  const blobStore = overrides.blobStore ?? new LocalFileBlobStore(config.blobDir);
  const intake = new IntakeService({
    documents: repositories.documents,
    mediaStore: overrides.mediaStore ?? FixtureMediaStore.load(config.fixturesDir),
    blobStore,
    senders,
    logger,
    mediaTimeoutMs: config.mediaFetchTimeoutMs,
  });
  const matchStage = new MatchStage({
    repositories,
    unitOfWork,
    matchDocument,
    dateRules: defaultMatchingConfig.date,
    clock,
  });
  const processor = new DocumentProcessor({
    repositories,
    blobStore,
    extractor: overrides.extractor ?? new MockExtractor(FixtureRegistry.load(config.fixturesDir)),
    senders,
    matchStage,
    logger,
  });
  const scheduler = overrides.scheduler ?? new NextAfterScheduler();
  const ingestion = new DocumentIngestion({ intake, processor, scheduler, logger });
  const transactionIngestion = new TransactionIngestionService({
    transactions: repositories.transactions,
    rematch: new RematchService({ repositories, matchStage, senders, dateRules: defaultMatchingConfig.date, logger }),
    scheduler,
    logger,
  });
  const verifiers = createWebhookVerifiers(config.webhookSecurity, logger);
  return {
    ingestion,
    processor,
    review: new ReviewService({ unitOfWork, clock, logger }),
    reviewQueue: new PrismaReviewQueueReader(db),
    documentFiles: new DocumentFileService(repositories.documents, blobStore),
    logger,
    webhooks: {
      email: createWebhookHandler((payload) => ingestion.receiveEmail(payload), verifiers.email, logger),
      whatsapp: createWebhookHandler((payload) => ingestion.receiveWhatsApp(payload), verifiers.whatsapp, logger),
      whatsappVerification: createWhatsAppVerificationHandler(config.webhookSecurity.whatsappVerifyToken, logger),
    },
    transactions: createTransactionHandler(
      (payload) => transactionIngestion.receive(payload),
      verifiers.transactions,
      logger,
    ),
  };
}

/** Process-wide container, built on first use. */
export function getContainer(): Container {
  globalForContainer.darbContainer ??= createContainer();
  return globalForContainer.darbContainer;
}
