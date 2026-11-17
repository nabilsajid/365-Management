import { randomBytes } from 'node:crypto';
import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteParams = { params: Promise<{ id: string }> };

// Admins and project editors give a client their private portal link: all their
// projects, deliverables to approve, and invoices, with no account needed.
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  if (mode !== 'apply') return fail(403, 'Only an admin or a project editor can share a client portal.');
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const client = await ctx.supabase.from('clients').select('id').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (client.error) return fromDbError(client.error);
  if (!client.data) return fail(404, 'Not found.');
  const current = await ctx.supabase.from('client_portals').select('token, is_active').eq('client_id', id).maybeSingle();
  if (current.error) return fromDbError(current.error);
  if (current.data?.is_active) return ok({ token: current.data.token });
  const token = randomBytes(32).toString('hex');
  const saved = current.data
    ? await ctx.supabase.from('client_portals').update({ token, is_active: true }).eq('client_id', id)
    : await ctx.supabase.from('client_portals').insert({ org_id: ctx.profile.org_id, client_id: id, token, created_by: ctx.userId });
  if (saved.error) return fromDbError(saved.error);
  return ok({ token }, 201);
}

// Turns the portal off; the old link stops working. Sharing again makes a new link.
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  if (mode !== 'apply') return fail(403, 'Only an admin or a project editor can turn a client portal off.');
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { error } = await ctx.supabase.from('client_portals').update({ is_active: false }).eq('client_id', id).eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ done: true });
}
