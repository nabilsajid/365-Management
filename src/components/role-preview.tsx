'use client';

import { Eye, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { Option } from './types';

async function setPreview(roleId: string | null): Promise<string | null> {
  try {
    const response = await fetch('/api/role-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    });
    if (response.ok) return null;
    const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return problem?.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return 'Could not reach the server. Check your connection and try again.';
  }
}

/** On Roles & Access: pick a role and see the app the way its holders do. */
export function RolePreviewPicker({ roles }: { roles: Option[] }) {
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!roleId) {
      setError('Choose a role.');
      return;
    }
    setBusy(true);
    const problem = await setPreview(roleId);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    // A full reload, so every page and the sidebar are rebuilt for the role.
    window.location.assign('/dashboard');
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>View as a role</h2>
          <p className="muted">
            For testing. See exactly what a role sees and what it is missing: the sidebar, the pages and the data all
            behave as they do for someone holding only that role. Anything you add or change while viewing is real. A
            bar at the top takes you back to admin.
          </p>
        </div>
      </header>
      <div className="form">
        <div className="form-grid">
          <label className="field">
            <span>Role</span>
            <select
              value={roleId}
              onChange={(event) => {
                setRoleId(event.target.value);
                setError(null);
              }}
            >
              <option value="">Choose…</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={start}>
            <Eye size={14} aria-hidden style={{ marginRight: 6 }} />
            {busy ? 'Switching…' : 'View as this role'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The bar shown on every page while an admin is viewing as another role. */
export function RolePreviewBar({ roleName }: { roleName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setBusy(true);
    const problem = await setPreview(null);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    window.location.assign('/roles');
  }

  return (
    <div className="preview-bar" role="status">
      <span>
        <Eye size={15} aria-hidden />
        Viewing as <strong>{roleName}</strong>. This is what someone with only this role sees.
        {error ? ` ${error}` : ''}
      </span>
      <button type="button" disabled={busy} onClick={stop}>
        <Undo2 size={14} aria-hidden />
        {busy ? 'Switching back…' : 'Back to admin'}
      </button>
    </div>
  );
}
