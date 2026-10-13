import type { PrismaClient } from '@prisma/client';

import type { AppConfig } from '@/lib/config/app-config';
import { summarizeConfig } from '@/lib/config/config-summary';
import { SystemClock, type Clock } from '@/lib/domain/clock';
import type { DocumentExtractor } from '@/lib/extraction/types';
import { createLogger } from '@/lib/logging/create-logger';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { MediaStore } from '@/lib/media/media-store';
import prisma from '@/lib/prisma';
import { createPrismaRepositories, PrismaUnitOfWork } from '@/lib/repositories/prisma/prisma-unit-of-work';
import type { Repositories, UnitOfWork } from '@/lib/repositories/unit-of-work';
import type { BackgroundScheduler } from '@/lib/services/ingestion/background-scheduler';
import { SenderResolver } from '@/lib/services/ingestion/sender-resolver';
import type { BlobStore } from '@/lib/storage/blob-store';
import { LocalFileBlobStore } from '@/lib/storage/local-file-blob-store';
import { NextAfterScheduler } from '@/lib/webhooks/http/next-after-scheduler';

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

/** What every service builds on: storage, the database, time, logging and post-response scheduling. */
export interface Infrastructure {
  db: PrismaClient;
  logger: Logger;
  clock: Clock;
  scheduler: BackgroundScheduler;
  blobStore: BlobStore;
  repositories: Repositories;
  unitOfWork: UnitOfWork;
  senders: SenderResolver;
}

export function buildInfrastructure(config: AppConfig, overrides: ContainerOverrides): Infrastructure {
  const db = overrides.db ?? prisma;
  const logger = overrides.logger ?? createLogger(config.logging);
  logger.info(LogEvents.AppStarted, summarizeConfig(config));
  const repositories = createPrismaRepositories(db);
  return {
    db,
    logger,
    clock: overrides.clock ?? new SystemClock(),
    scheduler: overrides.scheduler ?? new NextAfterScheduler(),
    blobStore: overrides.blobStore ?? new LocalFileBlobStore(config.blobDir),
    repositories,
    unitOfWork: new PrismaUnitOfWork(db),
    senders: new SenderResolver(repositories.senders),
  };
}
