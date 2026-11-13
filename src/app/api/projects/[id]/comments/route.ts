import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { projectCommentCreate } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase
    .from('project_comments')
    .select('*')
    .eq('org_id', ctx.profile.org_id)
    .eq('project_id', id)
    .order('created_at');
  if (error) return fromDbError(error);
  return ok(data);
}

// Anyone in the organization can comment on any project, as themselves.
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');

  const body = await readJson(request, projectCommentCreate);
  if (body.response) return body.response;

  const project = await ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (!project.data) return fail(404, 'Not found.');

  const { data, error } = await ctx.supabase
    .from('project_comments')
    .insert({ org_id: ctx.profile.org_id, project_id: id, author_id: ctx.userId, body: body.data.body })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
