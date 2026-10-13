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
import { createPrismaRepositories, PrismaUnitOfWork } from './repositories/prisma/prisma-unit-of-work';
import { DocumentIngestion } from './services/document-ingestion';
import type { BackgroundScheduler } from './services/ingestion/background-scheduler';
import { DocumentProcessor } from './services/ingestion/document-processor';
import { IntakeService } from './services/ingestion/intake-service';
import { SenderResolver } from './services/ingestion/sender-resolver';
import { ReviewService } from './services/review/review-service';
import { defaultMatchingConfig } from './services/matching/matching-config';
import { matchDocument } from './services/transaction-matcher';
import type { BlobStore } from './storage/blob-store';
import { LocalFileBlobStore } from './storage/local-file-blob-store';
import { NextAfterScheduler } from './webhooks/http/next-after-scheduler';
import { createWebhookHandler, type WebhookHandler } from './webhooks/http/webhook-handler';

export interface Container {
  ingestion: DocumentIngestion;
  processor: DocumentProcessor;
  review: ReviewService;
  webhooks: { email: WebhookHandler; whatsapp: WebhookHandler };
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

let instance: Container | undefined;

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
  const processor = new DocumentProcessor({
    repositories,
    unitOfWork,
    blobStore,
    extractor: overrides.extractor ?? new MockExtractor(FixtureRegistry.load(config.fixturesDir)),
    senders,
    matchDocument,
    dateRules: defaultMatchingConfig.date,
    clock,
    logger,
  });
  const ingestion = new DocumentIngestion({
    intake,
    processor,
    scheduler: overrides.scheduler ?? new NextAfterScheduler(),
    logger,
  });
  return {
    ingestion,
    processor,
    review: new ReviewService({ unitOfWork, clock, logger }),
    logger,
    webhooks: {
      email: createWebhookHandler((payload) => ingestion.receiveEmail(payload), logger),
      whatsapp: createWebhookHandler((payload) => ingestion.receiveWhatsApp(payload), logger),
    },
  };
}

/** Process-wide container, built on first use. */
export function getContainer(): Container {
  instance ??= createContainer();
  return instance;
}
