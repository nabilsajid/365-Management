import { requireContext } from '@/lib/api/context';
import { ok } from '@/lib/api/http';
import { getDashboard } from '@/lib/services/dashboard';
import { getOrgTimezone } from '@/lib/services/rewards';

export async function GET(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const timeZone = await getOrgTimezone(ctx.supabase, ctx.profile.org_id);
  return ok(await getDashboard(ctx.supabase, ctx.profile.org_id, timeZone, ctx.userId));
}
