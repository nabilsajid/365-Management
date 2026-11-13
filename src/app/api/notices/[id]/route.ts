import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { notices } from '@/lib/api/resources';
import { noticeExpiry } from '@/lib/domain/notices';
import { noticeUpdate } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const handlers = crud.item(notices);

export const GET = handlers.GET;
// Deleting is how an "until deleted" notice comes down. Admins only.
export const DELETE = handlers.DELETE;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');

  const body = await readJson(request, noticeUpdate);
  if (body.response) return body.response;
  const { duration, ...fields } = body.data;

  const changes: Record<string, unknown> = { ...fields };
  if ('body' in fields) changes.body = fields.body || null;
  // A new duration restarts the clock from now.
  if (duration) changes.expires_at = noticeExpiry(duration, new Date());
  if (Object.keys(changes).length === 0) return fail(400, 'Nothing to update.');

  const { data, error } = await ctx.supabase
    .from('notices')
    .update(changes)
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok(data);
}
