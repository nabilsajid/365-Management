import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { leaveDecision } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteParams = { params: Promise<{ id: string }> };

// An admin or HR (who edits Employees & Rewards) approves or denies a leave request; the person is notified.
// HR cannot decide their own request.
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const admin = ctx.profile.access_role === 'admin';
  if (!admin && !(ctx.editSegments ?? ctx.segments).has('team_points')) return fail(403, 'Only an admin or HR decides leave.');
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
  if (!data) return fail(404, admin ? 'Not found.' : 'Not found, or it is your own request: an admin decides that one.');
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
