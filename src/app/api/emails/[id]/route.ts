import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { companyMailAccount, lastEmailError, sendMessage, sendWhatsappAlert } from '@/lib/server/urgent-alerts';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decision = z.object({
  action: z.enum(['send', 'reject']),
  subject: z.string().trim().min(1, 'Write a subject.').max(200).optional(),
  body: z.string().trim().min(1, 'Write the message.').max(20000).optional(),
});

// An admin, or someone whose role allows approving emails, sends a waiting
// email (after any changes to its subject and message) or decides not to.
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  if (ctx.profile.access_role !== 'admin' && !ctx.segments.has('emails')) return fail(403, 'Only an admin or an email approver can do this.');
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, decision);
  if (body.response) return body.response;
  const { action, subject, body: text } = body.data;

  const current = await ctx.supabase.from('email_outbox').select('*').eq('id', id).in('status', ['pending', 'failed']).maybeSingle();
  if (current.error) return fromDbError(current.error);
  if (!current.data) return fail(404, 'This email was already handled.');
  const email = current.data as { org_id: string; to_email: string; to_profile_id: string | null; subject: string; body: string; kind: string };
  const decided = { decided_by: ctx.userId, decided_at: new Date().toISOString() };

  if (action === 'reject') {
    const { error } = await ctx.supabase.from('email_outbox').update({ ...decided, status: 'rejected', subject: subject ?? email.subject, body: text ?? email.body }).eq('id', id);
    if (error) return fromDbError(error);
    return ok({ status: 'rejected' });
  }

  const admin = createAdminClient();
  const account = admin ? await companyMailAccount(admin, email.org_id) : null;
  const finalSubject = subject ?? email.subject;
  const finalBody = text ?? email.body;
  const sent = await sendMessage(email.to_email, finalSubject, finalBody, account, new URL(request.url).origin);
  // The person's WhatsApp too, for alerts, when WhatsApp is set up.
  if (sent && email.kind === 'alert' && admin && email.to_profile_id) {
    const person = await admin.from('profiles').select('contact').eq('id', email.to_profile_id).maybeSingle();
    await sendWhatsappAlert((person.data as { contact?: string | null } | null)?.contact, finalSubject);
  }
  const { error } = await ctx.supabase
    .from('email_outbox')
    .update({
      ...decided,
      subject: finalSubject,
      body: finalBody,
      status: sent ? 'sent' : 'failed',
      sent_at: sent ? new Date().toISOString() : null,
      error: sent ? null : lastEmailError,
    })
    .eq('id', id);
  if (error) return fromDbError(error);
  if (!sent) return fail(502, `Not sent: ${lastEmailError ?? 'unknown reason'}. It stays in the list as failed.`);
  return ok({ status: 'sent' });
}
