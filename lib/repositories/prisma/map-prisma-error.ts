import { Prisma } from '@prisma/client';

const CHECK_FAILED = /CHECK constraint failed: (\w+)/;

/** Fields of a violated unique constraint (Prisma P2002), or null for any other error. */
export function uniqueViolationFields(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map(String);
  return typeof target === 'string' ? [target] : [];
}

/** Name of a violated CHECK constraint, or null for any other error. */
export function checkViolationName(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return CHECK_FAILED.exec(error.message)?.[1] ?? null;
}
