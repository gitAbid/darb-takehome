import { parseDocumentDate } from '@/lib/domain/document-date';
import { toE164 } from '@/lib/domain/phone';
import { TimeoutError, withTimeout } from '@/lib/domain/with-timeout';
import { candidateWindow } from '@/lib/services/matching/candidate-window';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';

describe('input normalization', () => {
  it('normalizes phones to E.164 and rejects non-phones', () => {
    expect(['966551234567', '+966 55 123-4567', '0551234567', 'abc', '12'].map(toE164)).toEqual([
      '+966551234567',
      '+966551234567',
      null,
      null,
      null,
    ]);
  });

  it('stores date-only document dates as UTC midnight of that calendar date; garbage becomes null', () => {
    expect(
      ['2025-06-14', '2025-06-14T20:38:00+03:00', 'garbage', null].map(
        (v) => parseDocumentDate(v)?.toISOString() ?? null,
      ),
    ).toEqual(['2025-06-14T00:00:00.000Z', '2025-06-14T17:38:00.000Z', null, null]);
  });

  it('loads candidates from 31 days before to 4 days after the document date (all windows + slack)', () => {
    expect(candidateWindow('2025-06-14', defaultMatchingConfig.date)).toEqual({
      from: new Date('2025-05-14T00:00:00.000Z'),
      to: new Date('2025-06-18T00:00:00.000Z'),
    });
    expect(candidateWindow(null, defaultMatchingConfig.date)).toBeNull();
  });

  it('times out slow work and passes through fast work', async () => {
    await expect(withTimeout(Promise.resolve('fast'), 50)).resolves.toBe('fast');
    await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toBeInstanceOf(TimeoutError);
  });
});
