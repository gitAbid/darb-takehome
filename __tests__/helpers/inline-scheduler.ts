import type { BackgroundScheduler } from '@/lib/services/ingestion/background-scheduler';

/** Stands in for Next.js `after()`: collects the post-response work so a test can await it deterministically. */
export class InlineScheduler implements BackgroundScheduler {
  private readonly pending: Promise<void>[] = [];

  schedule(task: () => Promise<void>): void {
    this.pending.push(task());
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending.splice(0));
  }
}
