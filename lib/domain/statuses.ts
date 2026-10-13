/** Lifecycle values. They mirror the Prisma enums (a test keeps them in sync) so services never import Prisma. */
export const DOCUMENT_SOURCES = ['EMAIL', 'WHATSAPP'] as const;
export const DOCUMENT_STATUSES = ['RECEIVED', 'EXTRACTED', 'MATCHED', 'NEEDS_REVIEW', 'UNMATCHED', 'FAILED'] as const;
export const MATCH_STATUSES = ['CANDIDATE', 'AUTO_CONFIRMED', 'CONFIRMED', 'REJECTED'] as const;
export const CONFIRMED_MATCH_STATUSES = ['AUTO_CONFIRMED', 'CONFIRMED'] as const;

export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export function isConfirmedMatchStatus(status: MatchStatus): boolean {
  return (CONFIRMED_MATCH_STATUSES as readonly MatchStatus[]).includes(status);
}
