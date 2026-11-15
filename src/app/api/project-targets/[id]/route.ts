import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { fixedDeliverableUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, fixedDeliverableUpdate);
  if (body.response) return body.response;
  const changes = { ...body.data, ...('label' in body.data ? { label: body.data.label || null } : {}) };
  const { data, error } = await ctx.supabase.from('project_targets').update(changes).eq('id', id).eq('org_id', ctx.profile.org_id).select('*').maybeSingle();
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
  const { data, error } = await ctx.supabase.from('project_targets').delete().eq('id', id).eq('org_id', ctx.profile.org_id).select('id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok({ deleted: true });
}
