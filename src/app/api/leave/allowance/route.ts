import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { leaveAllowanceUpdate } from '@/lib/validation';

// Admin: how many casual and sick days everyone gets a year. Kept in the company settings.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, leaveAllowanceUpdate);
  if (body.response) return body.response;
  const current = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.profile.org_id).maybeSingle();
  if (current.error) return fromDbError(current.error);
  const settings = { ...((current.data?.settings as Record<string, unknown> | null) ?? {}), leave_allowance: body.data };
  const { data, error } = await ctx.supabase.from('organizations').update({ settings }).eq('id', ctx.profile.org_id).select('id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'Only an admin can change the leave allowance.');
  return ok(body.data);
}
