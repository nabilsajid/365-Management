import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { profileUpdate } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admins can correct anyone's profile, including the private details.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');

  const body = await readJson(request, profileUpdate);
  if (body.response) return body.response;
  const orgId = ctx.profile.org_id;

  const { data, error } = await ctx.supabase
    .from('profiles')
    .update({ full_name: body.data.full_name, nickname: body.data.nickname || null, contact: body.data.contact })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');

  const { error: privateError } = await ctx.supabase.from('profile_private').upsert(
    {
      profile_id: id,
      org_id: orgId,
      address: body.data.address || null,
      secondary_contact: body.data.secondary_contact || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' },
  );
  if (privateError) return fromDbError(privateError);
  return ok({ saved: true });
}
