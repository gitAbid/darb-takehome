import { after } from 'next/server';

import type { BackgroundScheduler } from '@/lib/services/ingestion/background-scheduler';

/** Runs work after the response is sent, inside the same request lifetime (Next.js 15 `after`). */
export class NextAfterScheduler implements BackgroundScheduler {
  schedule(task: () => Promise<void>): void {
    after(task);
  }
}
