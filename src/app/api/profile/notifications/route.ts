import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { notifyPrefs } from '@/lib/validation';

// A person chooses which kinds of notification they get.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const body = await readJson(request, notifyPrefs);
  if (body.response) return body.response;
  const { error } = await auth.ctx.supabase.rpc('set_my_notify_prefs', { p_prefs: body.data });
  if (error) return fromDbError(error);
  return ok(body.data);
}
