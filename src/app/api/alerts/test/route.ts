import { requireContext } from '@/lib/api/context';
import { fail, ok } from '@/lib/api/http';
import { companyMailAccount, emailConfigured, lastEmailError, sendEmail } from '@/lib/server/urgent-alerts';
import { createAdminClient } from '@/lib/supabase/admin';

// Admin: sends a test alert to your own email, to check the email setup works.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const admin = createAdminClient();
  const account = admin ? await companyMailAccount(admin, ctx.profile.org_id) : null;
  if (!account && !emailConfigured()) return fail(400, 'No email account is set up yet. Add one above.');
  const user = await ctx.supabase.auth.getUser();
  const email = user.data.user?.email;
  if (!email) return fail(400, 'Your account has no email address.');
  const sent = await sendEmail(email, [{ title: 'Test alert from UniDock', body: 'If you can read this, urgent alerts will reach your team by email.' }], new URL(request.url).origin, account);
  if (!sent) return fail(502, `The email was not sent: ${lastEmailError ?? 'unknown reason'}.`);
  return ok({ sentTo: email });
}
