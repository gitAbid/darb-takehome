import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';
import { TokenDiceSimilarity } from '@/lib/services/matching/text/token-dice-similarity';

describe('TokenDiceSimilarity', () => {
  const similarity = new TokenDiceSimilarity();
  const normalizer = new DefaultMerchantNormalizer();
  const compare = (a: string, b: string) => similarity.similarity(normalizer.normalize(a), normalizer.normalize(b));

  describe('scoring', () => {
    it('is 1 for identical token lists', () => {
      expect(similarity.similarity(['alfanar', 'fuel'], ['alfanar', 'fuel'])).toBe(1);
      expect(similarity.similarity(['sahara', 'auto', 'service'], ['sahara', 'auto', 'service'])).toBe(1);
    });

    it('gives little credit for sharing only a generic word', () => {
      expect(similarity.similarity(['rawabi', 'fuel'], ['alfanar', 'fuel'])).toBeCloseTo((2 * 0.3) / 2.6, 4);
    });

    it('tolerates abbreviations and typos in the distinctive word', () => {
      expect(similarity.similarity(['alfanar', 'fuel'], ['alfnr', 'fuel'])).toBeGreaterThanOrEqual(0.85);
    });

    it('scores partial overlap between the two', () => {
      const score = similarity.similarity(['alfanar', 'fuel'], ['alfanar']);
      expect(score).toBeCloseTo(2 / 2.3, 4);
    });

    it('is 0 for unrelated merchants', () => {
      expect(similarity.similarity(['lamaa', 'car', 'wash'], ['mashwar', 'grill'])).toBe(0);
    });
  });

  describe('properties', () => {
    it('ignores token order', () => {
      expect(similarity.similarity(['fuel', 'alfanar'], ['alfanar', 'fuel'])).toBe(1);
    });

    it('is symmetric', () => {
      expect(similarity.similarity(['rawabi', 'fuel'], ['alfanar', 'fuel', 'company'])).toBeCloseTo(
        similarity.similarity(['alfanar', 'fuel', 'company'], ['rawabi', 'fuel']),
        10,
      );
    });

    it('pairs duplicate tokens one-to-one', () => {
      const score = similarity.similarity(['fuel', 'fuel'], ['fuel']);
      expect(score).toBeCloseTo((2 * 0.3) / 0.9, 4);
    });

    it('always stays within [0, 1] for messy real-world names', () => {
      const names = [
        'ALFANAR FUEL ST 04 RUH',
        'Alfanar Fuel Station',
        "McDonald's #1234 JED",
        'Café Nero',
        'الفنار',
        'SAHARA AUTO SVC RUH',
        '',
        '#1234',
        'Lamaa Car Wash',
        'fuel fuel fuel',
      ];
      for (const a of names) {
        for (const b of names) {
          const score = compare(a, b);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('end to end with the normalizer', () => {
    it('matches acquirer and receipt spellings of the same merchant', () => {
      expect(compare('ALFANAR FUEL ST 04 RUH', 'Alfanar Fuel Station 04')).toBe(1);
      expect(compare('AL MASHWAR GRILL JED', 'Al Mashwar Grill')).toBe(1);
      expect(compare('SAHARA AUTO SVC RUH', 'Sahara Auto Service')).toBe(1);
    });

    it('scores an Arabic receipt name against a Latin acquirer name as 0', () => {
      expect(compare('الفنار', 'ALFANAR FUEL ST 04 RUH')).toBe(0);
    });
  });

  describe('degenerate input', () => {
    it('is 0 when either side is empty', () => {
      expect(similarity.similarity([], ['alfanar'])).toBe(0);
      expect(similarity.similarity(['alfanar'], [])).toBe(0);
      expect(similarity.similarity([], [])).toBe(0);
    });

    it('is 0 when every token weighs nothing', () => {
      const weightless = new TokenDiceSimilarity({ weightOf: () => 0 });
      expect(weightless.similarity(['alfanar'], ['alfanar'])).toBe(0);
    });
  });

  describe('options', () => {
    it('honours a stricter pairing threshold', () => {
      const strict = new TokenDiceSimilarity({ pairThreshold: 0.99 });
      expect(strict.similarity(['alfanar'], ['alfnr'])).toBe(0);
    });

    it('honours a custom weight function', () => {
      const flat = new TokenDiceSimilarity({ weightOf: () => 1 });
      expect(flat.similarity(['rawabi', 'fuel'], ['alfanar', 'fuel'])).toBeCloseTo(0.5, 4);
    });
  });
});
