import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';

const monthInvoice = z.object({ month_id: z.string().uuid() });

// Drafts a monthly client's fee invoice for a month right away (once), instead
// of waiting for the 1st. The database checks who may do it.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, monthInvoice);
  if (body.response) return body.response;
  const { data, error } = await ctx.supabase.rpc('draft_month_invoice', { p_month: body.data.month_id });
  if (error) {
    if (error.code === '42501') return fail(403, error.message);
    if (error.code === '23514' || error.code === 'P0002') return fail(400, `${error.message}.`);
    return fromDbError(error);
  }
  return ok({ id: data }, 201);
}
