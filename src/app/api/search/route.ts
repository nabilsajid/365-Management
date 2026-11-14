import { requireContext } from '@/lib/api/context';
import { ok } from '@/lib/api/http';
import { runSearch } from '@/lib/services/search';

// Suggestions while typing in the search box: a few of each kind.
export async function GET(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const text = new URL(request.url).searchParams.get('q') ?? '';
  const viewer = { isAdmin: ctx.profile.access_role === 'admin', segments: ctx.segments };
  const groups = await runSearch(ctx.supabase, ctx.profile.org_id, text, viewer, 4);
  return ok(groups);
}
