import { Check, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CandidateView } from '@/lib/review-ui/view-models';
import { cn } from '@/lib/utils';

import { COMPARISON_DOT, COMPARISON_TEXT, CONFIDENCE_BAR, CONFIDENCE_TEXT } from './tones';

const DECIDED_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  AUTO_CONFIRMED: 'Auto-confirmed',
  REJECTED: 'Rejected',
};

export interface CandidateCardProps {
  candidate: CandidateView;
  focused: boolean;
  busy: 'confirm' | 'reject' | null;
  disabled: boolean;
  onFocus: () => void;
  onConfirm: () => void;
  onReject: () => void;
}

/** One candidate transaction compared side by side with the document, with its decision buttons. */
export function CandidateCard({
  candidate,
  focused,
  busy,
  disabled,
  onFocus,
  onConfirm,
  onReject,
}: CandidateCardProps) {
  return (
    <article
      onClick={onFocus}
      aria-label={`Candidate ${candidate.rank}: ${candidate.merchant}`}
      aria-current={focused ? 'true' : undefined}
      className={cn(
        'rounded-xl border bg-card p-4 shadow-xs transition-all duration-200 sm:p-5',
        focused && candidate.isPending && 'border-primary/40 ring-2 ring-primary/20',
        !candidate.isPending && 'opacity-70',
      )}
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">
          {candidate.rank}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{candidate.merchant}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {candidate.cardLabel} · {candidate.chargedAt}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">{candidate.charged}</p>
          <p className={cn('text-xs font-medium tabular-nums', CONFIDENCE_TEXT[candidate.confidenceTone])}>
            {candidate.confidence} match
          </p>
        </div>
      </header>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            CONFIDENCE_BAR[candidate.confidenceTone],
          )}
          style={{ width: candidate.confidence }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Comparison label="Amount" comparison={candidate.amount} />
        <Comparison label="Date" comparison={candidate.day} />
        <Comparison label="Card" comparison={candidate.card} />
      </dl>

      <ul className="mt-3 grid grid-cols-4 gap-3" aria-label="Signal scores">
        {candidate.signals.map((signal) => (
          <li key={signal.label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">{signal.label}</span>
              <span className="tabular-nums">{signal.value === null ? '—' : Math.round(signal.value * 100)}</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/50"
                style={{ width: `${(signal.value ?? 0) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {candidate.isPending ? (
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="h-11 sm:h-9"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onReject();
            }}
          >
            {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />} Reject
            {focused && <Kbd>X</Kbd>}
          </Button>
          <Button
            className="h-11 sm:h-9"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onConfirm();
            }}
          >
            {busy === 'confirm' ? <Loader2 className="animate-spin" /> : <Check />} Confirm match
            {focused && <Kbd inverted>↵</Kbd>}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-muted-foreground">{DECIDED_LABEL[candidate.status]}</p>
      )}
    </article>
  );
}

function Comparison({
  label,
  comparison,
}: {
  label: string;
  comparison: { label: string; tone: keyof typeof COMPARISON_TEXT };
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 sm:flex-col sm:gap-0.5">
      <dt className="w-16 shrink-0 text-xs text-muted-foreground sm:w-auto">{label}</dt>
      <dd className={cn('flex min-w-0 items-start gap-1.5 leading-snug font-medium', COMPARISON_TEXT[comparison.tone])}>
        <span
          className={cn('mt-[0.45em] size-1.5 shrink-0 rounded-full', COMPARISON_DOT[comparison.tone])}
          aria-hidden
        />
        <span className="min-w-0 break-words">{comparison.label}</span>
      </dd>
    </div>
  );
}

function Kbd({ children, inverted = false }: { children: React.ReactNode; inverted?: boolean }) {
  return (
    <kbd
      className={cn(
        'ml-1 hidden rounded border px-1 font-sans text-[10px] leading-4 md:inline-block',
        inverted ? 'border-primary-foreground/30 text-primary-foreground/80' : 'border-border text-muted-foreground',
      )}
    >
      {children}
    </kbd>
  );
}
