import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { broadcasts } from '@/lib/api/resources';
import { broadcastCreate } from '@/lib/validation';

// Admins get every broadcast; everyone else gets the ones they sent and the messages sent to them.
export const GET = crud.collection(broadcasts).GET;

// Anyone can send a short urgent message to the admins. An admin can also
// send a personal message to one person by naming them.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, broadcastCreate);
  if (body.response) return body.response;
  const recipient = body.data.recipient_id ?? null;

  if (recipient) {
    if (ctx.profile.access_role !== 'admin') return fail(403, 'Only an admin can send a personal message.');
    const found = await ctx.supabase.from('profiles').select('id').eq('id', recipient).eq('org_id', ctx.profile.org_id).maybeSingle();
    if (!found.data) return fail(400, 'Choose someone from your team.');
  }

  const { data, error } = await ctx.supabase
    .from('broadcasts')
    .insert({ org_id: ctx.profile.org_id, sender_id: ctx.userId, message: body.data.message, ...(recipient ? { recipient_id: recipient } : {}) })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}
