import { requireContext } from '@/lib/api/context';
import { fromDbError, ok } from '@/lib/api/http';

// Your own unread notifications, newest first. The installed app's service
// worker also calls this when a push arrives, to know what to show.
export async function GET(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from('notifications')
    .select('id, title, body, href, created_at')
    .eq('profile_id', ctx.userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return fromDbError(error);
  return ok(data);
}
