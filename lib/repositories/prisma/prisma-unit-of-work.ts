import type { PrismaClient } from '@prisma/client';

import type { Repositories, UnitOfWork } from '../unit-of-work';
import { PrismaDocumentRepository } from './prisma-document-repository';
import type { PrismaDb } from './prisma-db';
import { PrismaMatchRepository } from './prisma-match-repository';
import { PrismaSenderDirectory } from './prisma-sender-directory';
import { PrismaTransactionRepository } from './prisma-transaction-repository';

/** Runs work inside one Prisma interactive transaction: every repository write commits together or not at all. */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) => work(createPrismaRepositories(transaction)));
  }
}

/** All repositories bound to one connection (the root client, or a transaction client). */
export function createPrismaRepositories(db: PrismaDb): Repositories {
  return {
    documents: new PrismaDocumentRepository(db),
    matches: new PrismaMatchRepository(db),
    transactions: new PrismaTransactionRepository(db),
    senders: new PrismaSenderDirectory(db),
  };
}
