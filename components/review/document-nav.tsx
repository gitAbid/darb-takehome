import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

const LINK = 'inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium transition hover:bg-muted';

/** Touch-friendly navigation for small screens (keyboard users have J/K). */
export function DocumentNav({
  prevHref,
  nextHref,
  position,
}: {
  prevHref: string | null;
  nextHref: string;
  position: string;
}) {
  return (
    <div className="flex items-center gap-1 lg:hidden">
      <Link href="/review" className={LINK}>
        <List className="size-4" /> Queue
      </Link>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{position}</span>
      <Link
        href={prevHref ?? '#'}
        aria-disabled={prevHref === null}
        className={cn(LINK, prevHref === null && 'pointer-events-none opacity-40')}
        aria-label="Previous document"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <Link href={nextHref} className={LINK} aria-label="Next document">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
