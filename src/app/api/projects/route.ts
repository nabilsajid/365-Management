import { crud, requireWriter } from '@/lib/api/context';
import { proposeChange, summarize } from '@/lib/api/crud';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { projects } from '@/lib/api/resources';
import { createProjectWithDeliverables } from '@/lib/services/projects';
import { projectCreate } from '@/lib/validation';

export const GET = crud.collection(projects).GET;

// Adds a project with its brief, links and team, plus one task per deliverable if any are given.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;

  const body = await readJson(request, projectCreate);
  if (body.response) return body.response;

  if (mode === 'propose') {
    const { name, client_name: client, due_date: due } = body.data;
    return proposeChange(ctx, request, body.data, summarize('Add', 'project', name, { client, due_date: due }));
  }

  const result = await createProjectWithDeliverables(ctx.supabase, ctx.profile.org_id, body.data);
  if (result.error) return fromDbError(result.error);
  return ok(result.data, 201);
}
