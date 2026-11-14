import { requireContext } from '@/lib/api/context';
import { fromDbError, ok } from '@/lib/api/http';

// The welcome pop-up was answered: it does not show again.
export async function POST(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { error } = await auth.ctx.supabase.rpc('mark_guide_seen');
  if (error) return fromDbError(error);
  return ok({ seen: true });
}
