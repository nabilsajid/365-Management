import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

// Turns on the client review link for a project (reusing the earlier one, if any).
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const orgId = ctx.profile.org_id;
  const existing = await ctx.supabase.from('review_links').select('id').eq('project_id', id).eq('org_id', orgId).limit(1).maybeSingle();
  if (existing.error) return fromDbError(existing.error);
  const result = existing.data
    ? await ctx.supabase.from('review_links').update({ is_active: true }).eq('id', existing.data.id).select('token').single()
    : await ctx.supabase.from('review_links').insert({ org_id: orgId, project_id: id, created_by: ctx.userId }).select('token').single();
  if (result.error) return fromDbError(result.error);
  return ok(result.data, 201);
}

// Turns the link off. A new link is made if "Make a new link" is used.
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const renew = new URL(request.url).searchParams.has('renew');
  const query = ctx.supabase.from('review_links');
  const { error } = renew
    ? await query.delete().eq('project_id', id).eq('org_id', ctx.profile.org_id)
    : await query.update({ is_active: false }).eq('project_id', id).eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ done: true });
}
