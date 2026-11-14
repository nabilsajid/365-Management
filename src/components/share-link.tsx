'use client';

import { Copy, Link2, Link2Off } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from './resource-manager';

/**
 * A link for someone outside the company (a client): turn it on, copy it,
 * open it, or turn it off. `endpoint` answers POST with { token } and DELETE.
 */
export function ShareLink({
  endpoint,
  basePath,
  token,
  createLabel,
  offLabel = 'Turn link off',
  offQuery = '',
}: {
  endpoint: string;
  basePath: string;
  token: string | null;
  createLabel: string;
  offLabel?: string;
  offQuery?: string;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => setOrigin(window.location.origin), []);
  const url = token ? `${origin}${basePath}/${token}` : null;

  async function call(method: 'POST' | 'DELETE') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(method === 'DELETE' ? `${endpoint}${offQuery}` : endpoint, { method });
      const result = (await response.json().catch(() => null)) as { data?: { token?: string }; error?: { message?: string } } | null;
      if (!response.ok) {
        setError(result?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      const made = result?.data?.token;
      if (method === 'POST' && made) {
        await copy(`${window.location.origin}${basePath}/${made}`);
      } else {
        toast('Link turned off.');
      }
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast('Link copied. Paste it in a message to your client.', 'success');
    } catch {
      toast('Link ready. Copy it from the box.');
    }
  }

  if (!url) {
    return (
      <span className="action">
        <button type="button" onClick={() => call('POST')} disabled={busy}>
          <Link2 size={14} aria-hidden style={{ marginRight: 6 }} />
          {busy ? 'Working…' : createLabel}
        </button>
        {error ? <span className="error" role="alert">{error}</span> : null}
      </span>
    );
  }
  return (
    <div className="share-link">
      <input readOnly value={url} aria-label="Link to share" onFocus={(event) => event.currentTarget.select()} />
      <button type="button" className="primary" onClick={() => copy(url)}>
        <Copy size={14} aria-hidden style={{ marginRight: 6 }} />
        Copy
      </button>
      <a className="button" href={url} target="_blank" rel="noreferrer">
        Open
      </a>
      <button type="button" className="danger" onClick={() => call('DELETE')} disabled={busy}>
        <Link2Off size={14} aria-hidden style={{ marginRight: 6 }} />
        {offLabel}
      </button>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}
