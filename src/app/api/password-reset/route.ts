import { fail, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { passwordReset } from '@/lib/validation';

// Public: the last step of an admin's emailed reset link. The link carries a
// short-lived token from Supabase Auth; it is checked with Supabase before the
// password changes. Only admins are ever emailed a link, and only admins may use one.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request, passwordReset);
  if (body.response) return body.response;

  const admin = createAdminClient();
  if (!admin) return fail(503, 'Password resets are not set up yet.');

  const expired = 'This reset link has expired or was already used. Ask for a new one from the sign-in page.';
  const verified = await admin.auth.getUser(body.data.access_token);
  const user = verified.data?.user;
  if (verified.error || !user) return fail(401, expired);

  const profile = await admin.from('profiles').select('access_role, is_active').eq('id', user.id).maybeSingle();
  if (!profile.data?.is_active || profile.data.access_role !== 'admin') return fail(403, 'Please ask your admin to set a new password for you.');

  const changed = await admin.auth.admin.updateUserById(user.id, { password: body.data.password });
  if (changed.error) return fail(400, changed.error.message);
  return ok({ saved: true });
}
