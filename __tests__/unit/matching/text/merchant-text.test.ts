/** Merchant name normalization and similarity (IMPLEMENTATION.md §4). */
import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';
import { jaroWinkler } from '@/lib/services/matching/text/jaro-winkler';
import { TokenDiceSimilarity } from '@/lib/services/matching/text/token-dice-similarity';

const normalizer = new DefaultMerchantNormalizer();
const similarity = new TokenDiceSimilarity();
const compare = (a: string, b: string) => similarity.similarity(normalizer.normalize(a), normalizer.normalize(b));

describe('DefaultMerchantNormalizer', () => {
  it('reduces acquirer and receipt spellings to the same distinctive tokens', () => {
    const cases: [string, string[]][] = [
      ['ALFANAR FUEL ST 04 RUH', ['alfanar', 'fuel']], // store marker, number, city code
      ['Alfanar Fuel Company', ['alfanar', 'fuel']], // legal suffix
      ['AL MASHWAR GRILL JED', ['mashwar', 'grill']], // article "al"
      ["McDonald's #1234 JED", ['mcdonalds']], // apostrophe, #number
      ['Domino’s', ['dominos']], // curly apostrophe
      ['SAHARA AUTO SVC RUH', ['sahara', 'auto', 'service']], // abbreviation expanded
      ['Rawabi B12 Fuel', ['rawabi', 'fuel']], // alphanumeric branch code
      ['Rawabi ٠٤', ['rawabi']], // Arabic-Indic digits
      ['  ALFANAR\t\tFUEL -- ST.04 , RUH  ', ['alfanar', 'fuel']], // messy spacing and punctuation
      ['Café Nero', ['cafe', 'nero']], // diacritics
      ['Smith & Sons', ['smith', 'sons']], // & → and → dropped
      ['Fuel Rawabi Fuel RAWABI', ['fuel', 'rawabi']], // de-duplicated, first-seen order
    ];
    for (const [input, expected] of cases) expect([input, normalizer.normalize(input)]).toEqual([input, expected]);
  });

  it('returns no tokens for pure noise, and keeps Arabic script as tokens', () => {
    for (const noise of ['', '   ', '#1234', 'ST 04 RUH', 'Al The Co LLC', '---']) {
      expect(normalizer.normalize(noise)).toEqual([]);
    }
    expect(normalizer.normalize('الفنار').length).toBeGreaterThan(0);
  });
});

describe('jaroWinkler', () => {
  it('matches reference values, is symmetric, and is 0 for empty or disjoint strings', () => {
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961, 3);
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813, 3);
    expect(jaroWinkler('alfanar', 'alfnr')).toBeCloseTo(0.933, 3);
    expect(jaroWinkler('abcdefgh', 'abcdefxy')).toBeLessThan(1); // prefix bonus capped at 4
    expect(jaroWinkler('rawabi', 'rawabi')).toBe(1);
    expect(jaroWinkler('alfanar', 'aldrees')).toBeCloseTo(jaroWinkler('aldrees', 'alfanar'), 10);
    expect([jaroWinkler('', 'a'), jaroWinkler('a', ''), jaroWinkler('abc', 'xyz')]).toEqual([0, 0, 0]);
  });
});

describe('TokenDiceSimilarity', () => {
  it('scores the same merchant 1 regardless of spelling and token order', () => {
    expect(compare('ALFANAR FUEL ST 04 RUH', 'Alfanar Fuel Station 04')).toBe(1);
    expect(compare('SAHARA AUTO SVC RUH', 'Sahara Auto Service')).toBe(1);
    expect(similarity.similarity(['fuel', 'alfanar'], ['alfanar', 'fuel'])).toBe(1);
  });

  it('gives a shared generic word (weight 0.3) little credit: rawabi fuel vs alfanar fuel ≈ 0.23', () => {
    expect(similarity.similarity(['rawabi', 'fuel'], ['alfanar', 'fuel'])).toBeCloseTo((2 * 0.3) / 2.6, 4);
    expect(similarity.similarity(['alfanar', 'fuel'], ['alfanar'])).toBeCloseTo(2 / 2.3, 4);
    expect(similarity.similarity(['fuel', 'fuel'], ['fuel'])).toBeCloseTo((2 * 0.3) / 0.9, 4); // one-to-one pairing
  });

  it('tolerates typos in the distinctive word above the 0.88 pairing threshold, never below', () => {
    expect(similarity.similarity(['alfanar', 'fuel'], ['alfnr', 'fuel'])).toBeGreaterThanOrEqual(0.85);
    expect(new TokenDiceSimilarity({ pairThreshold: 0.99 }).similarity(['alfanar'], ['alfnr'])).toBe(0);
    expect(new TokenDiceSimilarity({ weightOf: () => 1 }).similarity(['rawabi', 'fuel'], ['alfanar', 'fuel'])).toBe(
      0.5,
    );
  });

  it('is 0 for unrelated, empty, weightless or cross-script names and always within [0, 1]', () => {
    expect(similarity.similarity(['lamaa', 'car', 'wash'], ['mashwar', 'grill'])).toBe(0);
    expect([similarity.similarity([], ['a']), similarity.similarity(['a'], [])]).toEqual([0, 0]);
    expect(new TokenDiceSimilarity({ weightOf: () => 0 }).similarity(['alfanar'], ['alfanar'])).toBe(0);
    expect(compare('الفنار', 'ALFANAR FUEL ST 04 RUH')).toBe(0);
    const names = ['ALFANAR FUEL ST 04 RUH', "McDonald's #1234 JED", 'Café Nero', 'الفنار', '#1234', 'fuel fuel fuel'];
    for (const a of names) for (const b of names) expect(compare(a, b)).toBeGreaterThanOrEqual(0);
    for (const a of names) for (const b of names) expect(compare(a, b)).toBeLessThanOrEqual(1);
  });
});
