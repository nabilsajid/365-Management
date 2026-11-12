import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { pointSettingsUpdate } from '@/lib/validation';

export async function GET(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const { data, error } = await ctx.supabase
    .from('point_settings')
    .select('*')
    .eq('org_id', ctx.profile.org_id)
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Point settings are missing for this organization.');
  return ok(data);
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, pointSettingsUpdate);
  if (body.response) return body.response;
  if (Object.keys(body.data).length === 0) return fail(400, 'Nothing to update.');

  const { data, error } = await ctx.supabase
    .from('point_settings')
    .update(body.data)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Point settings are missing for this organization.');
  return ok(data);
}
