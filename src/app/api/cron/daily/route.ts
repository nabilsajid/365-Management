import { fail, ok } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { createAdminClient } from '@/lib/supabase/admin';

// Runs once a day (see vercel.json): copies repeating projects at the start
// of a month and reminds admins of overdue invoices (at most once a week each).
// When CRON_SECRET is set, Vercel sends it and anyone else is turned away.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'Not allowed.');
  const admin = createAdminClient();
  if (!admin) return fail(503, 'The service key is not set.');
  const [projects, reminders] = await Promise.all([admin.rpc('create_recurring_projects'), admin.rpc('remind_overdue_invoices')]);
  await dispatchPushes();
  return ok({
    projects_created: projects.error ? null : projects.data,
    invoice_reminders: reminders.error ? null : reminders.data,
    problems: [projects.error?.message, reminders.error?.message].filter(Boolean),
  });
}
