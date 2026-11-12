import type { ZodTypeAny, z } from 'zod';

export function ok(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

export function fail(status: number, message: string, details?: unknown): Response {
  return Response.json({ error: { message, details } }, { status });
}

/** Parses and validates a JSON request body. */
export async function readJson<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S>; response?: undefined } | { data?: undefined; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: fail(400, 'The request body must be valid JSON.') };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    const first = details[0];
    const message = first ? (first.field ? `${first.field}: ${first.message}` : first.message) : 'Invalid input.';
    return { response: fail(400, message, details) };
  }
  return { data: parsed.data };
}

/** Maps a Postgres/PostgREST error to an HTTP response. */
export function fromDbError(error: { code?: string; message: string }): Response {
  switch (error.code) {
    case '23505':
      return fail(409, 'That record already exists.');
    case '23503':
      return fail(409, 'This record is linked to other records, or refers to one that does not exist.');
    case '23514':
    case '23502':
    case '22P02':
    case '22023':
      return fail(400, error.message);
    case '42501':
      return fail(403, 'You do not have permission to do that.');
    case 'PGRST116':
      return fail(404, 'Not found.');
    default:
      return fail(500, error.message || 'Unexpected database error.');
  }
}
