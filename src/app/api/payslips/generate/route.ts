import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { unpaidLeaveDeduction } from '@/lib/domain/leave';
import { leaveDaysInMonth } from '@/lib/domain/payroll';

const generate = z.object({ month: z.string().regex(/^\d{4}-\d{2}-01$/, 'Pick a month.') });

// Admin: makes a draft payslip for everyone with a salary, for one month. Each
// one carries the salary, the approved bonus for that month, and for reference
// the days present, days on leave and points. Unpaid leave days are taken off
// (a day is the salary over 30), and so is the monthly instalment of any salary
// advance still being repaid. People who already have one are skipped.
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

  const [salaries, people, existing, bonuses, attendance, leave, points, advances] = await Promise.all([
    db.from('salaries').select('profile_id, monthly_amount').eq('org_id', orgId),
    db.from('profiles').select('id, is_active').eq('org_id', orgId),
    db.from('payslips').select('profile_id').eq('org_id', orgId).eq('month', month),
    db.from('bonuses').select('employee_id, amount').eq('org_id', orgId).eq('period_month', month).eq('status', 'approved'),
    db.from('attendance').select('employee_id').eq('org_id', orgId).eq('status', 'verified').gte('work_date', month).lt('work_date', until),
    db.from('leave_requests').select('employee_id, start_date, end_date, kind').eq('org_id', orgId).eq('status', 'approved').lt('start_date', until).gte('end_date', month),
    db.from('monthly_points').select('employee_id, total_points').eq('org_id', orgId).eq('period_month', month),
    db.from('salary_advances').select('id, profile_id, per_month, given_on').eq('org_id', orgId).order('given_on'),
  ]);
  type Leave = { employee_id: string; start_date: string; end_date: string; kind?: string | null };
  const leaveRows = (leave.data ?? []) as Leave[];
  // What is still owed on each advance (advances table missing → nothing to repay).
  const owed = new Map<string, number>();
  if (!advances.error && (advances.data ?? []).length > 0) {
    const { data: balances } = await db.from('advance_balances').select('advance_id, left_to_repay').eq('org_id', orgId);
    for (const row of (balances ?? []) as { advance_id: string; left_to_repay: number }[]) owed.set(row.advance_id, Number(row.left_to_repay));
  }
  const advanceRows = (advances.error ? [] : (advances.data ?? [])) as { id: string; profile_id: string; per_month: number }[];
  const repayments: { profile_id: string; advance_id: string; amount: number }[] = [];
  if (salaries.error) return fromDbError(salaries.error);
  const active = new Set(((people.data ?? []) as { id: string; is_active: boolean }[]).filter((row) => row.is_active).map((row) => row.id));
  const done = new Set(((existing.data ?? []) as { profile_id: string }[]).map((row) => row.profile_id));
  const rows = ((salaries.data ?? []) as { profile_id: string; monthly_amount: number }[])
    .filter((row) => active.has(row.profile_id) && !done.has(row.profile_id))
    .map((row) => {
      const own = leaveRows.filter((item) => item.employee_id === row.profile_id);
      const unpaidDays = leaveDaysInMonth(own.filter((item) => item.kind === 'unpaid'), month);
      const unpaid = unpaidLeaveDeduction(Number(row.monthly_amount), unpaidDays);
      // Take this month's instalment from each advance still owed, oldest first.
      let repaid = 0;
      for (const advance of advanceRows.filter((item) => item.profile_id === row.profile_id)) {
        const left = owed.get(advance.id) ?? 0;
        const take = Math.min(left, Number(advance.per_month));
        if (take > 0) {
          repayments.push({ profile_id: row.profile_id, advance_id: advance.id, amount: take });
          repaid += take;
        }
      }
      return {
      org_id: orgId,
      profile_id: row.profile_id,
      month,
      base_salary: Number(row.monthly_amount),
      unpaid_leave_days: unpaidDays,
      advance_repaid: Math.round(repaid * 100) / 100,
      deductions: Math.round((unpaid + repaid) * 100) / 100,
      bonus: ((bonuses.data ?? []) as { employee_id: string; amount: number }[])
        .filter((item) => item.employee_id === row.profile_id)
        .reduce((total, item) => total + Number(item.amount), 0),
      days_present: ((attendance.data ?? []) as { employee_id: string }[]).filter((item) => item.employee_id === row.profile_id).length,
      leave_days: leaveDaysInMonth(own, month),
      points: Number(((points.data ?? []) as { employee_id: string; total_points: number }[]).find((item) => item.employee_id === row.profile_id)?.total_points ?? 0),
      };
    });
  if (rows.length === 0) return fail(400, 'Everyone with a salary already has a payslip for this month, or no salaries are set yet.');
  const { data: made, error } = await db.from('payslips').insert(rows).select('id, profile_id');
  if (error) return fromDbError(error);
  if (repayments.length > 0) {
    const slipOf = new Map(((made ?? []) as { id: string; profile_id: string }[]).map((row) => [row.profile_id, row.id]));
    const { error: repayError } = await db.from('advance_repayments').insert(
      repayments.map((row) => ({ org_id: orgId, advance_id: row.advance_id, payslip_id: slipOf.get(row.profile_id), amount: row.amount })),
    );
    if (repayError) return fromDbError(repayError);
  }
  return ok({ created: rows.length }, 201);
}
