export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/** Converts anything thrown into a JSON-safe shape. `Error` objects do not serialize with `JSON.stringify`. */
export function serializeError(thrown: unknown): SerializedError {
  if (thrown instanceof Error) {
    return { name: thrown.name, message: thrown.message, stack: thrown.stack };
  }
  return { name: 'NonErrorThrown', message: describe(thrown) };
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
