import { LogEvents } from '@/lib/logging/log-events';

describe('LogEvents', () => {
  it('uses the documented, dot-namespaced event names', () => {
    expect(Object.values(LogEvents)).toEqual([
      'webhook.received',
      'webhook.rejected',
      'webhook.message_ignored',
      'document.created',
      'document.duplicate',
      'document.failed',
      'sender.unknown',
      'extraction.completed',
      'match.decided',
      'review.confirmed',
      'review.rejected',
      'review.conflict',
    ]);
  });
});
