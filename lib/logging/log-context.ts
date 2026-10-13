import { AsyncLocalStorage } from 'node:async_hooks';

import type { LogContext } from './logger';

const store = new AsyncLocalStorage<LogContext>();

/**
 * Runs `work` with `context` (e.g. a correlationId) attached to every log event inside it, including work scheduled
 * with Next's `after()`, which keeps the request's async context. Saves threading a logger through every call.
 */
export function runWithLogContext<T>(context: LogContext, work: () => T): T {
  return store.run({ ...currentLogContext(), ...context }, work);
}

/**
 * A copy of the surrounding `runWithLogContext` context (empty outside one). A copy because pino's `mixin` merges each
 * line's fields into the object it is given — the shared store would otherwise grow with every line.
 */
export function currentLogContext(): LogContext {
  return { ...store.getStore() };
}
