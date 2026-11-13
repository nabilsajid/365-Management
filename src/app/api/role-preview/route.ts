import { z } from 'zod';
import { getApiContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';

const input = z.object({ role_id: z.string().uuid().nullable() });

// An admin looks at the app as another role, or goes back to being an admin.
// The database decides who may start one; leaving is always allowed.
export async function POST(request: Request): Promise<Response> {
  const ctx = await getApiContext();
  if (!ctx) return fail(401, 'Please sign in.');
  if (!ctx.realAdmin) return fail(403, 'Only an admin can do that.');

  const body = await readJson(request, input);
  if (body.response) return body.response;

  const { error } = body.data.role_id
    ? await ctx.supabase.rpc('start_role_preview', { p_role: body.data.role_id })
    : await ctx.supabase.rpc('stop_role_preview');
  if (error) return fromDbError(error);
  return ok({ previewing: Boolean(body.data.role_id) });
}
