/** Stable event names (see docs/ARCHITECTURE.md §7). Logs are queried by these, so never rename them casually. */
export const LogEvents = {
  AppStarted: 'app.started',
  HttpRequest: 'http.request',
  WebhookReceived: 'webhook.received',
  WebhookRejected: 'webhook.rejected',
  WebhookUnauthorized: 'webhook.unauthorized',
  WebhookSignatureDisabled: 'webhook.signature_disabled',
  WebhookMessageIgnored: 'webhook.message_ignored',
  MediaLoaded: 'media.loaded',
  DocumentCreated: 'document.created',
  DocumentDuplicate: 'document.duplicate',
  DocumentProcessing: 'document.processing',
  DocumentFailed: 'document.failed',
  SenderUnknown: 'sender.unknown',
  LlmCompleted: 'llm.completed',
  LlmFailed: 'llm.failed',
  ExtractionCompleted: 'extraction.completed',
  ExtractionFields: 'extraction.fields',
  MatchCandidates: 'match.candidates',
  MatchDecided: 'match.decided',
  TransactionReceived: 'transaction.received',
  RematchCompleted: 'rematch.completed',
  ReviewConfirmed: 'review.confirmed',
  ReviewRejected: 'review.rejected',
  ReviewConflict: 'review.conflict',
} as const;

export type LogEvent = (typeof LogEvents)[keyof typeof LogEvents];
