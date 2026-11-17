import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

// Moves every completed project (one-time or monthly) off the board in one go: they become
// "archived" (hidden), still found by search, in the list view and with "Show hidden".
export async function POST(): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  if (mode !== 'apply') return fail(403, 'Only an admin or a project editor hides projects.');
  const { data, error } = await ctx.supabase
    .from('projects')
    .update({ status: 'archived' })
    .eq('org_id', ctx.profile.org_id)
    .eq('status', 'completed')
    .select('id');
  if (error) return fromDbError(error);
  return ok({ hidden: (data ?? []).length });
}
