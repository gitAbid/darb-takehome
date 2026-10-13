/** The extraction provider (or the mock) failed to produce a result. */
export class ExtractionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionFailedError';
  }
}

/** The extractor returned something that does not satisfy the ExtractedDocument contract. */
export class InvalidExtractionError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid extraction result: ${issues.join('; ')}`);
    this.name = 'InvalidExtractionError';
  }
}
