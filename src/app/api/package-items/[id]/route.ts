import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { packageItemUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Changes a package line. Months already opened keep their own deliverables.
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, packageItemUpdate);
  if (body.response) return body.response;
  if (Object.keys(body.data).length === 0) return fail(400, 'Nothing to update.');
  if (body.data.points_value !== undefined && ctx.profile.access_role !== 'admin') return fail(403, 'Only an admin sets points.');
  const { data, error } = await ctx.supabase
    .from('project_package_items')
    .update(body.data)
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok(data);
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase
    .from('project_package_items')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok({ deleted: true });
}
