import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { projectCommentCreate } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Anyone in the organization comments on a task, as themselves. Writing
// @Name notifies that person; the assignee is told about every new comment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, projectCommentCreate);
  if (body.response) return body.response;
  const { data, error } = await ctx.supabase
    .from('task_comments')
    .insert({ org_id: ctx.profile.org_id, task_id: id, author_id: ctx.userId, body: body.data.body })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
