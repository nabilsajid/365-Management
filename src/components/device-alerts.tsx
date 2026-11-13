'use client';

import { BellOff, BellRing, Copy, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from './resource-manager';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function toBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, 'success');
  } catch {
    toast('Copying is not available here.');
  }
}

/** One-time setup for the admin: make the pair of keys the server needs to send alerts. */
function Setup() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);

  async function generate() {
    // Made in this browser and shown only here; nothing is sent anywhere.
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const publicKey = toBase64Url(await crypto.subtle.exportKey('raw', pair.publicKey));
    const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d ?? '';
    setKeys({ publicKey, privateKey });
  }

  return (
    <div className="login-fill">
      <p>
        <strong>Device alerts are not set up yet.</strong> They need two values in Vercel (Project → Settings →
        Environment Variables). Generate them here, add both, then redeploy. This is done once.
      </p>
      {keys ? (
        <div className="alert-keys">
          <div>
            <span>NEXT_PUBLIC_VAPID_PUBLIC_KEY</span>
            <code>{keys.publicKey}</code>
            <button type="button" className="mini" onClick={() => copy(keys.publicKey, 'Public key')}>
              <Copy size={13} aria-hidden style={{ marginRight: 5 }} />
              Copy
            </button>
          </div>
          <div>
            <span>VAPID_PRIVATE_KEY</span>
            <code>•••••••••••• (secret, not shown)</code>
            <button type="button" className="mini" onClick={() => copy(keys.privateKey, 'Private key')}>
              <Copy size={13} aria-hidden style={{ marginRight: 5 }} />
              Copy
            </button>
          </div>
          <p className="muted">Keep the private key to yourself. If you leave this page before saving both, generate a new pair.</p>
        </div>
      ) : (
        <div className="actions">
          <button type="button" onClick={generate}>
            <KeyRound size={14} aria-hidden style={{ marginRight: 6 }} />
            Generate keys
          </button>
        </div>
      )}
    </div>
  );
}

/** Lets a person turn alerts on or off for the device they are using. */
export function DeviceAlerts({ serverReady, isAdmin }: { serverReady: boolean; isAdmin: boolean }) {
  // null while checking this device.
  const [state, setState] = useState<'unsupported' | 'blocked' | 'off' | 'on' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(PUBLIC_KEY).buffer as ArrayBuffer }));
      const response = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? 'Alerts could not be turned on. Please try again.');
        return;
      }
      setState('on');
      toast('Alerts are on for this device', 'success');
    } catch {
      setError('Alerts could not be turned on on this device.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe();
      }
      setState('off');
      toast('Alerts are off for this device.');
    } catch {
      setError('Alerts could not be turned off. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const ready = serverReady && PUBLIC_KEY !== '';

  return (
    <section className="panel" id="alerts">
      <header className="panel-header">
        <div>
          <h2>Alerts on this device</h2>
          <p className="muted">
            Get a notification on this phone or computer when a project or task is assigned to you, even when the app
            is closed. Turn it on separately on each device you use.
          </p>
        </div>
      </header>

      {!ready ? (
        isAdmin ? (
          <Setup />
        ) : (
          <p className="muted">Your admin has not set up device alerts yet.</p>
        )
      ) : state === null ? (
        <p className="muted">Checking this device…</p>
      ) : state === 'unsupported' ? (
        <p className="muted">
          This browser cannot show alerts. On an iPhone or iPad, first install the app (Share → Add to Home Screen) and
          open it from the home screen, then come back here.
        </p>
      ) : state === 'blocked' ? (
        <p className="muted">
          Notifications are blocked for this site in your browser. Allow them in the browser&apos;s site settings, then
          reload this page.
        </p>
      ) : (
        <div className="actions" style={{ alignItems: 'center' }}>
          {state === 'on' ? (
            <>
              <span className="badge badge-approved">
                <BellRing size={12} aria-hidden className="mr-1" />
                On for this device
              </span>
              <button type="button" disabled={busy} onClick={turnOff}>
                <BellOff size={14} aria-hidden style={{ marginRight: 6 }} />
                {busy ? 'Working…' : 'Turn off'}
              </button>
            </>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={turnOn}>
              <BellRing size={14} aria-hidden style={{ marginRight: 6 }} />
              {busy ? 'Working…' : 'Turn on alerts'}
            </button>
          )}
        </div>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
