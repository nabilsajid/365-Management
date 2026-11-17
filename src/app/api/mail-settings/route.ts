import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { sendEmail, lastEmailError } from '@/lib/server/urgent-alerts';
import { MAIL_PROVIDERS, decryptSecret, encryptSecret } from '@/lib/server/smtp';
import { createAdminClient } from '@/lib/supabase/admin';

const mailSettings = z.object({
  provider: z.enum(['gmail', 'outlook', 'custom']),
  email: z.string().trim().email('Write a full email address.'),
  // Left empty when only the name changes: the saved password is kept.
  app_password: z.string().max(200).optional(),
  from_name: z.string().trim().max(80).nullish(),
  host: z.string().trim().max(200).optional(),
  port: z.coerce.number().refine((value) => value === 465 || value === 587, 'Use port 465 or 587.').optional(),
});

// Admin: the email account every alert in this company is sent from. The app
// password is checked by sending you a test email, then stored encrypted and
// never shown again.
export async function PUT(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, mailSettings);
  if (body.response) return body.response;
  const input = body.data;
  const admin = createAdminClient();
  if (!admin) return fail(501, 'This needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const orgId = ctx.profile.org_id;

  const server: { host: string; port: number } =
    input.provider === 'custom' ? { host: input.host ?? '', port: input.port ?? 465 } : MAIL_PROVIDERS[input.provider as 'gmail' | 'outlook'];
  if (server.host.length < 3) return fail(400, 'Write the mail server, for example smtp.gmail.com.');
  const existing = await admin.from('org_mail_settings').select('password_encrypted, username').eq('org_id', orgId).maybeSingle();
  const password = input.app_password?.replace(/\s+/g, '') || null;
  if (!password && !existing.data) return fail(400, 'Paste the app password.');

  const encrypted = password ? encryptSecret(password) : (existing.data as { password_encrypted: string }).password_encrypted;
  const row = {
    org_id: orgId,
    provider: input.provider,
    host: server.host,
    port: server.port,
    username: input.email,
    from_name: input.from_name || null,
    password_encrypted: encrypted,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  // Check it works before saving: send a test email to you.
  const user = await ctx.supabase.auth.getUser();
  const to = user.data.user?.email;
  if (!to) return fail(400, 'Your account has no email address to send the test to.');
  const sent = await sendEmail(
    to,
    [{ title: 'UniDock email is connected', body: `Alerts for your team will now come from ${input.email}.` }],
    new URL(request.url).origin,
    { host: row.host, port: row.port, username: row.username, fromName: row.from_name, password: decryptSecret(encrypted) },
  );
  if (!sent) {
    return fail(
      400,
      `Could not send with that account: ${lastEmailError ?? 'unknown reason'}. For Gmail, use an App password (not your normal password), with 2-Step Verification turned on.`,
    );
  }
  const { error } = await admin.from('org_mail_settings').upsert(row, { onConflict: 'org_id' });
  if (error) return fromDbError(error);
  return ok({ saved: true, testSentTo: to });
}

export async function DELETE(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const admin = createAdminClient();
  if (!admin) return fail(501, 'This needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const { error } = await admin.from('org_mail_settings').delete().eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ removed: true });
}
