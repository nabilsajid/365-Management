import { crud, requireContext } from '@/lib/api/context';
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
  if (!isAdmin && employeeId !== ctx.userId) {
    return fail(403, 'You can only mark your own attendance.');
  }
  const status = isAdmin ? (body.data.status ?? 'pending') : 'pending';

  const { data, error } = await ctx.supabase
    .from('attendance')
    .insert({
      org_id: ctx.profile.org_id,
      employee_id: employeeId,
      work_date: body.data.work_date,
      status,
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
