import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { classifyAmount } from '@/lib/services/matching/signals/amount-classifier';
import { compareLast4 } from '@/lib/services/matching/signals/card-comparison';

const rules = defaultMatchingConfig.amount;

describe('classifyAmount', () => {
  it.each([
    ['identical', 15000, 15000, '5541', 'EXACT'],
    ['VAT rounding, up', 10000, 10004, '5541', 'EXACT'],
    ['rounding boundary (5 halalas)', 10000, 9995, '5541', 'EXACT'],
    ['restaurant tip of 10 % (spec example 57.50 → 63.25)', 5750, 6325, '5812', 'TIP'],
    ['fast-food tip at the 20 % boundary', 5000, 6000, '5814', 'TIP'],
    ['restaurant tip above 20 %', 5000, 6100, '5812', 'NONE'],
    ['tip-sized difference at a fuel station', 5000, 5500, '5541', 'NONE'],
    ['charged less than the receipt at a restaurant', 5750, 5000, '5812', 'NONE'],
    ['within 1 % but not rounding', 15000, 15100, '5541', 'NEAR'],
    ['1 % under', 15000, 14850, '5541', 'NEAR'],
    ['charged 2 % less', 5000, 4900, '5541', 'NONE'],
  ])('%s → %s', (_label, receipt, charged, mcc, expected) => {
    expect(classifyAmount(receipt, charged, mcc, rules)).toBe(expected);
  });

  it('treats a NaN charged amount as no match', () => {
    expect(classifyAmount(15000, Number.NaN, '5541', rules)).toBe('NONE');
  });
});

describe('compareLast4', () => {
  it.each([
    ['4471', '4471', 'EQUAL'],
    [' 4471 ', '4471', 'EQUAL'],
    ['4477', '4471', 'ONE_DIGIT'],
    ['4417', '4471', 'DIFFERENT'],
    ['0000', '9999', 'DIFFERENT'],
    [null, '4471', 'ABSENT'],
    ['4471', null, 'ABSENT'],
    ['', '4471', 'ABSENT'],
    ['447', '4471', 'ABSENT'],
    ['44a1', '4471', 'ABSENT'],
    ['44711', '4471', 'ABSENT'],
  ])('%p vs %p → %s', (a, b, expected) => {
    expect(compareLast4(a, b)).toBe(expected);
  });
});
