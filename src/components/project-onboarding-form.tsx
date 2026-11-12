'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { parseFileLinks } from '@/lib/domain/deliverables';
import { toast } from './resource-manager';
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

/** Add a project: details, links, the people assigned to it, and optional deliverables. */
export function ProjectOnboardingForm({ people, needsApproval = false }: { people: Option[]; needsApproval?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [brief, setBrief] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [links, setLinks] = useState('');
  const [team, setTeam] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableDraft[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function update(key: number, changes: Partial<DeliverableDraft>) {
    setDeliverables((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  function addDeliverable() {
    setDeliverables((current) => [...current, blank(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function toggleMember(id: string, checked: boolean) {
    setTeam((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the project a name.');
      return;
    }
    const projectLinks = parseFileLinks(links);
    if (projectLinks.invalid.length > 0) {
      setError(`This line is not a link: ${projectLinks.invalid[0]}`);
      return;
    }

    const payload: Record<string, unknown>[] = [];
    for (const item of deliverables) {
      if (!item.title.trim()) {
        setError('Every deliverable needs a title.');
        return;
      }
      const parsed = parseFileLinks(item.links);
      if (parsed.invalid.length > 0) {
        setError(`"${item.title}" has a line that is not a link: ${parsed.invalid[0]}`);
        return;
      }
      if (item.points_value && !Number.isInteger(Number(item.points_value))) {
        setError(`Points for "${item.title}" must be a whole number.`);
        return;
      }
      payload.push({
        title: item.title.trim(),
        description: item.description.trim() || null,
        file_links: parsed.links,
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
          name: name.trim(),
          client_name: clientName.trim() || null,
          brief: brief.trim() || null,
          start_date: startDate || null,
          due_date: dueDate || null,
          file_links: projectLinks.links,
          member_ids: team,
          deliverables: payload,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { data?: { id?: string }; error?: { message?: string } }
        | null;
      if (response.status === 202) {
        // Not an admin: the project was sent for approval instead of being created.
        toast('Sent to an admin for approval.');
        setOpen(false);
        return;
      }
      if (!response.ok || !result?.data?.id) {
        setError(result?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      const id = result.data.id;
      startTransition(() => {
        router.push(`/projects/${id}`);
        router.refresh();
      });
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Add a project</h2>
            <p className="muted">
              Name it, assign the people working on it and attach its links.
              {needsApproval ? ' An admin approves it before it appears.' : ''}
            </p>
          </div>
          <button type="button" className="primary" onClick={() => setOpen(true)}>
            Add project
          </button>
        </header>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Add a project</h2>
          <p className="muted">Only the name is required. Everything else can be added or changed later.</p>
        </div>
      </header>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Project name *</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Client</span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Optional" />
            <small>Type the client&apos;s name, or leave empty for an internal project.</small>
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
            <textarea rows={3} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </label>

          <div role="group" aria-label="Assigned employees" className="field wide">
            <span>Assigned employees</span>
            {people.length === 0 ? (
              <small>No employees yet. Add people under Employees &amp; Rewards.</small>
            ) : (
              <div className="choices">
                {people.map((person) => (
                  <label key={person.value} className="choice">
                    <input
                      type="checkbox"
                      checked={team.includes(person.value)}
                      onChange={(event) => toggleMember(person.value, event.target.checked)}
                    />
                    {person.label}
                  </label>
                ))}
              </div>
            )}
            <small>Assigned people can open this project and see its deliverables.</small>
          </div>

          <label className="field wide">
            <span>Links</span>
            <textarea
              rows={3}
              value={links}
              placeholder={'One per line, for example:\nRaw footage | https://drive.google.com/…\nhttps://www.dropbox.com/…'}
              onChange={(event) => setLinks(event.target.value)}
            />
          </label>
        </div>

        {deliverables.length > 0 ? <h3>Deliverables</h3> : null}
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
            <button
              type="button"
              className="danger"
              onClick={() => setDeliverables((current) => current.filter((other) => other.key !== item.key))}
            >
              Remove deliverable
            </button>
          </fieldset>
        ))}

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" onClick={addDeliverable} disabled={busy}>
            Add a deliverable (Video 1, Video 2…)
          </button>
          <button type="button" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
