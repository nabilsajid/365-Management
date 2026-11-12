'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { parseFileLinks } from '@/lib/domain/deliverables';
import type { Option } from './types';

interface DeliverableDraft {
  key: number;
  title: string;
  description: string;
  links: string;
  assignee_id: string;
  points_value: string;
  due_date: string;
}

const blank = (key: number): DeliverableDraft => ({
  key,
  title: `Video ${key}`,
  description: '',
  links: '',
  assignee_id: '',
  points_value: '',
  due_date: '',
});

/** Client onboarding: project brief plus one task per deliverable. */
export function ProjectOnboardingForm({ clients, people }: { clients: Option[]; people: Option[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [deliverables, setDeliverables] = useState<DeliverableDraft[]>([blank(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: number, changes: Partial<DeliverableDraft>) {
    setDeliverables((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  function add() {
    setDeliverables((current) => [...current, blank(nextKey)]);
    setNextKey((key) => key + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !name.trim()) {
      setError('Choose a client and give the project a name.');
      return;
    }

    const payload: Record<string, unknown>[] = [];
    for (const item of deliverables) {
      if (!item.title.trim()) {
        setError('Every deliverable needs a title.');
        return;
      }
      const { links, invalid } = parseFileLinks(item.links);
      if (invalid.length > 0) {
        setError(`"${item.title}" has a line that is not a link: ${invalid[0]}`);
        return;
      }
      if (item.points_value && !Number.isInteger(Number(item.points_value))) {
        setError(`Points for "${item.title}" must be a whole number.`);
        return;
      }
      payload.push({
        title: item.title.trim(),
        description: item.description.trim() || null,
        file_links: links,
        assignee_id: item.assignee_id || null,
        points_value: item.points_value ? Number(item.points_value) : null,
        due_date: item.due_date || null,
      });
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: name.trim(),
          brief: brief.trim() || null,
          start_date: startDate || null,
          due_date: dueDate || null,
          deliverables: payload,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { data?: { id: string }; error?: { message?: string } }
        | null;
      if (!response.ok || !result?.data) {
        setError(result?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Onboard a project</h2>
          <p className="muted">The brief and one task per deliverable are created together.</p>
        </div>
      </header>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Client *</span>
            <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Choose…</option>
              {clients.map((client) => (
                <option key={client.value} value={client.value}>
                  {client.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Project name *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="field wide">
            <span>Project brief</span>
            <textarea rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </label>
        </div>

        <h3>Deliverables</h3>
        {deliverables.map((item) => (
          <fieldset key={item.key} className="deliverable">
            <div className="form-grid">
              <label className="field">
                <span>Title *</span>
                <input value={item.title} onChange={(event) => update(item.key, { title: event.target.value })} />
              </label>
              <label className="field">
                <span>Assignee</span>
                <select value={item.assignee_id} onChange={(event) => update(item.key, { assignee_id: event.target.value })}>
                  <option value="">Unassigned</option>
                  {people.map((person) => (
                    <option key={person.value} value={person.value}>
                      {person.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Points on approval</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={item.points_value}
                  placeholder="Organization default"
                  onChange={(event) => update(item.key, { points_value: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Due date</span>
                <input type="date" value={item.due_date} onChange={(event) => update(item.key, { due_date: event.target.value })} />
              </label>
              <label className="field wide">
                <span>Description</span>
                <textarea rows={2} value={item.description} onChange={(event) => update(item.key, { description: event.target.value })} />
              </label>
              <label className="field wide">
                <span>File links</span>
                <textarea
                  rows={2}
                  value={item.links}
                  placeholder="One per line: Label | https://…"
                  onChange={(event) => update(item.key, { links: event.target.value })}
                />
              </label>
            </div>
            {deliverables.length > 1 ? (
              <button
                type="button"
                className="danger"
                onClick={() => setDeliverables((current) => current.filter((other) => other.key !== item.key))}
              >
                Remove deliverable
              </button>
            ) : null}
          </fieldset>
        ))}

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" onClick={add}>
            Add deliverable
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project and tasks'}
          </button>
        </div>
      </form>
    </section>
  );
}
