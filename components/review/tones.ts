import type { Tone } from '@/lib/review-ui/comparisons';
import type { ReasonTone } from '@/lib/review-ui/reasons';
import type { ConfidenceTone } from '@/lib/review-ui/signals';

/** Semantic colours shared by every review component (light and dark). */
export const COMPARISON_TEXT: Record<Tone, string> = {
  match: 'text-emerald-700 dark:text-emerald-400',
  close: 'text-amber-700 dark:text-amber-400',
  mismatch: 'text-rose-700 dark:text-rose-400',
  unknown: 'text-muted-foreground',
};

export const COMPARISON_DOT: Record<Tone, string> = {
  match: 'bg-emerald-500',
  close: 'bg-amber-500',
  mismatch: 'bg-rose-500',
  unknown: 'bg-muted-foreground/40',
};

export const REASON_BADGE: Record<ReasonTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300',
  danger: 'bg-rose-500/10 text-rose-700 ring-rose-600/20 dark:text-rose-300',
  neutral: 'bg-muted text-muted-foreground ring-border',
};

export const CONFIDENCE_TEXT: Record<ConfidenceTone, string> = {
  high: 'text-emerald-700 dark:text-emerald-400',
  medium: 'text-amber-700 dark:text-amber-400',
  low: 'text-rose-700 dark:text-rose-400',
};

export const CONFIDENCE_BAR: Record<ConfidenceTone, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-rose-500',
};
