import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { leaveDaysInMonth } from '@/lib/domain/payroll';

const generate = z.object({ month: z.string().regex(/^\d{4}-\d{2}-01$/, 'Pick a month.') });

// Admin: makes a draft payslip for everyone with a salary, for one month. Each
// one carries the salary, the approved bonus for that month, and for reference
// the days present, days on leave and points. People who already have one are skipped.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, generate);
  if (body.response) return body.response;
  const { month } = body.data;
  const next = new Date(`${month}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const until = next.toISOString().slice(0, 10);
  const orgId = ctx.profile.org_id;
  const db = ctx.supabase;

  const [salaries, people, existing, bonuses, attendance, leave, points] = await Promise.all([
    db.from('salaries').select('profile_id, monthly_amount').eq('org_id', orgId),
    db.from('profiles').select('id, is_active').eq('org_id', orgId),
    db.from('payslips').select('profile_id').eq('org_id', orgId).eq('month', month),
    db.from('bonuses').select('employee_id, amount').eq('org_id', orgId).eq('period_month', month).eq('status', 'approved'),
    db.from('attendance').select('employee_id').eq('org_id', orgId).eq('status', 'verified').gte('work_date', month).lt('work_date', until),
    db.from('leave_requests').select('employee_id, start_date, end_date').eq('org_id', orgId).eq('status', 'approved').lt('start_date', until).gte('end_date', month),
    db.from('monthly_points').select('employee_id, total_points').eq('org_id', orgId).eq('period_month', month),
  ]);
  if (salaries.error) return fromDbError(salaries.error);
  const active = new Set(((people.data ?? []) as { id: string; is_active: boolean }[]).filter((row) => row.is_active).map((row) => row.id));
  const done = new Set(((existing.data ?? []) as { profile_id: string }[]).map((row) => row.profile_id));
  const rows = ((salaries.data ?? []) as { profile_id: string; monthly_amount: number }[])
    .filter((row) => active.has(row.profile_id) && !done.has(row.profile_id))
    .map((row) => ({
      org_id: orgId,
      profile_id: row.profile_id,
      month,
      base_salary: Number(row.monthly_amount),
      bonus: ((bonuses.data ?? []) as { employee_id: string; amount: number }[])
        .filter((item) => item.employee_id === row.profile_id)
        .reduce((total, item) => total + Number(item.amount), 0),
      days_present: ((attendance.data ?? []) as { employee_id: string }[]).filter((item) => item.employee_id === row.profile_id).length,
      leave_days: leaveDaysInMonth(((leave.data ?? []) as { employee_id: string; start_date: string; end_date: string }[]).filter((item) => item.employee_id === row.profile_id), month),
      points: Number(((points.data ?? []) as { employee_id: string; total_points: number }[]).find((item) => item.employee_id === row.profile_id)?.total_points ?? 0),
    }));
  if (rows.length === 0) return fail(400, 'Everyone with a salary already has a payslip for this month, or no salaries are set yet.');
  const { error } = await db.from('payslips').insert(rows);
  if (error) return fromDbError(error);
  return ok({ created: rows.length }, 201);
}
