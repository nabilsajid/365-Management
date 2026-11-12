import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { submissionCreate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from('task_submissions')
    .select('*')
    .eq('task_id', id)
    .eq('org_id', ctx.profile.org_id)
    .order('created_at', { ascending: false });
  if (error) return fromDbError(error);
  return ok(data);
}

// The assignee (or an admin) submits work as a Drive link, a Dropbox link or a text note.
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;

  const body = await readJson(request, submissionCreate);
  if (body.response) return body.response;

  const task = await ctx.supabase
    .from('tasks')
    .select('id, assignee_id')
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .maybeSingle();
  if (task.error) return fromDbError(task.error);
  if (!task.data) return fail(404, 'Task not found.');

  const isAdmin = ctx.profile.access_role === 'admin';
  if (!isAdmin && task.data.assignee_id !== ctx.userId) {
    return fail(403, 'Only the person assigned to this task can submit work for it.');
  }

  const { data, error } = await ctx.supabase
    .from('task_submissions')
    .insert({
      org_id: ctx.profile.org_id,
      task_id: id,
      submitted_by: ctx.userId,
      kind: body.data.kind,
      url: body.data.kind === 'text' ? null : body.data.url?.trim(),
      note: body.data.note ?? null,
    })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
