import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';

describe('DefaultMerchantNormalizer', () => {
  const normalizer = new DefaultMerchantNormalizer();

  describe('real-world acquirer and receipt strings', () => {
    it.each([
      ['ALFANAR FUEL ST 04 RUH', ['alfanar', 'fuel']],
      ['Alfanar Fuel Station', ['alfanar', 'fuel']],
      ['Alfanar Fuel Station 04', ['alfanar', 'fuel']],
      ['Alfanar Fuel Company', ['alfanar', 'fuel']],
      ['ALFANAR FUEL ST 11 RUH', ['alfanar', 'fuel']],
      ['AL MASHWAR GRILL JED', ['mashwar', 'grill']],
      ['Al Mashwar Grill', ['mashwar', 'grill']],
      ["McDonald's #1234 JED", ['mcdonalds']],
      ['SAHARA AUTO SVC RUH', ['sahara', 'auto', 'service']],
      ['Sahara Auto Service', ['sahara', 'auto', 'service']],
      ['Lamaa Car Wash', ['lamaa', 'car', 'wash']],
      ['LAMAA CAR WASH RUH', ['lamaa', 'car', 'wash']],
      ['RAWABI FUEL 07 DMM', ['rawabi', 'fuel']],
      ['Rawabi Fuel 03', ['rawabi', 'fuel']],
      ['Rawabi Fuel Company LLC', ['rawabi', 'fuel']],
      ['EMIRATES ROAD FUEL DXB', ['emirates', 'road', 'fuel']],
    ])('%s → %j', (input, expected) => {
      expect(normalizer.normalize(input)).toEqual(expected);
    });
  });

  describe('messy formatting', () => {
    it('collapses extra spaces, tabs and punctuation', () => {
      expect(normalizer.normalize('  ALFANAR\t\tFUEL -- ST.04 , RUH  ')).toEqual(['alfanar', 'fuel']);
    });

    it('strips diacritics', () => {
      expect(normalizer.normalize('Café Nero')).toEqual(['cafe', 'nero']);
    });

    it('turns & into "and", which is then dropped as a connector', () => {
      expect(normalizer.normalize('Smith & Sons')).toEqual(['smith', 'sons']);
    });

    it('drops curly and straight apostrophes without splitting the word', () => {
      expect(normalizer.normalize('Domino’s')).toEqual(['dominos']);
      expect(normalizer.normalize("Domino's")).toEqual(['dominos']);
    });

    it('drops alphanumeric branch codes such as "B12"', () => {
      expect(normalizer.normalize('Rawabi B12 Fuel')).toEqual(['rawabi', 'fuel']);
    });

    it('removes duplicates while preserving first-seen order', () => {
      expect(normalizer.normalize('Fuel Rawabi Fuel RAWABI')).toEqual(['fuel', 'rawabi']);
    });

    it('expands abbreviations before filtering', () => {
      expect(normalizer.normalize('NAJD REST')).toEqual(['najd', 'restaurant']);
    });
  });

  describe('degenerate input', () => {
    it.each(['', '   ', '#1234', 'ST 04 RUH', 'Al The Co LLC', '---'])('returns [] for noise-only %j', (input) => {
      expect(normalizer.normalize(input)).toEqual([]);
    });

    it('keeps Arabic text as tokens instead of crashing', () => {
      const tokens = normalizer.normalize('الفنار');
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((token) => token.length > 0)).toBe(true);
    });

    it('drops Arabic-Indic digits like other digits', () => {
      expect(normalizer.normalize('Rawabi ٠٤')).toEqual(['rawabi']);
    });
  });
});
