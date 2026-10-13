import { FixedClock, SystemClock } from '@/lib/domain/clock';

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('FixedClock', () => {
  it('always returns the configured instant', () => {
    const clock = new FixedClock(new Date('2025-06-14T09:00:00Z'));
    expect(clock.now().toISOString()).toBe('2025-06-14T09:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2025-06-14T09:00:00.000Z');
  });

  it('returns a copy so callers cannot mutate its time', () => {
    const clock = new FixedClock(new Date('2025-06-14T09:00:00Z'));
    clock.now().setUTCFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2025);
  });
});
