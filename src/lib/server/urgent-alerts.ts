import type { SupabaseClient } from '@supabase/supabase-js';
import { reminderSettings } from '@/lib/domain/sections';

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

async function sendEmail(to: string, lines: { title: string; body: string | null }[], appUrl: string): Promise<boolean> {
  const html = `<p>These need attention:</p><ul>${lines
    .map((line) => `<li><strong>${escape(line.title)}</strong>${line.body ? `<br>${escape(line.body)}` : ''}</li>`)
    .join('')}</ul><p><a href="${escape(appUrl)}">Open UniDock</a></p>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERT_FROM_EMAIL,
        to: [to],
        subject: lines.length === 1 ? lines[0]!.title : `${lines.length} things need attention`,
        html,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

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
  if (!emailConfigured() && !whatsappConfigured()) return 0;
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

    let reached = 0;
    const byPerson = new Map<string, typeof urgent>();
    for (const row of urgent) byPerson.set(row.profile_id, [...(byPerson.get(row.profile_id) ?? []), row]);
    for (const [profileId, rows] of byPerson) {
      const person = contact.get(profileId);
      if (wanted.has(rows[0]!.org_id) && person?.is_active) {
        let sent = false;
        if (emailConfigured()) {
          const user = await admin.auth.admin.getUserById(profileId);
          const email = user.data.user?.email;
          if (email) sent = (await sendEmail(email, rows, appUrl)) || sent;
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
