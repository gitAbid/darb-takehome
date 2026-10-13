import { jaroWinkler } from '@/lib/services/matching/text/jaro-winkler';

describe('jaroWinkler', () => {
  it.each([
    ['MARTHA', 'MARHTA', 0.961],
    ['DIXON', 'DICKSONX', 0.813],
    ['DWAYNE', 'DUANE', 0.84],
    ['alfanar', 'alfnr', 0.933],
  ])('%s vs %s ≈ %d', (a, b, expected) => {
    expect(jaroWinkler(a, b)).toBeCloseTo(expected, 3);
  });

  it('is 1 for identical strings', () => {
    expect(jaroWinkler('rawabi', 'rawabi')).toBe(1);
    expect(jaroWinkler('a', 'a')).toBe(1);
  });

  it('is 0 when either side is empty', () => {
    expect(jaroWinkler('', 'rawabi')).toBe(0);
    expect(jaroWinkler('rawabi', '')).toBe(0);
    expect(jaroWinkler('', '')).toBe(0);
  });

  it('is 0 when no characters match', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
    expect(jaroWinkler('a', 'b')).toBe(0);
  });

  it('is symmetric', () => {
    expect(jaroWinkler('alfanar', 'aldrees')).toBeCloseTo(jaroWinkler('aldrees', 'alfanar'), 10);
  });

  it('stays below the token pairing threshold for different brands', () => {
    expect(jaroWinkler('rawabi', 'alfanar')).toBeLessThan(0.88);
    expect(jaroWinkler('alfanar', 'aldrees')).toBeLessThan(0.88);
  });

  it('caps the prefix bonus at four characters', () => {
    const score = jaroWinkler('abcdefgh', 'abcdefxy');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
