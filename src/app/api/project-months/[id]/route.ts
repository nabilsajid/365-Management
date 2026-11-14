import { after } from 'next/server';
import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { monthUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Closes a month (everyone who worked on it is congratulated), reopens it, or saves a note.
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, monthUpdate);
  if (body.response) return body.response;
  const changes: Record<string, unknown> = { ...body.data };
  if (body.data.status) changes.closed_at = body.data.status === 'closed' ? new Date().toISOString() : null;
  const { data, error } = await ctx.supabase
    .from('project_months')
    .update(changes)
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  after(dispatchPushes);
  return ok(data);
}

// Admins only: remove a month with its deliverables (for one opened by mistake).
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  if (ctx.profile.access_role !== 'admin') return fail(403, 'Only an admin can remove a month.');
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase.from('project_months').delete().eq('id', id).eq('org_id', ctx.profile.org_id).select('id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok({ deleted: true });
}
