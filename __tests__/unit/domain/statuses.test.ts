import { $Enums } from '@prisma/client';

import { DOCUMENT_SOURCES, DOCUMENT_STATUSES, isConfirmedMatchStatus, MATCH_STATUSES } from '@/lib/domain/statuses';

describe('domain statuses mirror the Prisma enums', () => {
  it.each([
    ['DocumentSource', DOCUMENT_SOURCES, $Enums.DocumentSource],
    ['DocumentStatus', DOCUMENT_STATUSES, $Enums.DocumentStatus],
    ['MatchStatus', MATCH_STATUSES, $Enums.MatchStatus],
  ])('%s', (_name, domain, prismaEnum) => {
    expect([...domain].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});

describe('isConfirmedMatchStatus', () => {
  it.each([
    ['AUTO_CONFIRMED', true],
    ['CONFIRMED', true],
    ['CANDIDATE', false],
    ['REJECTED', false],
  ] as const)('%s → %p', (status, expected) => {
    expect(isConfirmedMatchStatus(status)).toBe(expected);
  });
});
