import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { pointEntries } from '@/lib/api/resources';
import { monthStart, parseMonth } from '@/lib/domain/points';
import { getOrgTimezone } from '@/lib/services/rewards';
import { pointEntryCreate } from '@/lib/validation';

export const GET = crud.collection(pointEntries).GET;

// Admin records a documented deduction (violation) or a manual adjustment.
// Deductions only change points; they never touch salary.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const orgId = ctx.profile.org_id;

  const body = await readJson(request, pointEntryCreate);
  if (body.response) return body.response;
  const input = body.data;

  const month = parseMonth(input.month) ?? monthStart(new Date(), await getOrgTimezone(ctx.supabase, orgId));

  let points = input.points ?? 0;
  if (input.source === 'violation') {
    let deduction = Math.abs(points);
    if (input.violation_type_id) {
      const type = await ctx.supabase
        .from('violation_types')
        .select('deduction_points')
        .eq('id', input.violation_type_id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (type.error) return fromDbError(type.error);
      if (!type.data) return fail(400, 'That violation type does not exist.');
      if (!deduction) deduction = type.data.deduction_points as number;
    }
    points = -deduction;
  }

  const { data, error } = await ctx.supabase
    .from('point_entries')
    .insert({
      org_id: orgId,
      employee_id: input.employee_id,
      period_month: month,
      points,
      source: input.source,
      violation_type_id: input.source === 'violation' ? (input.violation_type_id ?? null) : null,
      reason: input.reason,
      created_by: ctx.userId,
    })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
