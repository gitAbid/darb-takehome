/** Similarity of two normalized token lists, 0 (unrelated) to 1 (identical). */
export interface StringSimilarity {
  similarity(a: readonly string[], b: readonly string[]): number;
}
