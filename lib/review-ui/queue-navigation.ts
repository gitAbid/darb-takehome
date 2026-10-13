/** Where J/K (and the mobile arrows) lead from the current document. Pure, so it is unit-tested. */
export interface QueueNavigation {
  nextHref: string;
  prevHref: string | null;
  position: string;
}

export function queueNavigation(queueIds: readonly number[], currentId: number | null): QueueNavigation {
  const index = currentId === null ? -1 : queueIds.indexOf(currentId);
  const others = queueIds.filter((id) => id !== currentId);
  const next = index >= 0 ? (queueIds[index + 1] ?? others[0]) : others[0];
  const prev = index > 0 ? queueIds[index - 1] : undefined;
  return {
    nextHref: next === undefined ? '/review' : hrefFor(next),
    prevHref: prev === undefined ? null : hrefFor(prev),
    position: index >= 0 ? `${index + 1} of ${queueIds.length}` : `${queueIds.length} waiting`,
  };
}

function hrefFor(documentId: number): string {
  return `/review?doc=${documentId}`;
}
