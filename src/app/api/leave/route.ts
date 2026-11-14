import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { leaveCreate } from '@/lib/validation';

// Anyone asks for leave for themselves; admins are notified and decide.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, leaveCreate);
  if (body.response) return body.response;
  const { data, error } = await ctx.supabase
    .from('leave_requests')
    .insert({ org_id: ctx.profile.org_id, employee_id: ctx.userId, ...body.data })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
