import { fail, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { passwordRequestCreate } from '@/lib/validation';

/** The most requests that may wait for one organization, so the form cannot be used to flood the admin. */
const MAX_PENDING = 50;

// Public: someone who cannot sign in asks the admin for a new password.
// An admin who forgot theirs is emailed a reset link instead.
// The answer is the same whether or not the email belongs to anyone, so the
// form cannot be used to find out who has an account.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request, passwordRequestCreate);
  if (body.response) return body.response;

  const admin = createAdminClient();
  if (!admin) return fail(503, 'Password requests are not set up yet. Please ask your admin directly.');

  const accepted = ok({ sent: true }, 202);

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = listed.data?.users.find((candidate) => candidate.email?.toLowerCase() === body.data.email);
  if (!user) return accepted;

  const profile = await admin.from('profiles').select('id, org_id, is_active, access_role').eq('id', user.id).maybeSingle();
  if (!profile.data || !profile.data.is_active) return accepted;

  // An admin has nobody to ask, so they get a verification email with a link
  // to choose a new password. Supabase Auth sends it and limits how often.
  if (profile.data.access_role === 'admin') {
    const sent = await admin.auth.resetPasswordForEmail(body.data.email, {
      redirectTo: `${new URL(request.url).origin}/auth/reset`,
    });
    if (sent.error) console.error('Password reset email was not sent:', sent.error.message);
    return accepted;
  }

  const pending = await admin
    .from('password_requests')
    .select('profile_id')
    .eq('org_id', profile.data.org_id)
    .eq('status', 'pending');
  const waiting = pending.data ?? [];
  // One open request per person is enough.
  if (waiting.some((row) => row.profile_id === user.id) || waiting.length >= MAX_PENDING) return accepted;

  await admin.from('password_requests').insert({ org_id: profile.data.org_id, profile_id: user.id, email: body.data.email });
  return accepted;
}
