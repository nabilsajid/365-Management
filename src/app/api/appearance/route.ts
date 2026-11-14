import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { readAppearance } from '@/lib/domain/appearance';
import { appearanceUpdate } from '@/lib/validation';

// Admin: change how the app looks for everyone in the company.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, appearanceUpdate);
  if (body.response) return body.response;

  const current = await ctx.supabase.from('organizations').select('appearance').eq('id', ctx.profile.org_id).maybeSingle();
  if (current.error) {
    return fail(409, 'Appearance needs a database update first: run 20261112000024_appearance.sql in the Supabase SQL Editor.');
  }
  const next = readAppearance({ ...readAppearance(current.data?.appearance), ...body.data });

  const { data, error } = await ctx.supabase
    .from('organizations')
    .update({ appearance: next })
    .eq('id', ctx.profile.org_id)
    .select('appearance')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'Only an admin can change the appearance.');
  return ok(data.appearance);
}
