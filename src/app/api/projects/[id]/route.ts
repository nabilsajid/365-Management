import { crud, requireWriter } from '@/lib/api/context';
import { describeRecord, proposeChange, summarize } from '@/lib/api/crud';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { projects } from '@/lib/api/resources';
import { resolveClient } from '@/lib/services/projects';
import { projectUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };

const handlers = crud.item(projects);

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;

// Admin edits a project: its details, links, client (by name) and team.
export async function PATCH(request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  const orgId = ctx.profile.org_id;
  const { id } = await route.params;

  const body = await readJson(request, projectUpdate);
  if (body.response) return body.response;
  const { member_ids: memberIds, client_name: clientName, ...fields } = body.data;
  if (Object.keys(body.data).length === 0) return fail(400, 'Nothing to update.');

  const existing = await ctx.supabase.from('projects').select('id, name').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (existing.error) return fromDbError(existing.error);
  if (!existing.data) return fail(404, 'Not found.');

  if (mode === 'propose') {
    return proposeChange(ctx, request, body.data, summarize('Change', 'project', describeRecord(existing.data), fields));
  }

  const changes: Record<string, unknown> = { ...fields };
  if (clientName !== undefined) {
    const client = await resolveClient(ctx.supabase, orgId, clientName);
    if (client.error) return fromDbError(client.error);
    changes.client_id = client.data;
  }
  if (Object.keys(changes).length > 0) {
    const updated = await ctx.supabase.from('projects').update(changes).eq('id', id).eq('org_id', orgId);
    if (updated.error) return fromDbError(updated.error);
  }
  if (memberIds !== undefined) {
    const team = await ctx.supabase.rpc('set_project_members', { p_project: id, p_members: memberIds });
    if (team.error) return fromDbError(team.error);
  }

  const { data, error } = await ctx.supabase.from('projects').select('*').eq('id', id).single();
  if (error) return fromDbError(error);
  return ok(data);
}
