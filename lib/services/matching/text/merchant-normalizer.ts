/** Turns a raw merchant name (acquirer string or receipt header) into comparable tokens. */
export interface MerchantNormalizer {
  normalize(name: string): string[];
}
