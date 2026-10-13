export const INVALID_JSON = Symbol('invalid-json');

/** The request body as JSON, or INVALID_JSON when it is not parseable. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}

export function invalidJsonResponse(): Response {
  return Response.json(
    { error: 'INVALID_JSON', issues: [{ path: '(root)', message: 'Body is not JSON' }] },
    { status: 400 },
  );
}
