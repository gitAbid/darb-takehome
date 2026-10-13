import type { SignalName } from '../types';
import type { SignalScore, SignalScorer } from './signal-scorer';

/**
 * Records that sender scoping was checked. Scope is enforced by ScopeFilter, so every surviving
 * candidate is in scope; the signal has weight 0 and exists for the explainable breakdown.
 */
export class ScopeSignal implements SignalScorer {
  readonly name: SignalName = 'scope';

  score(): SignalScore {
    return { value: 1 };
  }
}
