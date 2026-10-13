import { buildHttpHandlers, type HttpHandlers } from './composition/http-handlers';
import { buildInfrastructure, type ContainerOverrides } from './composition/infrastructure';
import { buildPipelines } from './composition/pipelines';
import { loadAppConfig, type AppConfig } from './config/app-config';
import { PrismaReviewQueueReader } from './repositories/prisma/prisma-review-queue-reader';
import type { ReviewQueueReader } from './repositories/review-queue-reader';
import { DocumentFileService } from './services/review/document-file-service';
import { ReviewService } from './services/review/review-service';

export type { ContainerOverrides } from './composition/infrastructure';

/** What the app's entry points (routes, server actions, the review page) use. */
export interface Container extends HttpHandlers {
  review: ReviewService;
  reviewQueue: ReviewQueueReader;
  documentFiles: DocumentFileService;
}

/** Kept on globalThis so dev hot reloads reuse it instead of re-spawning logger workers and re-hashing fixtures. */
const globalForContainer = globalThis as unknown as { darbContainer?: Container };

/**
 * The composition root: the one place that decides which implementation backs each interface. Built in three steps,
 * each in `lib/composition/`: shared infrastructure → the document and transaction pipelines → the HTTP handlers.
 */
export function createContainer(config: AppConfig = loadAppConfig(), overrides: ContainerOverrides = {}): Container {
  const infra = buildInfrastructure(config, overrides);
  const pipelines = buildPipelines(infra, config, overrides);
  return {
    ...buildHttpHandlers(pipelines, config.webhookSecurity, infra.logger),
    review: new ReviewService({ unitOfWork: infra.unitOfWork, clock: infra.clock, logger: infra.logger }),
    reviewQueue: new PrismaReviewQueueReader(infra.db),
    documentFiles: new DocumentFileService(infra.repositories.documents, infra.blobStore),
  };
}

/** Process-wide container, built on first use. */
export function getContainer(): Container {
  globalForContainer.darbContainer ??= createContainer();
  return globalForContainer.darbContainer;
}
