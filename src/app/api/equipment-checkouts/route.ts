import { after } from 'next/server';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { dispatchPushes } from '@/lib/server/push';
import { checkoutCreate } from '@/lib/validation';

// Anyone asks to take an item for themselves; it waits for approval. An admin
// records a checkout for anyone, and it is handed over straight away.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, checkoutCreate);
  if (body.response) return body.response;
  const holderId = body.data.holder_id;
  const fields: Record<string, unknown> = { ...body.data };
  delete fields.holder_id;
  delete fields.take_now;
  const admin = ctx.profile.access_role === 'admin';
  // Only an admin chooses who takes an item; everyone else takes it for themselves.
  if (holderId && holderId !== ctx.userId && !admin) return fail(403, 'Only an admin can choose who takes an item.');
  // An admin's checkout is handed over straight away; everyone else's waits for approval.
  const takeNow = admin;
  const now = new Date().toISOString();
  const row = {
    ...fields,
    start_date: body.data.start_date ?? undefined,
    org_id: ctx.profile.org_id,
    holder_id: admin && holderId ? holderId : ctx.userId,
    requested_by: ctx.userId,
    status: takeNow ? 'out' : 'requested',
    ...(takeNow ? { taken_at: now, decided_by: ctx.userId } : {}),
  };
  const { data, error } = await ctx.supabase.from('equipment_checkouts').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') return fail(409, 'That item is already out (every one of it). Mark one returned first.');
    return fromDbError(error);
  }
  after(dispatchPushes);
  return ok(data, 201);
}
