import { reviewHref } from './review-urls';

/** Where J/K (and the mobile arrows) lead from the current document. Pure, so it is unit-tested. */
export interface QueueNavigation {
  nextHref: string;
  prevHref: string | null;
  position: string;
  /** Next then previous document, deduplicated: what the page preloads so J/K land instantly. */
  neighborIds: number[];
}

export function queueNavigation(queueIds: readonly number[], currentId: number | null): QueueNavigation {
  const index = currentId === null ? -1 : queueIds.indexOf(currentId);
  const others = queueIds.filter((id) => id !== currentId);
  const next = index >= 0 ? (queueIds[index + 1] ?? others[0]) : others[0];
  const prev = index > 0 ? queueIds[index - 1] : undefined;
  return {
    nextHref: next === undefined ? '/review' : reviewHref(next),
    prevHref: prev === undefined ? null : reviewHref(prev),
    position: index >= 0 ? `${index + 1} of ${queueIds.length}` : `${queueIds.length} waiting`,
    neighborIds: [...new Set([next, prev].filter((id): id is number => id !== undefined))],
  };
}
