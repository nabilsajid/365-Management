import { after } from 'next/server';
import { requireContext } from '@/lib/api/context';
import { managesEquipment } from '@/lib/api/equipment';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { checkoutCreate } from '@/lib/validation';

// Anyone asks to take an item for themselves; it waits for approval. People who
// manage equipment can record that they took it now; only an admin can record it
// for someone else.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, checkoutCreate);
  if (body.response) return body.response;
  const { take_now: takeNow, holder_id: holderId, ...fields } = body.data;
  const manager = managesEquipment(ctx);
  const admin = ctx.profile.access_role === 'admin';
  // Only an admin chooses who takes an item; everyone else takes it for themselves.
  if (holderId && holderId !== ctx.userId && !admin) return fail(403, 'Only an admin can choose who takes an item.');
  if (!manager && takeNow) return fail(403, 'Ask for it here; someone who manages equipment approves it.');
  const now = new Date().toISOString();
  const row = {
    ...fields,
    start_date: fields.start_date ?? undefined,
    org_id: ctx.profile.org_id,
    holder_id: admin && holderId ? holderId : ctx.userId,
    requested_by: ctx.userId,
    status: manager && takeNow ? 'out' : 'requested',
    ...(manager && takeNow ? { taken_at: now, decided_by: ctx.userId } : {}),
  };
  const { data, error } = await ctx.supabase.from('equipment_checkouts').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') return fail(409, 'That item is already out with someone. Mark it returned first.');
    return fromDbError(error);
  }
  after(dispatchPushes);
  return ok(data, 201);
}
