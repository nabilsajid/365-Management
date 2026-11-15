import { crud, requireWriter } from '@/lib/api/context';
import { proposeChange } from '@/lib/api/crud';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { investors } from '@/lib/api/resources';
import { investorReceive } from '@/lib/validation';

const handlers = crud.collection(investors);

export const GET = handlers.GET;

// Records money an investor put in. The investor is found by name, or added
// when new, so one form covers both. People who are not admins send it for approval.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['cashflow']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  const body = await readJson(request, investorReceive);
  if (body.response) return body.response;
  const input = body.data;
  if (mode === 'propose') {
    return proposeChange(ctx, request, input, `Record an investment of ${input.amount} from ${input.name}`);
  }
  const orgId = ctx.profile.org_id;

  const found = await ctx.supabase.from('investors').select('id, phone').eq('org_id', orgId).ilike('name', input.name.replace(/[%_\\]/g, '\\$&')).limit(1);
  if (found.error) return fromDbError(found.error);
  let investorId = (found.data?.[0] as { id: string; phone: string | null } | undefined)?.id;
  if (!investorId) {
    const created = await ctx.supabase.from('investors').insert({ org_id: orgId, name: input.name, phone: input.phone || null }).select('id').single();
    if (created.error) return fromDbError(created.error);
    investorId = created.data.id as string;
  } else if (input.phone && !(found.data?.[0] as { phone: string | null }).phone) {
    await ctx.supabase.from('investors').update({ phone: input.phone }).eq('id', investorId);
  }

  const requestedBy = ctx.profile.access_role === 'admin' ? request.headers.get('x-requested-by') : null;
  const saved = await ctx.supabase
    .from('investments')
    .insert({
      org_id: orgId,
      investor_id: investorId,
      account_id: input.account_id,
      amount: input.amount,
      received_on: input.received_on,
      note: input.note || null,
      created_by: requestedBy && /^[0-9a-f-]{36}$/i.test(requestedBy) ? requestedBy : ctx.userId,
    })
    .select('*')
    .single();
  if (saved.error) return fromDbError(saved.error);
  return ok(saved.data, 201);
}
