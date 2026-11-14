import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { orgRulesUpdate } from '@/lib/validation';

// Admin: company rules (the amount under which costs skip approval, and how long the delete log keeps entries).
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, orgRulesUpdate);
  if (body.response) return body.response;
  if (Object.keys(body.data).length === 0) return fail(400, 'Nothing to update.');
  const { data, error } = await ctx.supabase
    .from('organizations')
    .update(body.data)
    .eq('id', ctx.profile.org_id)
    .select('auto_approve_limit, delete_log_days')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'Only an admin can change the rules.');
  return ok(data);
}
