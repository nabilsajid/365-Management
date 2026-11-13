import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { isPushEndpoint } from '@/lib/server/push';

const input = z.object({ endpoint: z.string().url().max(2000) });

// Turn alerts on for this device: remember where to push.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, input);
  if (body.response) return body.response;
  if (!isPushEndpoint(body.data.endpoint)) return fail(400, 'This browser\'s notification service is not supported.');

  // A device belongs to whoever turned alerts on last (a shared computer, for example).
  await ctx.supabase.from('push_subscriptions').delete().eq('endpoint', body.data.endpoint);
  const { error } = await ctx.supabase
    .from('push_subscriptions')
    .insert({ org_id: ctx.profile.org_id, profile_id: ctx.userId, endpoint: body.data.endpoint });
  // Someone else's row for the same device cannot be removed by this person; treat it as already registered.
  if (error && error.code !== '23505') return fromDbError(error);
  return ok({ on: true }, 201);
}

// Turn alerts off for this device.
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, input);
  if (body.response) return body.response;
  const { error } = await ctx.supabase.from('push_subscriptions').delete().eq('endpoint', body.data.endpoint).eq('profile_id', ctx.userId);
  if (error) return fromDbError(error);
  return ok({ on: false });
}
