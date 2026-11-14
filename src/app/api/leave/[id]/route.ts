import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { leaveDecision } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteParams = { params: Promise<{ id: string }> };

// Admin approves or denies a leave request; the person is notified.
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, leaveDecision);
  if (body.response) return body.response;
  const { data, error } = await ctx.supabase
    .from('leave_requests')
    .update({ status: body.data.status, decided_by: ctx.userId, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok(data);
}

// The person withdraws their own request while it waits; admins can delete any.
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase.from('leave_requests').delete().eq('id', id).eq('org_id', ctx.profile.org_id).select('id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'Only a request that is still waiting can be withdrawn.');
  return ok({ deleted: true });
}
