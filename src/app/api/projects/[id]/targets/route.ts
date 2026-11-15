import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { deliveryTargets } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sets a monthly client's targets, type by type. An empty number removes that
// target: the type is then only counted, with no fixed goal.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, deliveryTargets);
  if (body.response) return body.response;
  const orgId = ctx.profile.org_id;

  const project = await ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (project.error) return fromDbError(project.error);
  if (!project.data) return fail(404, 'Not found.');

  const entries = Object.entries(body.data.targets);
  const keep = entries.filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  const clear = entries.filter(([, quantity]) => quantity === null).map(([kind]) => kind);
  if (clear.length > 0) {
    const removed = await ctx.supabase.from('project_targets').delete().eq('project_id', id).eq('org_id', orgId).in('kind', clear);
    if (removed.error) return fromDbError(removed.error);
  }
  if (keep.length > 0) {
    const saved = await ctx.supabase
      .from('project_targets')
      .upsert(keep.map(([kind, quantity]) => ({ org_id: orgId, project_id: id, kind, quantity })), { onConflict: 'project_id,kind' });
    if (saved.error) return fromDbError(saved.error);
  }
  return ok({ saved: true });
}
