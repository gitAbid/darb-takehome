import { ConsoleLogger } from '@/lib/logging/console-logger';

function createSink() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('ConsoleLogger', () => {
  it('forwards each level to the brief logger with the event as message', () => {
    const sink = createSink();
    const logger = new ConsoleLogger({}, sink);

    logger.info('document.created', { documentId: 1 });
    logger.warn('sender.unknown', { channel: 'EMAIL' });
    logger.error('document.failed', { stage: 'extract' });

    expect(sink.info).toHaveBeenCalledWith('document.created', { documentId: 1 });
    expect(sink.warn).toHaveBeenCalledWith('sender.unknown', { channel: 'EMAIL' });
    expect(sink.error).toHaveBeenCalledWith('document.failed', { stage: 'extract' });
  });

  it('merges child bindings, letting call context override them', () => {
    const sink = createSink();
    const child = new ConsoleLogger({ service: 'ingestion' }, sink).child({ correlationId: 'c-1' });

    child.info('match.decided', { correlationId: 'override', outcome: 'NEEDS_REVIEW' });

    expect(sink.info).toHaveBeenCalledWith('match.decided', {
      service: 'ingestion',
      correlationId: 'override',
      outcome: 'NEEDS_REVIEW',
    });
  });

  it('logs with empty context when none is given', () => {
    const sink = createSink();

    new ConsoleLogger({}, sink).info('webhook.received');

    expect(sink.info).toHaveBeenCalledWith('webhook.received', {});
  });

  it('defaults to the brief console logger', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    new ConsoleLogger().info('webhook.received', { channel: 'WHATSAPP' });

    expect(spy).toHaveBeenCalledWith('[INFO] webhook.received', { channel: 'WHATSAPP' });
    spy.mockRestore();
  });
});
