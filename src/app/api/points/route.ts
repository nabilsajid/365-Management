import { crud, requireWriter } from '@/lib/api/context';
import { proposeChange } from '@/lib/api/crud';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { pointEntries } from '@/lib/api/resources';
import { monthStart, parseMonth } from '@/lib/domain/points';
import { getOrgTimezone } from '@/lib/services/rewards';
import { pointEntryCreate } from '@/lib/validation';

export const GET = crud.collection(pointEntries).GET;

// Records a documented deduction (violation) or a manual adjustment. An admin's
// entry applies at once; one from a role with team points goes to an admin for
// approval. Deductions only change points; they never touch salary.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['team_points']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  const orgId = ctx.profile.org_id;

  const body = await readJson(request, pointEntryCreate);
  if (body.response) return body.response;
  const input = body.data;

  if (mode === 'propose') {
    // Only an admin decides points, and nobody can put forward points for themselves.
    if (input.employee_id === ctx.userId) return fail(403, 'You cannot give or deduct your own points.');
    const person = await ctx.supabase.from('profiles').select('full_name').eq('id', input.employee_id).eq('org_id', orgId).maybeSingle();
    if (!person.data) return fail(400, 'That employee does not exist.');
    const name = person.data.full_name as string;
    const amount = Math.abs(input.points ?? 0).toLocaleString('en-US');
    const summary =
      input.source === 'violation'
        ? `Deduct ${input.points ? `${amount} points` : 'points'} from ${name}: ${input.reason}`
        : (input.points ?? 0) > 0
          ? `Give ${amount} points to ${name}: ${input.reason}`
          : `Take ${amount} points from ${name}: ${input.reason}`;
    return proposeChange(ctx, request, input, summary);
  }

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
