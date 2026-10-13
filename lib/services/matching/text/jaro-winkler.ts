const PREFIX_SCALE = 0.1;
const MAX_PREFIX_LENGTH = 4;

/** Jaro–Winkler similarity, 0..1. Tolerates typos and abbreviations; rewards a shared prefix. */
export function jaroWinkler(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const jaroScore = jaro(a, b);
  return jaroScore + commonPrefixLength(a, b) * PREFIX_SCALE * (1 - jaroScore);
}

function jaro(a: string, b: string): number {
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  const matches = countMatches(a, b, window, aMatched, bMatched);
  if (matches === 0) return 0;
  const transpositions = countTranspositions(a, b, aMatched, bMatched) / 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

function countMatches(a: string, b: string, window: number, aMatched: boolean[], bMatched: boolean[]): number {
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  return matches;
}

function countTranspositions(a: string, b: string, aMatched: boolean[], bMatched: boolean[]): number {
  let transpositions = 0;
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[j]) j++;
    if (a[i] !== b[j]) transpositions++;
    j++;
  }
  return transpositions;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(MAX_PREFIX_LENGTH, a.length, b.length);
  let length = 0;
  while (length < limit && a[length] === b[length]) length++;
  return length;
}
