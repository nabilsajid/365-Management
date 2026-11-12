import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { accessForRole } from '@/lib/domain/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeInvite } from '@/lib/validation';

export const GET = crud.collection(employees).GET;

// Admin invites a new employee by email. Supabase sends the invitation; the
// profile with the job role is created straight away, and access follows the role.
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

  const { data, error } = await admin
    .from('profiles')
    .insert({
      id: invited.data.user.id,
      org_id: ctx.profile.org_id,
      full_name: body.data.full_name,
      job_title: body.data.job_title,
      access_role: accessForRole(body.data.job_title),
    })
    .select('*')
    .single();
  if (error) {
    await admin.auth.admin.deleteUser(invited.data.user.id);
    return fromDbError(error);
  }
  return ok(data, 201);
}
