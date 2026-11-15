import { after } from 'next/server';
import { requireContext } from '@/lib/api/context';
import { managesEquipment } from '@/lib/api/equipment';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { checkoutAction } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Approve or decline a request, mark an item returned, or cancel your own request.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, checkoutAction);
  if (body.response) return body.response;
  const { action, note } = body.data;
  const manager = managesEquipment(ctx);

  const current = await ctx.supabase.from('equipment_checkouts').select('id, status, holder_id').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (current.error) return fromDbError(current.error);
  if (!current.data) return fail(404, 'Not found.');
  const row = current.data as { id: string; status: string; holder_id: string };

  // People handle their own: cancel a waiting request, or hand an item back.
  if (!manager) {
    if (row.holder_id !== ctx.userId || (action !== 'cancel' && action !== 'return')) return fail(403, 'Only someone who manages equipment can do that.');
    const { error } = await ctx.supabase.rpc('my_checkout_action', { p_id: id, p_action: action });
    if (error) return fromDbError(error);
    after(dispatchPushes);
    return ok({ done: true });
  }

  const now = new Date().toISOString();
  const changes: Record<string, unknown> =
    action === 'approve'
      ? { status: 'out', taken_at: now, decided_by: ctx.userId }
      : action === 'decline'
        ? { status: 'declined', decided_by: ctx.userId }
        : action === 'return'
          ? { status: 'returned', returned_at: now }
          : { status: 'cancelled' };
  const allowedFrom: Record<string, string[]> = { approve: ['requested'], decline: ['requested'], return: ['out'], cancel: ['requested'] };
  if (!allowedFrom[action].includes(row.status)) return fail(409, 'That cannot be done now. Reload the page.');
  if (note) changes.note = note;
  const { error } = await ctx.supabase.from('equipment_checkouts').update(changes).eq('id', id).eq('org_id', ctx.profile.org_id);
  if (error) {
    if (error.code === '23505') return fail(409, 'That item is already out (every one of it). Mark one returned first.');
    return fromDbError(error);
  }
  after(dispatchPushes);
  return ok({ done: true });
}
