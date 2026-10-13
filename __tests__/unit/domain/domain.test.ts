/** Domain primitives: Riyadh calendar day, content identity, clock, reason codes, lifecycle statuses. */
import { $Enums } from '@prisma/client';

import { FixedClock, SystemClock } from '@/lib/domain/clock';
import { contentHash } from '@/lib/domain/content-hash';
import { REASON_CODES, sortReasons } from '@/lib/domain/reason-codes';
import { riyadhDay } from '@/lib/domain/riyadh-day';
import { DOCUMENT_SOURCES, DOCUMENT_STATUSES, isConfirmedMatchStatus, MATCH_STATUSES } from '@/lib/domain/statuses';

const JUNE_14 = Date.UTC(2025, 5, 14) / 86_400_000;

describe('riyadhDay', () => {
  it('reads dates as Riyadh (UTC+3) calendar days, never as UTC midnight', () => {
    expect(riyadhDay('2025-06-14')).toBe(JUNE_14); // date-only = Riyadh date
    expect(riyadhDay(' 2025-06-14T23:59:00 ')).toBe(JUNE_14); // zone-less = Riyadh local time
    expect(riyadhDay(new Date('2025-06-13T22:30:00Z'))).toBe(JUNE_14); // 01:30 Riyadh, previous day in UTC
    expect(riyadhDay('2025-06-14T20:59:59Z')).toBe(JUNE_14);
    expect(riyadhDay(new Date('2025-06-14T21:00:00Z'))).toBe(JUNE_14 + 1); // midnight in Riyadh
    expect(riyadhDay('2025-06-14T01:00:00+03:00')).toBe(JUNE_14); // explicit offset honoured
  });

  it('returns null for anything that is not a real date', () => {
    for (const invalid of ['', 'not a date', '2025-02-30', '2025-13-01', '14/06/2025']) {
      expect(riyadhDay(invalid)).toBeNull();
    }
    expect(riyadhDay(new Date('nope'))).toBeNull();
  });
});

describe('contentHash', () => {
  it('is the hex SHA-256 of the bytes, so identical files share an identity', () => {
    expect(contentHash(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(contentHash(Buffer.from('receipt'))).not.toBe(contentHash(Buffer.from('receipt ')));
  });
});

describe('clocks', () => {
  it('SystemClock reads the real time; FixedClock always returns a copy of its instant', () => {
    const before = Date.now();
    expect(new SystemClock().now().getTime()).toBeGreaterThanOrEqual(before);
    const fixed = new FixedClock(new Date('2025-06-14T09:00:00Z'));
    fixed.now().setUTCFullYear(1999);
    expect(fixed.now().toISOString()).toBe('2025-06-14T09:00:00.000Z');
  });
});

describe('reason codes', () => {
  it('are reported de-duplicated, in one canonical order', () => {
    expect(sortReasons(['CARD_POSSIBLE_MISREAD', 'NEAR_TIE', 'BELOW_AUTO_THRESHOLD', 'NEAR_TIE'])).toEqual([
      'BELOW_AUTO_THRESHOLD',
      'NEAR_TIE',
      'CARD_POSSIBLE_MISREAD',
    ]);
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
  });
});

describe('lifecycle statuses', () => {
  it('mirror the Prisma enums, and only AUTO_CONFIRMED/CONFIRMED count as confirmed', () => {
    expect([...DOCUMENT_SOURCES].sort()).toEqual(Object.values($Enums.DocumentSource).sort());
    expect([...DOCUMENT_STATUSES].sort()).toEqual(Object.values($Enums.DocumentStatus).sort());
    expect([...MATCH_STATUSES].sort()).toEqual(Object.values($Enums.MatchStatus).sort());
    expect(MATCH_STATUSES.filter(isConfirmedMatchStatus)).toEqual(['AUTO_CONFIRMED', 'CONFIRMED']);
  });
});
