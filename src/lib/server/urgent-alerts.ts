import type { SupabaseClient } from '@supabase/supabase-js';
import { reminderSettings } from '@/lib/domain/sections';
import { decryptSecret, sendSmtp, type MailAccount } from './smtp';

// Urgent alerts also go out by email and, when set up, WhatsApp, because phone
// notifications are easy to miss. No extra library: both are plain HTTPS calls.
//   Email:    RESEND_API_KEY and ALERT_FROM_EMAIL (an address on a domain verified in Resend).
//   WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TEMPLATE (an approved
//             template with one text variable), sent to the number on each person's profile.

/** The alerts that count as urgent. */
export const URGENT_PREFIXES = ['Deadline missed:', 'Project past its due date:', 'Shoot not confirmed:', 'Equipment overdue:', 'Please return:', 'Invoice overdue:'];

export function isUrgent(title: string): boolean {
  return URGENT_PREFIXES.some((prefix) => title.startsWith(prefix));
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE);
}

/** A Bangladeshi mobile number (01XXXXXXXXX) in international form, or null. */
export function whatsappNumber(contact: string | null | undefined): string | null {
  const digits = (contact ?? '').replace(/\D/g, '');
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return digits;
  return null;
}

const escape = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** The mailbox a company set in Settings → Reminders, with its password decrypted for sending. */
export async function companyMailAccount(admin: SupabaseClient, orgId: string): Promise<MailAccount | null> {
  const { data } = await admin.from('org_mail_settings').select('host, port, username, from_name, password_encrypted').eq('org_id', orgId).maybeSingle();
  if (!data) return null;
  const row = data as { host: string; port: number; username: string; from_name: string | null; password_encrypted: string };
  try {
    return { host: row.host, port: row.port, username: row.username, fromName: row.from_name, password: decryptSecret(row.password_encrypted) };
  } catch {
    return null;
  }
}

export async function sendEmail(
  to: string,
  lines: { title: string; body: string | null }[],
  appUrl: string,
  account?: MailAccount | null,
): Promise<boolean> {
  const html = `<p>These need attention:</p><ul>${lines
    .map((line) => `<li><strong>${escape(line.title)}</strong>${line.body ? `<br>${escape(line.body)}` : ''}</li>`)
    .join('')}</ul><p><a href="${escape(appUrl)}">Open UniDock</a></p>`;
  const subject = lines.length === 1 ? lines[0]!.title : `${lines.length} things need attention`;
  // The company's own mailbox comes first; Resend (set on the server) is the fallback.
  if (account) {
    const text = `These need attention:\n\n${lines.map((line) => `- ${line.title}${line.body ? `\n  ${line.body}` : ''}`).join('\n')}\n\nOpen UniDock: ${appUrl}`;
    try {
      await sendSmtp(account, to, subject, text, html);
      lastEmailError = null;
      return true;
    } catch (reason) {
      lastEmailError = (reason as Error).message;
      return false;
    }
  }
  if (!emailConfigured()) {
    lastEmailError = 'No email account is set up.';
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERT_FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });
    if (!response.ok) lastEmailError = ((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? `Resend answered ${response.status}`;
    return response.ok;
  } catch {
    lastEmailError = 'Could not reach Resend.';
    return false;
  }
}

/** Why the last email failed, as Resend explained it (never includes the key). */
export let lastEmailError: string | null = null;

async function sendWhatsapp(number: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: number,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 900) }] }],
        },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sends each person one email (and WhatsApp message) listing their new urgent
 * alerts from the last two days, then marks them sent. Companies can switch
 * this off in Settings → Reminders. Never throws; returns how many people were reached.
 */
export async function dispatchUrgentAlerts(admin: SupabaseClient, appUrl: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from('notifications')
      .select('id, org_id, profile_id, title, body')
      .is('emailed_at', null)
      .gte('created_at', since)
      .limit(500);
    if (error) return 0;
    const urgent = ((data ?? []) as { id: string; org_id: string; profile_id: string; title: string; body: string | null }[]).filter((row) => isUrgent(row.title));
    if (urgent.length === 0) return 0;

    const orgs = await admin.from('organizations').select('id, settings').in('id', [...new Set(urgent.map((row) => row.org_id))]);
    const wanted = new Set(
      ((orgs.data ?? []) as { id: string; settings: unknown }[]).filter((org) => reminderSettings(org.settings).email).map((org) => org.id),
    );
    const people = await admin.from('profiles').select('id, contact, is_active').in('id', [...new Set(urgent.map((row) => row.profile_id))]);
    const contact = new Map(((people.data ?? []) as { id: string; contact: string | null; is_active: boolean }[]).map((row) => [row.id, row]));

    // Each company's own mailbox, if it set one.
    const accounts = new Map<string, MailAccount | null>();
    for (const orgId of wanted) accounts.set(orgId, await companyMailAccount(admin, orgId));

    let reached = 0;
    const byPerson = new Map<string, typeof urgent>();
    for (const row of urgent) byPerson.set(row.profile_id, [...(byPerson.get(row.profile_id) ?? []), row]);
    for (const [profileId, rows] of byPerson) {
      const person = contact.get(profileId);
      if (wanted.has(rows[0]!.org_id) && person?.is_active) {
        let sent = false;
        const account = accounts.get(rows[0]!.org_id) ?? null;
        if (account || emailConfigured()) {
          const user = await admin.auth.admin.getUserById(profileId);
          const email = user.data.user?.email;
          if (email) sent = (await sendEmail(email, rows, appUrl, account)) || sent;
        }
        const number = whatsappNumber(person.contact);
        if (whatsappConfigured() && number) {
          sent = (await sendWhatsapp(number, rows.map((row) => row.title).join(' · '))) || sent;
        }
        if (sent) reached += 1;
      }
      // Marked either way, so a switched-off company or a person without an address is not retried every day.
      await admin.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', rows.map((row) => row.id));
    }
    return reached;
  } catch {
    return 0;
  }
}
