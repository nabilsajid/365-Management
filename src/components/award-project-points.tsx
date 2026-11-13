'use client';

import { Award } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from './resource-manager';

export interface AwardPerson {
  id: string;
  name: string;
  role: string | null;
  /** What they did on the project, for example "3 deliverables". */
  note: string;
}

/** Admin: give points to everyone who worked on a finished project. */
export function AwardProjectPoints({ projectId, people }: { projectId: string; people: AwardPerson[] }) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(skip: boolean) {
    const awards = skip
      ? []
      : people.map((person) => ({ employee_id: person.id, points: Number(points[person.id] || 0) }));
    if (!skip && awards.some((award) => !Number.isInteger(award.points) || award.points < 0)) {
      setError('Points must be whole numbers, 0 or more.');
      return;
    }
    if (!skip && awards.every((award) => award.points === 0)) {
      setError('Enter points for at least one person, or choose "No points for this project".');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awards }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      toast(skip ? 'Closed without points.' : 'Points given to the team', skip ? 'plain' : 'success');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel award" id="award">
      <header className="panel-header">
        <div>
          <h2>
            <Award size={16} aria-hidden style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
            This project is completed: give points to the team
          </h2>
          <p className="muted">
            Enter what each person earned on this project. The points count toward this month, on top of the points
            their approved deliverables already gave them.
          </p>
        </div>
      </header>
      {people.length === 0 ? (
        <p className="muted">Nobody was assigned to this project.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>On this project</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>
                    {person.name}
                    {person.role ? <span className="muted"> · {person.role}</span> : null}
                  </td>
                  <td>{person.note}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Points for ${person.name}`}
                      className="award-input"
                      value={points[person.id] ?? ''}
                      onChange={(event) => setPoints((current) => ({ ...current, [person.id]: event.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions" style={{ marginTop: '1rem' }}>
        {people.length > 0 ? (
          <button type="button" className="primary" disabled={busy} onClick={() => send(false)}>
            {busy ? 'Saving…' : 'Give points'}
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => send(true)}>
          No points for this project
        </button>
      </div>
    </section>
  );
}
