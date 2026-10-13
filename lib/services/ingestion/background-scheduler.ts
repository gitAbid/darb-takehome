/** Runs work after the HTTP response has been sent (Next.js `after()` in production, inline in tests). */
export interface BackgroundScheduler {
  schedule(task: () => Promise<void>): void;
}
