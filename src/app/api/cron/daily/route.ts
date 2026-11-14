import { fail, ok } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { createAdminClient } from '@/lib/supabase/admin';

// Runs once a day (see vercel.json): opens the new month of monthly clients,
// reminds admins of overdue invoices (at most once a week each), and sends the
// deadline, shoot and equipment alerts.
// When CRON_SECRET is set, Vercel sends it and anyone else is turned away.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'Not allowed.');
  const admin = createAdminClient();
  if (!admin) return fail(503, 'The service key is not set.');
  const [projects, reminders, deadlines] = await Promise.all([
    admin.rpc('create_recurring_projects'),
    admin.rpc('remind_overdue_invoices'),
    // Due tomorrow, missed deadlines, unconfirmed shoots and late equipment.
    admin.rpc('notify_deadlines'),
  ]);
  await dispatchPushes();
  return ok({
    projects_created: projects.error ? null : projects.data,
    invoice_reminders: reminders.error ? null : reminders.data,
    deadline_alerts: deadlines.error ? null : deadlines.data,
    problems: [projects.error?.message, reminders.error?.message, deadlines.error?.message].filter(Boolean),
  });
}
