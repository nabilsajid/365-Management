import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Web Push without a message body: the push only wakes the device, which then
// asks the app what is new (see public/sw.js). That keeps this to one signed
// request per device and needs no extra library.

/** Push services browsers use. Anything else is refused, so the server never calls an arbitrary address. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /\.push\.apple\.com$/];

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/** The signing key from the two VAPID values, or null when they do not form a valid pair. */
export function vapidKey(publicKey: string, privateKey: string): KeyObject | null {
  try {
    const point = Buffer.from(publicKey, 'base64url');
    if (point.length !== 65 || point[0] !== 4) return null;
    return createPrivateKey({
      format: 'jwk',
      key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)) },
    });
  } catch {
    return null;
  }
}

/** The signed token a push service asks for: who is sending, to which service, valid for 12 hours. */
export function vapidToken(key: KeyObject, audience: string, subject: string, now = Date.now()): string {
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64url(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(signature)}`;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 'sent', 'gone' (the device no longer accepts pushes) or 'failed'. */
async function sendPush(endpoint: string, key: KeyObject, publicKey: string): Promise<'sent' | 'gone' | 'failed'> {
  if (!isPushEndpoint(endpoint)) return 'gone';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@365frames.app';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${vapidToken(key, new URL(endpoint).origin, subject)}, k=${publicKey}`,
        TTL: '86400',
        Urgency: 'high',
      },
    });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Pushes every notification that has not been pushed yet to its owner's
 * devices. Safe to call often: it does nothing when alerts are not set up or
 * there is nothing new. Never throws.
 */
let lastDispatch = 0;

export async function dispatchPushes(): Promise<void> {
  // Pages ask for this often; a couple of seconds between checks is plenty.
  if (Date.now() - lastDispatch < 2000) return;
  lastDispatch = Date.now();
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return;
    const key = vapidKey(publicKey, privateKey);
    const admin = createAdminClient();
    if (!key || !admin) return;

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const waiting = await admin
      .from('notifications')
      .select('id, profile_id')
      .is('pushed_at', null)
      .is('read_at', null)
      .gte('created_at', since)
      .limit(200);
    const rows = (waiting.data ?? []) as { id: string; profile_id: string }[];
    if (waiting.error || rows.length === 0) return;

    // Marked first, so two requests finishing together do not push twice.
    await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', rows.map((row) => row.id));

    const people = [...new Set(rows.map((row) => row.profile_id))];
    const devices = await admin.from('push_subscriptions').select('id, endpoint').in('profile_id', people);
    const gone: string[] = [];
    await Promise.all(
      ((devices.data ?? []) as { id: string; endpoint: string }[]).map(async (device) => {
        if ((await sendPush(device.endpoint, key, publicKey)) === 'gone') gone.push(device.id);
      }),
    );
    if (gone.length > 0) await admin.from('push_subscriptions').delete().in('id', gone);
  } catch (error) {
    console.error('Device alerts could not be sent:', error instanceof Error ? error.message : error);
  }
}
