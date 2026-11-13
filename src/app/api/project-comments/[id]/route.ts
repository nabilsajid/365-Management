import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// People remove their own comments; admins remove any. Row level security decides.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');

  const { data, error } = await ctx.supabase
    .from('project_comments')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'You can only delete your own comments.');
  return ok({ deleted: true });
}
