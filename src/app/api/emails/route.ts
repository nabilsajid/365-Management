import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { companyMailAccount, lastEmailError, sendMessage } from '@/lib/server/urgent-alerts';
import { createAdminClient } from '@/lib/supabase/admin';

const newEmail = z.object({
  // People in the company, by id; "everyone" for the whole active team; and/or typed addresses (clients etc.).
  profile_ids: z.array(z.string().uuid()).max(200).default([]),
  everyone: z.boolean().optional(),
  client_ids: z.array(z.string().uuid()).max(200).default([]),
  addresses: z.array(z.string().trim().email('Check the email addresses.')).max(50).default([]),
  subject: z.string().trim().min(1, 'Write a subject.').max(200),
  body: z.string().trim().min(1, 'Write the message.').max(20000),
  // Send straight away (the approver writing it approves it), or keep it waiting for approval.
  send_now: z.boolean().default(false),
});

// An admin or email approver writes their own email to people in the team, the
// whole team, or any address. One email per person. Sent now, or kept as a
// draft on Email approvals.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  if (ctx.profile.access_role !== 'admin' && !ctx.segments.has('emails')) return fail(403, 'Only an admin or an email approver can write emails.');
  const body = await readJson(request, newEmail);
  if (body.response) return body.response;
  const input = body.data;
  const admin = createAdminClient();
  if (!admin) return fail(501, 'This needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const orgId = ctx.profile.org_id;

  // Who it goes to: chosen people (their login emails), or everyone active, plus typed addresses.
  const people = await admin.from('profiles').select('id, is_active').eq('org_id', orgId);
  const ids = input.everyone
    ? ((people.data ?? []) as { id: string; is_active: boolean }[]).filter((row) => row.is_active).map((row) => row.id)
    : input.profile_ids.filter((id) => ((people.data ?? []) as { id: string }[]).some((row) => row.id === id));
  const recipients: { profileId: string | null; email: string }[] = [];
  for (const id of ids) {
    const user = await admin.auth.admin.getUserById(id);
    if (user.data.user?.email) recipients.push({ profileId: id, email: user.data.user.email });
  }
  // Clients, by the email saved on them.
  if (input.client_ids.length > 0) {
    const clients = await admin.from('clients').select('email').eq('org_id', orgId).in('id', input.client_ids);
    for (const client of (clients.data ?? []) as { email: string | null }[]) {
      if (client.email && !recipients.some((row) => row.email.toLowerCase() === client.email!.toLowerCase())) recipients.push({ profileId: null, email: client.email });
    }
  }
  for (const address of input.addresses) if (!recipients.some((row) => row.email.toLowerCase() === address.toLowerCase())) recipients.push({ profileId: null, email: address });
  if (recipients.length === 0) return fail(400, 'Choose at least one person or client, or write an email address.');

  const account = input.send_now ? await companyMailAccount(admin, orgId) : null;
  const appUrl = new URL(request.url).origin;
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    let status: 'pending' | 'sent' | 'failed' = 'pending';
    let error: string | null = null;
    if (input.send_now) {
      const done = await sendMessage(recipient.email, input.subject, input.body, account, appUrl);
      status = done ? 'sent' : 'failed';
      error = done ? null : lastEmailError;
      if (done) sent += 1;
      else failed += 1;
    }
    const saved = await admin.from('email_outbox').insert({
      org_id: orgId,
      to_profile_id: recipient.profileId,
      to_email: recipient.email,
      kind: 'other',
      subject: input.subject,
      body: input.body,
      status,
      error,
      ...(input.send_now ? { decided_by: ctx.userId, decided_at: new Date().toISOString(), sent_at: status === 'sent' ? new Date().toISOString() : null } : {}),
    });
    if (saved.error) return fromDbError(saved.error);
  }
  if (!input.send_now) await admin.rpc('notify_email_approvers', { p_org: orgId, p_count: recipients.length });
  return ok({ recipients: recipients.length, sent, failed }, 201);
}
