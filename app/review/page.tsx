import type { Metadata } from 'next';

import { CandidateBoard } from '@/components/review/candidate-board';
import { DocumentNav } from '@/components/review/document-nav';
import { DocumentPanel } from '@/components/review/document-panel';
import { EmptyState } from '@/components/review/empty-state';
import { KeyboardHints } from '@/components/review/keyboard-hints';
import { QueueList } from '@/components/review/queue-list';
import { StatusCounts } from '@/components/review/status-counts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getContainer } from '@/lib/container';
import { queueNavigation } from '@/lib/review-ui/queue-navigation';
import { toDocumentView, toQueueRow } from '@/lib/review-ui/view-models';
import { cn } from '@/lib/utils';

const QUEUE_LIMIT = 200;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review queue · Darb' };

/** Review queue (bonus B1): documents the matcher was unsure about, decided one by one. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const requestedId = parseDocumentId((await searchParams).doc);
  const { reviewQueue } = getContainer();
  const [queue, counts] = await Promise.all([reviewQueue.listQueue(QUEUE_LIMIT), reviewQueue.countByStatus()]);
  const now = new Date();
  const rows = queue.map((item) => toQueueRow(item, now));
  const selectedId = requestedId ?? rows[0]?.documentId ?? null;
  const document = selectedId === null ? null : await reviewQueue.findDocument(selectedId);
  const view = document === null ? null : toDocumentView(document);
  const navigation = queueNavigation(
    rows.map((row) => row.documentId),
    selectedId,
  );
  const showDetailOnMobile = requestedId !== null;

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            D
          </span>
          <h1 className="text-sm font-semibold tracking-tight sm:text-base">Review queue</h1>
          <StatusCounts counts={counts} className="ml-auto" />
        </header>

        <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <aside className={cn('lg:min-h-0 lg:overflow-y-auto lg:border-r', showDetailOnMobile && 'hidden lg:block')}>
            <p className="sticky top-14 z-10 border-b bg-background/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur lg:top-0">
              {rows.length} waiting · oldest first
            </p>
            {rows.length === 0 ? <EmptyState /> : <QueueList rows={rows} selectedId={selectedId} />}
          </aside>

          <main className={cn('lg:min-h-0 lg:overflow-y-auto', !showDetailOnMobile && 'hidden lg:block')}>
            {view === null ? (
              <EmptyState />
            ) : (
              <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
                <DocumentNav {...navigation} />
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-6">
                  <DocumentPanel document={view} />
                  <CandidateBoard
                    key={view.documentId}
                    candidates={view.candidates}
                    canDecide={view.status === 'NEEDS_REVIEW'}
                    requireChoice={view.reasons.includes('NEAR_TIE')}
                    nextHref={navigation.nextHref}
                    prevHref={navigation.prevHref}
                  />
                </div>
              </div>
            )}
          </main>
        </div>
        <KeyboardHints />
      </div>
    </TooltipProvider>
  );
}

function parseDocumentId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
