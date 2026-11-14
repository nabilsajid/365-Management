import { randomBytes } from 'node:crypto';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteParams = { params: Promise<{ id: string }> };

// An admin makes a link the client can open to see and print the invoice.
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const current = await ctx.supabase.from('invoices').select('share_token').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (current.error) return fromDbError(current.error);
  if (!current.data) return fail(404, 'Not found.');
  if (current.data.share_token) return ok({ token: current.data.share_token });
  const token = randomBytes(32).toString('hex');
  const { error } = await ctx.supabase.from('invoices').update({ share_token: token }).eq('id', id).eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ token }, 201);
}

// Turns the client link off; the old link stops working.
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { error } = await ctx.supabase.from('invoices').update({ share_token: null }).eq('id', id).eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ done: true });
}
