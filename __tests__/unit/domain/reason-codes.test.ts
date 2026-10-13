import { REASON_CODES, sortReasons } from '@/lib/domain/reason-codes';

describe('sortReasons', () => {
  it('returns reasons in canonical order regardless of input order', () => {
    expect(sortReasons(['NEAR_TIE', 'BELOW_AUTO_THRESHOLD', 'CARD_POSSIBLE_MISREAD'])).toEqual([
      'BELOW_AUTO_THRESHOLD',
      'NEAR_TIE',
      'CARD_POSSIBLE_MISREAD',
    ]);
  });

  it('removes duplicates', () => {
    expect(sortReasons(['NEAR_TIE', 'NEAR_TIE'])).toEqual(['NEAR_TIE']);
  });

  it('returns an empty list for no reasons', () => {
    expect(sortReasons([])).toEqual([]);
  });

  it('has no duplicate codes in the canonical list', () => {
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
  });
});
