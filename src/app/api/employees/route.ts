import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeInvite } from '@/lib/validation';

export const GET = crud.collection(employees).GET;

// Admin invites a new person by email and gives them one or more roles.
// Supabase sends the invitation; the profile is created straight away.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, employeeInvite);
  if (body.response) return body.response;

  const admin = createAdminClient();
  if (!admin) {
    return fail(501, 'Inviting employees needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  }

  const invited = await admin.auth.admin.inviteUserByEmail(body.data.email);
  if (invited.error || !invited.data.user) {
    return fail(400, invited.error?.message ?? 'The invitation could not be sent.');
  }
  const userId = invited.data.user.id;

  const created = await admin
    .from('profiles')
    .insert({ id: userId, org_id: ctx.profile.org_id, full_name: body.data.full_name })
    .select('id')
    .single();
  if (created.error) {
    await admin.auth.admin.deleteUser(userId);
    return fromDbError(created.error);
  }

  const assigned = await ctx.supabase.rpc('set_profile_roles', { p_profile: userId, p_roles: body.data.role_ids });
  if (assigned.error) {
    await admin.auth.admin.deleteUser(userId);
    return fromDbError(assigned.error);
  }

  const { data, error } = await ctx.supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
