import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The assignee starts their own task: To do (or Changes requested) → In progress.
// Only that move, and only on their own task, so it needs no project editing access.
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const admin = createAdminClient();
  if (!admin) return fail(503, 'This needs the server key, which is not set up.');
  const { data, error } = await admin
    .from('tasks')
    .update({ status: 'in_progress' })
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .eq('assignee_id', ctx.userId)
    .in('status', ['todo', 'changes_requested'])
    .select('id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Only the person assigned can start this task, and only from To do.');
  return ok({ started: true });
}
