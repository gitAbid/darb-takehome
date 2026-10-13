import { jaroWinkler } from './jaro-winkler';
import { tokenWeight } from './merchant-vocabulary';
import type { StringSimilarity } from './string-similarity';

const DEFAULT_PAIR_THRESHOLD = 0.88;

export interface TokenDiceSimilarityOptions {
  /** Minimum Jaro–Winkler score for two tokens to count as the same word. */
  pairThreshold?: number;
  /** Importance of a token; defaults to generic category words 0.3, everything else 1. */
  weightOf?: (token: string) => number;
}

interface TokenPair {
  aIndex: number;
  bIndex: number;
  score: number;
}

/**
 * Weighted Dice coefficient over fuzzily paired tokens:
 * score = 2 · Σ(min(weightA, weightB) · JW) / (Σ weightsA + Σ weightsB).
 */
export class TokenDiceSimilarity implements StringSimilarity {
  private readonly pairThreshold: number;
  private readonly weightOf: (token: string) => number;

  constructor(options: TokenDiceSimilarityOptions = {}) {
    this.pairThreshold = options.pairThreshold ?? DEFAULT_PAIR_THRESHOLD;
    this.weightOf = options.weightOf ?? tokenWeight;
  }

  similarity(a: readonly string[], b: readonly string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const totalWeight = this.sumWeights(a) + this.sumWeights(b);
    if (totalWeight <= 0) return 0;
    const matchedWeight = this.pairTokens(a, b).reduce((sum, pair) => sum + this.pairWeight(a, b, pair), 0);
    return clamp((2 * matchedWeight) / totalWeight);
  }

  private sumWeights(tokens: readonly string[]): number {
    return tokens.reduce((sum, token) => sum + this.weightOf(token), 0);
  }

  /** One-to-one greedy pairing: best scores first, ties broken by position for determinism. */
  private pairTokens(a: readonly string[], b: readonly string[]): TokenPair[] {
    const usedA = new Set<number>();
    const usedB = new Set<number>();
    return this.candidatePairs(a, b).filter((pair) => {
      if (usedA.has(pair.aIndex) || usedB.has(pair.bIndex)) return false;
      usedA.add(pair.aIndex);
      usedB.add(pair.bIndex);
      return true;
    });
  }

  private candidatePairs(a: readonly string[], b: readonly string[]): TokenPair[] {
    const pairs: TokenPair[] = [];
    a.forEach((aToken, aIndex) =>
      b.forEach((bToken, bIndex) => {
        const score = jaroWinkler(aToken, bToken);
        if (score >= this.pairThreshold) pairs.push({ aIndex, bIndex, score });
      }),
    );
    return pairs.sort((x, y) => y.score - x.score || x.aIndex - y.aIndex || x.bIndex - y.bIndex);
  }

  private pairWeight(a: readonly string[], b: readonly string[], pair: TokenPair): number {
    return Math.min(this.weightOf(a[pair.aIndex]), this.weightOf(b[pair.bIndex])) * pair.score;
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
