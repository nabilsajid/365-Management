import { requireContext } from '@/lib/api/context';
import { fail, ok } from '@/lib/api/http';
import { monthStart, parseMonth } from '@/lib/domain/points';
import { getMonthlySummary, getOrgTimezone, getPointRules } from '@/lib/services/rewards';

// Monthly standing: total, earned, deducted, distance to target and projected bonus.
// ?month=YYYY-MM selects an earlier month; the default is the current one.
export async function GET(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const orgId = ctx.profile.org_id;

  const requested = new URL(request.url).searchParams.get('month');
  const month = requested
    ? parseMonth(requested)
    : monthStart(new Date(), await getOrgTimezone(ctx.supabase, orgId));
  if (!month) return fail(400, 'month must look like YYYY-MM.');

  const rules = await getPointRules(ctx.supabase, orgId);
  let employees = await getMonthlySummary(ctx.supabase, orgId, month, rules);
  if (ctx.profile.access_role !== 'admin') {
    employees = employees.filter((row) => row.employee_id === ctx.userId);
  }
  return ok({ month, rules, employees });
}
