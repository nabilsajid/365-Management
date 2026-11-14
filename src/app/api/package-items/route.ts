import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { packageItemCreate } from '@/lib/validation';

// Adds a line to a monthly project's package. Admins and roles that edit
// projects change it directly; it applies from the next month opened.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, packageItemCreate);
  if (body.response) return body.response;
  // Points are an admin's decision.
  if (body.data.points_value != null && ctx.profile.access_role !== 'admin') return fail(403, 'Only an admin sets points.');
  const { data, error } = await ctx.supabase
    .from('project_package_items')
    .insert({ ...body.data, kind: body.data.kind ?? 'other', org_id: ctx.profile.org_id })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
