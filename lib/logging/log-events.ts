/** Stable event names (see docs/ARCHITECTURE.md §7). Logs are queried by these, so never rename them casually. */
export const LogEvents = {
  WebhookReceived: 'webhook.received',
  WebhookRejected: 'webhook.rejected',
  WebhookMessageIgnored: 'webhook.message_ignored',
  DocumentCreated: 'document.created',
  DocumentDuplicate: 'document.duplicate',
  DocumentFailed: 'document.failed',
  SenderUnknown: 'sender.unknown',
  ExtractionCompleted: 'extraction.completed',
  MatchDecided: 'match.decided',
  ReviewConfirmed: 'review.confirmed',
  ReviewRejected: 'review.rejected',
  ReviewConflict: 'review.conflict',
} as const;

export type LogEvent = (typeof LogEvents)[keyof typeof LogEvents];
