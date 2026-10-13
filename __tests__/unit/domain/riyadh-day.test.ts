import { riyadhDay } from '@/lib/domain/riyadh-day';

const JUNE_14 = Date.UTC(2025, 5, 14) / 86_400_000;

describe('riyadhDay', () => {
  it('reads a date-only string as a Riyadh calendar date, not UTC midnight', () => {
    expect(riyadhDay('2025-06-14')).toBe(JUNE_14);
  });

  it('reads a zone-less date-time as Riyadh local time', () => {
    expect(riyadhDay('2025-06-14T23:59:00')).toBe(JUNE_14);
    expect(riyadhDay('2025-06-14T00:00')).toBe(JUNE_14);
  });

  it('moves a late-UTC instant to the next Riyadh day (01:30 Riyadh = 22:30 UTC the day before)', () => {
    expect(riyadhDay(new Date('2025-06-13T22:30:00Z'))).toBe(JUNE_14);
    expect(riyadhDay('2025-06-13T22:30:00Z')).toBe(JUNE_14);
  });

  it('keeps an early-UTC instant on the same Riyadh day', () => {
    expect(riyadhDay(new Date('2025-06-14T20:59:59Z'))).toBe(JUNE_14);
    expect(riyadhDay(new Date('2025-06-14T21:00:00Z'))).toBe(JUNE_14 + 1);
  });

  it('honours explicit offsets in ISO strings', () => {
    expect(riyadhDay('2025-06-14T01:00:00+03:00')).toBe(JUNE_14);
  });

  it('trims surrounding whitespace', () => {
    expect(riyadhDay('  2025-06-14 ')).toBe(JUNE_14);
  });

  it.each(['', 'not a date', '2025-02-30', '2025-13-01', '14/06/2025'])(
    'returns null for invalid input %p',
    (input) => {
      expect(riyadhDay(input)).toBeNull();
    },
  );

  it('returns null for an invalid Date object', () => {
    expect(riyadhDay(new Date('nope'))).toBeNull();
  });
});
