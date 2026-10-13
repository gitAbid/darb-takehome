import { RecordingLogger } from '@/lib/logging/recording-logger';

describe('RecordingLogger', () => {
  it('records level, event and context in order', () => {
    const logger = new RecordingLogger();

    logger.info('document.created', { documentId: 1 });
    logger.warn('sender.unknown');
    logger.error('document.failed', { stage: 'media' });

    expect(logger.entries).toEqual([
      { level: 'info', event: 'document.created', context: { documentId: 1 } },
      { level: 'warn', event: 'sender.unknown', context: {} },
      { level: 'error', event: 'document.failed', context: { stage: 'media' } },
    ]);
  });

  it('shares entries with children and includes inherited bindings', () => {
    const root = new RecordingLogger();
    const child = root.child({ correlationId: 'c-1' }).child({ documentId: 7 });

    child.info('match.decided', { outcome: 'AUTO_MATCHED' });

    expect(root.find('match.decided')).toEqual([
      {
        level: 'info',
        event: 'match.decided',
        context: { correlationId: 'c-1', documentId: 7, outcome: 'AUTO_MATCHED' },
      },
    ]);
  });

  it('finds nothing for an event that was never logged', () => {
    expect(new RecordingLogger().find('review.conflict')).toEqual([]);
  });
});
