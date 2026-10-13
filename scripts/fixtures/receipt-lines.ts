/** Splits OCR-style raw text into printable lines, applying any printed-text overrides first. */
export function receiptLines(rawText: string, overrides: readonly (readonly [string, string])[] = []): string[] {
  const printed = overrides.reduce((text, [from, to]) => text.split(from).join(to), rawText);
  return printed.split('\n').map((line) => line.trimEnd());
}
