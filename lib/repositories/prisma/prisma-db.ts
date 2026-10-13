import type { Prisma, PrismaClient } from '@prisma/client';

/** Either the root client or a transaction client, so repositories work inside and outside a unit of work. */
export type PrismaDb = PrismaClient | Prisma.TransactionClient;
