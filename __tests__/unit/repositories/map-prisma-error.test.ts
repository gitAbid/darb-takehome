import { Prisma } from '@prisma/client';

import { checkViolationName, uniqueViolationFields } from '@/lib/repositories/prisma/map-prisma-error';

const knownError = (code: string, target?: unknown) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test', meta: { target } });

describe('Prisma error mapping', () => {
  it('names the fields of a unique violation however the driver reports them, and ignores other errors', () => {
    expect(
      [
        knownError('P2002', ['externalId']),
        knownError('P2002', 'Document_contentHash_key'),
        knownError('P2002'),
        knownError('P2025'),
        new Error('boom'),
      ].map(uniqueViolationFields),
    ).toEqual([['externalId'], ['Document_contentHash_key'], [], null, null]);
  });

  it('extracts the CHECK constraint name from a driver error', () => {
    expect(
      [new Error('CHECK constraint failed: Document_failed_has_reason'), new Error('other'), 'not an error'].map(
        checkViolationName,
      ),
    ).toEqual(['Document_failed_has_reason', null, null]);
  });
});
