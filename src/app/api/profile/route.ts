import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { profileUpdate } from '@/lib/validation';

// A person's own profile, with the private details only they and admins can see.
export async function GET(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const { data, error } = await ctx.supabase
    .from('profile_private')
    .select('address, secondary_contact')
    .eq('profile_id', ctx.userId)
    .maybeSingle();
  if (error) return fromDbError(error);
  return ok({ ...ctx.profile, address: data?.address ?? null, secondary_contact: data?.secondary_contact ?? null });
}

// Fill in or change your own profile. The database function touches only these
// fields, so nobody can change their own roles or access this way.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, profileUpdate);
  if (body.response) return body.response;

  const { error } = await ctx.supabase.rpc('update_my_profile', {
    p_full_name: body.data.full_name,
    p_nickname: body.data.nickname ?? null,
    p_contact: body.data.contact,
    p_address: body.data.address ?? null,
    p_secondary_contact: body.data.secondary_contact ?? null,
  });
  if (error) return fromDbError(error);
  return ok({ saved: true });
}
