import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { taskFileCreate } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Records a file the browser has just uploaded to the company's storage
// folder for this deliverable. The database checks the folder matches.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, taskFileCreate);
  if (body.response) return body.response;
  const orgId = ctx.profile.org_id;
  if (!body.data.path.startsWith(`${orgId}/${id}/`)) return fail(400, 'The file was not uploaded to this deliverable.');
  const { data, error } = await ctx.supabase
    .from('task_files')
    .insert({ org_id: orgId, task_id: id, uploaded_by: ctx.userId, ...body.data, content_type: body.data.content_type ?? null })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
