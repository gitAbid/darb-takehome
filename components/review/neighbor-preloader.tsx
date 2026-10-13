'use client';

// Internal Next path: the public `router.prefetch` only takes a `kind`, and FULL is the one that fetches page data for
// a dynamic route (AUTO stops at the loading boundary). Pinned with Next 15.5; revisit on upgrade.
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { documentFileUrl, reviewHref } from '@/lib/review-ui/review-urls';

/**
 * Warms the documents J/K lead to: their page data (router cache) and their file (HTTP cache, served immutable), so
 * switching documents renders from memory instead of waiting on the server. Renders nothing.
 */
export function NeighborPreloader({ documentIds }: { documentIds: number[] }) {
  const router = useRouter();
  const key = documentIds.join(',');

  useEffect(() => {
    for (const id of documentIds) {
      router.prefetch(reviewHref(id), { kind: PrefetchKind.FULL });
      void fetch(documentFileUrl(id), { priority: 'low' }).catch(() => undefined);
    }
    // `key` stands for `documentIds`: a new array with the same ids must not re-preload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);

  return null;
}
