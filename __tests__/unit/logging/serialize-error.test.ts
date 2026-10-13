import { serializeError } from '@/lib/logging/serialize-error';

describe('serializeError', () => {
  it('keeps name, message and stack of an Error', () => {
    const error = new TypeError('bad input');

    const serialized = serializeError(error);

    expect(serialized).toEqual({ name: 'TypeError', message: 'bad input', stack: error.stack });
    expect(JSON.parse(JSON.stringify(serialized))).toMatchObject({ name: 'TypeError', message: 'bad input' });
  });

  it('keeps the name of custom Error subclasses', () => {
    class ExtractionError extends Error {
      name = 'ExtractionError';
    }

    expect(serializeError(new ExtractionError('provider 503')).name).toBe('ExtractionError');
  });

  it.each([
    ['a string', 'boom', 'boom'],
    ['a number', 42, '42'],
    ['an object', { code: 'E1' }, '{"code":"E1"}'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('describes %s thrown as a non-error', (_label, thrown, message) => {
    expect(serializeError(thrown)).toEqual({ name: 'NonErrorThrown', message });
  });

  it('does not throw on circular objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(serializeError(circular)).toEqual({ name: 'NonErrorThrown', message: '[object Object]' });
  });
});
