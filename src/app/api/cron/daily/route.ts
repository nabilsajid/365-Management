import { fail, ok } from '@/lib/api/http';
import { weeklyBackups } from '@/lib/server/backups';
import { dispatchPushes } from '@/lib/server/push';
import { dispatchUrgentAlerts } from '@/lib/server/urgent-alerts';
import { createAdminClient } from '@/lib/supabase/admin';

// Runs once a day (see vercel.json): opens the new month of monthly clients,
// drafts their monthly invoices,
// reminds admins of overdue invoices (at most once a week each), and sends the
// deadline, shoot and equipment alerts. Also records automatic fixed costs and
// takes each company's weekly backup.
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
  // After the new months are open: draft this month's invoice for monthly clients with a fee.
  const drafted = await admin.rpc('draft_monthly_invoices');
  const recurring = await admin.rpc('record_fixed_expenses');
  await dispatchPushes();
  // Urgent ones also by email / WhatsApp, when set up.
  const emailed = await dispatchUrgentAlerts(admin, new URL(request.url).origin);
  const backups = await weeklyBackups(admin);
  return ok({
    urgent_alerts_sent: emailed,
    fixed_costs_recorded: recurring.error ? null : recurring.data,
    backups_taken: backups,
    invoices_drafted: drafted.error ? null : drafted.data,
    projects_created: projects.error ? null : projects.data,
    invoice_reminders: reminders.error ? null : reminders.data,
    deadline_alerts: deadlines.error ? null : deadlines.data,
    problems: [projects.error?.message, reminders.error?.message, deadlines.error?.message].filter(Boolean),
  });
}
