import { requireContext } from '@/lib/api/context';
import { fromDbError, ok } from '@/lib/api/http';

// Marks all of your own unread notifications as read.
export async function POST(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', ctx.userId)
    .is('read_at', null);
  if (error) return fromDbError(error);
  return ok({ read: true });
}
