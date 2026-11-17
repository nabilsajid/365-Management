import { requireContext } from '@/lib/api/context';
import { fail, ok } from '@/lib/api/http';
import { emailConfigured, lastEmailError, sendEmail } from '@/lib/server/urgent-alerts';

// Admin: sends a test alert to your own email, to check the email setup works.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  if (!process.env.RESEND_API_KEY) return fail(400, 'RESEND_API_KEY is not set on the server yet.');
  if (!process.env.ALERT_FROM_EMAIL) return fail(400, 'ALERT_FROM_EMAIL is not set on the server yet (the address alerts come from).');
  if (!emailConfigured()) return fail(400, 'Email is not set up yet.');
  const user = await ctx.supabase.auth.getUser();
  const email = user.data.user?.email;
  if (!email) return fail(400, 'Your account has no email address.');
  const sent = await sendEmail(email, [{ title: 'Test alert from UniDock', body: 'If you can read this, urgent alerts will reach your team by email.' }], new URL(request.url).origin);
  if (!sent) return fail(502, `Resend did not send it: ${lastEmailError ?? 'unknown reason'}. Check that the sending domain is verified in Resend.`);
  return ok({ sentTo: email });
}
