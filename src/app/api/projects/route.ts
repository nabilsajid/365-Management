import { crud, requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { projects } from '@/lib/api/resources';
import { createProjectWithDeliverables } from '@/lib/services/projects';
import { projectCreate } from '@/lib/validation';

export const GET = crud.collection(projects).GET;

// Client onboarding: a project with its brief and one task per deliverable.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, projectCreate);
  if (body.response) return body.response;

  const result = await createProjectWithDeliverables(ctx.supabase, ctx.profile.org_id, body.data);
  if (result.error) return fromDbError(result.error);
  return ok(result.data, 201);
}
