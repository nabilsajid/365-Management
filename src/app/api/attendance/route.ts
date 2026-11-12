import { crud, requireContext } from '@/lib/api/context';
import { proposeChange } from '@/lib/api/crud';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { attendance } from '@/lib/api/resources';
import { attendanceCreate } from '@/lib/validation';

export const GET = crud.collection(attendance).GET;

// Employees mark their own office day as pending. Only an admin can record a
// day for someone else or mark it verified, which is what earns the points.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, attendanceCreate);
  if (body.response) return body.response;

  const isAdmin = ctx.profile.access_role === 'admin';
  const employeeId = body.data.employee_id ?? ctx.userId;
  const wantsStatus = body.data.status ?? 'pending';

  // Recording a day for someone else, or as already verified, is an admin's
  // call. A role with team points can ask for it; an admin then approves.
  if (!isAdmin && (employeeId !== ctx.userId || wantsStatus !== 'pending')) {
    if (!ctx.segments.has('team_points')) {
      if (employeeId !== ctx.userId) return fail(403, 'You can only mark your own attendance.');
    } else {
      const person = await ctx.supabase.from('profiles').select('full_name').eq('id', employeeId).eq('org_id', ctx.profile.org_id).maybeSingle();
      if (!person.data) return fail(400, 'That employee does not exist.');
      return proposeChange(
        ctx,
        request,
        { ...body.data, employee_id: employeeId },
        `Record attendance for ${person.data.full_name} on ${body.data.work_date} as ${wantsStatus}`,
      );
    }
  }
  const status = isAdmin ? wantsStatus : 'pending';

  // People marking their own day must say when they arrived and left.
  if (!isAdmin && (!body.data.check_in || !body.data.check_out)) {
    return fail(400, 'Enter both your entry time and your exit time.');
  }

  const { data, error } = await ctx.supabase
    .from('attendance')
    .insert({
      org_id: ctx.profile.org_id,
      employee_id: employeeId,
      work_date: body.data.work_date,
      status,
      check_in: body.data.check_in ?? null,
      check_out: body.data.check_out ?? null,
      note: body.data.note ?? null,
      verified_by: status === 'verified' ? ctx.userId : null,
      verified_at: status === 'verified' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return fail(409, 'Attendance for that day is already recorded.');
    return fromDbError(error);
  }
  return ok(data, 201);
}
