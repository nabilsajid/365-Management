import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { isReplayablePath } from '@/lib/domain/changes';
import { changeDecision } from '@/lib/validation';
import type { ChangeRequest } from '@/types/database';

type RouteParams = { params: Promise<{ id: string }> };

// Admin decides a change request. Approving replays the stored request as the
// admin, so it goes through exactly the same validation and rules as if the
// admin had made the change by hand. Denying only records the decision.
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;

  const body = await readJson(request, changeDecision);
  if (body.response) return body.response;

  const found = await ctx.supabase
    .from('change_requests')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .maybeSingle();
  if (found.error) return fromDbError(found.error);
  const change = found.data as ChangeRequest | null;
  if (!change) return fail(404, 'Not found.');
  if (change.status !== 'pending') return fail(409, `This request was already ${change.status}.`);

  if (body.data.decision === 'approve') {
    if (!isReplayablePath(change.path)) return fail(400, 'This request targets something that cannot be changed this way.');

    let applied: Response;
    try {
      applied = await fetch(new URL(change.path, request.url), {
        method: change.method,
        headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
        body: change.method === 'DELETE' ? undefined : JSON.stringify(change.body ?? {}),
        cache: 'no-store',
      });
    } catch {
      return fail(502, 'The change could not be applied right now. Try again.');
    }
    if (!applied.ok) {
      const problem = (await applied.json().catch(() => null)) as { error?: { message?: string } } | null;
      return fail(409, `The change could not be applied: ${problem?.error?.message ?? `error ${applied.status}`}. Deny it, or fix the cause and approve again.`);
    }
  }

  const { data, error } = await ctx.supabase
    .from('change_requests')
    .update({
      status: body.data.decision === 'approve' ? 'approved' : 'denied',
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
      decision_note: body.data.note ?? null,
    })
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data);
}
