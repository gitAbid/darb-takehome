import type { AmountRules } from '../matching-config';

export type AmountClass = 'EXACT' | 'TIP' | 'NEAR' | 'NONE';

/**
 * How the charged amount relates to the document total.
 * A tip is directional (the card is charged more, never less) and only exists at tipping merchants.
 */
export function classifyAmount(receipt: number, charged: number, mcc: string, rules: AmountRules): AmountClass {
  const difference = charged - receipt;
  if (Math.abs(difference) <= rules.roundingToleranceHalalas) return 'EXACT';
  if (isTip(difference, receipt, mcc, rules)) return 'TIP';
  if (Math.abs(difference) <= receipt * rules.nearRatio) return 'NEAR';
  return 'NONE';
}

function isTip(difference: number, receipt: number, mcc: string, rules: AmountRules): boolean {
  return rules.tipMccs.includes(mcc) && difference > 0 && difference <= receipt * rules.maxTipRatio;
}
