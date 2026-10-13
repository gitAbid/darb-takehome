'use client';

import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';

import { confirmMatch, rejectMatch } from '@/lib/actions/review';
import type { CandidateView } from '@/lib/review-ui/view-models';
import type { ReviewErrorCode } from '@/lib/services/review/review-outcome';
import { cn } from '@/lib/utils';

import { CandidateCard } from './candidate-card';

const ERROR_COPY: Record<ReviewErrorCode | 'UNEXPECTED', string> = {
  MATCH_NOT_FOUND: 'This candidate no longer exists. The list was refreshed.',
  MATCH_NOT_PENDING: 'Someone already decided this candidate. The list was refreshed.',
  TRANSACTION_ALREADY_HAS_DOCUMENT:
    'This transaction already has a confirmed document. If this is a duplicate, reject it instead.',
  DOCUMENT_ALREADY_MATCHED: 'This document was already matched. The list was refreshed.',
  UNEXPECTED: 'Something went wrong. Nothing was changed — please try again.',
};

export interface CandidateBoardProps {
  candidates: CandidateView[];
  canDecide: boolean;
  /** Look-alike candidates (NEAR_TIE): nothing is pre-selected, so Enter cannot confirm a coin flip. */
  requireChoice: boolean;
  nextHref: string;
  prevHref: string | null;
}

/**
 * Candidates for one document, decided with a click or the keyboard (1–5 select, Enter/C confirm, X reject,
 * J/K next/previous). After a decision that resolves the document, the reviewer lands on the next one.
 */
export function CandidateBoard({ candidates, canDecide, requireChoice, nextHref, prevHref }: CandidateBoardProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [focused, setFocused] = useState(() => (requireChoice ? -1 : candidates.findIndex((c) => c.isPending)));
  const [busy, setBusy] = useState<{ matchId: number; kind: 'confirm' | 'reject' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useAction(confirmMatch);
  const reject = useAction(rejectMatch);

  const choose = useCallback((index: number) => {
    setFocused(index);
    setError(null);
  }, []);

  // A server action re-renders the current route as it settles; a push started inside that same render would be
  // superseded. Deferring by one task lets it settle first, while the transition still keeps the old page on screen
  // (no skeleton flash) until the next document is ready.
  const go = useCallback(
    (href: string) => setTimeout(() => startTransition(() => router.push(href, { scroll: false })), 0),
    [router],
  );

  const decide = useCallback(
    async (candidate: CandidateView | undefined, kind: 'confirm' | 'reject') => {
      if (!candidate?.isPending || !canDecide || busy) return;
      setBusy({ matchId: candidate.matchId, kind });
      setError(null);
      const action = kind === 'confirm' ? confirm : reject;
      const result = (await action.executeAsync({ matchId: candidate.matchId }))?.data;
      setBusy(null);
      if (!result?.ok) {
        setError(ERROR_COPY[result?.code ?? 'UNEXPECTED']);
        startTransition(() => router.refresh());
        return;
      }
      const resolved = kind === 'confirm' || ('remainingCandidates' in result && result.remainingCandidates === 0);
      if (resolved) go(nextHref);
      else startTransition(() => router.refresh());
    },
    [busy, canDecide, confirm, go, nextHref, reject, router],
  );

  useEffect(() => {
    const handleKey = (key: string): boolean => {
      if (key === 'j' || key === 'arrowdown') {
        go(nextHref);
        return true;
      }
      if ((key === 'k' || key === 'arrowup') && prevHref) {
        go(prevHref);
        return true;
      }
      if (/^[1-5]$/.test(key) && Number(key) <= candidates.length) {
        choose(Number(key) - 1);
        return true;
      }
      if (key === 'enter' || key === 'c' || key === 'x') {
        if (focused < 0) setError('These candidates look alike — pick one first (press its number or click it).');
        else void decide(candidates[focused], key === 'x' ? 'reject' : 'confirm');
        return true;
      }
      return false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ownsKey(event.target, event.key)) return;
      if (handleKey(event.key.toLowerCase())) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candidates, choose, decide, focused, go, nextHref, prevHref]);

  return (
    <section
      aria-label="Candidate transactions"
      className={cn('space-y-3 transition-opacity', isNavigating && 'opacity-60')}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">
          Candidate transactions <span className="font-normal text-muted-foreground">· best first</span>
        </h2>
      </div>
      {requireChoice && focused < 0 && !error && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          These candidates look alike. Compare the details, then pick one — nothing is pre-selected.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-300"
        >
          {error}
        </p>
      )}
      {candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No candidate transactions were kept for this document.
        </p>
      ) : (
        candidates.map((candidate, index) => (
          <CandidateCard
            key={candidate.matchId}
            candidate={candidate}
            focused={index === focused}
            busy={busy?.matchId === candidate.matchId ? busy.kind : null}
            disabled={!canDecide || busy !== null}
            onFocus={() => choose(index)}
            onConfirm={() => void decide(candidate, 'confirm')}
            onReject={() => void decide(candidate, 'reject')}
          />
        ))
      )}
    </section>
  );
}

/** Leave keys to the focused element when it handles them natively (typing, or Enter/Space on a button or link). */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return (key === 'Enter' || key === ' ') && ['BUTTON', 'A'].includes(target.tagName);
}
