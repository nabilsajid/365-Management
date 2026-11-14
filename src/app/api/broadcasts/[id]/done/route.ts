import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The person a personal message was sent to marks it as done.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { error } = await auth.ctx.supabase.rpc('mark_message_done', { p_id: id });
  if (error) return fromDbError(error);
  return ok({ done: true });
}
