import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { recallPassword, rememberPassword } from '@/lib/server/login-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { passwordSet } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An admin sets a new password for one person. It goes straight to Supabase
// Auth, which stores it encrypted; the app never stores or logs it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');

  const body = await readJson(request, passwordSet);
  if (body.response) return body.response;

  // Only people in the admin's own organization.
  const person = await ctx.supabase.from('profiles').select('id, org_id, access_role').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (person.error) return fromDbError(person.error);
  if (!person.data) return fail(404, 'Not found.');

  const admin = createAdminClient();
  if (!admin) return fail(501, 'Setting passwords needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  const changed = await admin.auth.admin.updateUserById(id, { password: body.data.password });
  if (changed.error) return fail(400, changed.error.message);

  await rememberPassword(ctx.supabase, person.data, body.data.password, ctx.userId);

  // Any forgotten-password request from this person is now answered.
  await ctx.supabase
    .from('password_requests')
    .update({ status: 'done', resolved_by: ctx.userId, resolved_at: new Date().toISOString() })
    .eq('org_id', ctx.profile.org_id)
    .eq('profile_id', id)
    .eq('status', 'pending');

  return ok({ saved: true });
}

// An admin looks up the password on record for one person. Only passwords an
// admin set through the app are on record; admin accounts never are.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  return ok({ password: await recallPassword(ctx.supabase, ctx.profile.org_id, id) });
}
