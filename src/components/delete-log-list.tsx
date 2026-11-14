'use client';

import { ChevronDown, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface DeleteLogItem {
  id: string;
  kind: string;
  thing: string;
  name: string | null;
  by: string;
  day: string;
  time: string;
  fields: { label: string; value: string }[];
}

/** The delete log as cards grouped by day, with a filter by kind and a search. */
export function DeleteLogList({ items }: { items: DeleteLogItem[] }) {
  const [kind, setKind] = useState('all');
  const [text, setText] = useState('');

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const query = text.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (!query || `${item.thing} ${item.name ?? ''} ${item.by}`.toLowerCase().includes(query)),
  );
  const days: { day: string; items: DeleteLogItem[] }[] = [];
  for (const item of shown) {
    const last = days[days.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else days.push({ day: item.day, items: [item] });
  }

  return (
    <>
      <div className="log-filters">
        <label className="log-search">
          <Search size={15} aria-hidden />
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search by name or person" aria-label="Search the delete log" />
        </label>
        <div className="log-chips" role="group" aria-label="Show">
          <button type="button" className={kind === 'all' ? 'chip-toggle on' : 'chip-toggle'} onClick={() => setKind('all')}>
            All <span>{items.length}</span>
          </button>
          {kinds.map(([name, count]: [string, number]) => (
            <button key={name} type="button" className={kind === name ? 'chip-toggle on' : 'chip-toggle'} onClick={() => setKind(name)}>
              {name} <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="muted empty">Nothing matches.</p>
      ) : (
        days.map((group) => (
          <div key={group.day} className="log-day">
            <p className="log-day-title">{group.day}</p>
            <ul className="log-list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <details>
                    <summary>
                      <span className="log-icon" aria-hidden>
                        <Trash2 size={15} />
                      </span>
                      <span className="log-text">
                        <span className="log-title">
                          <span className="log-kind">{item.thing}</span>
                          {item.name ? <strong>{item.name}</strong> : null}
                        </span>
                        <span className="log-meta">
                          by {item.by} · {item.time}
                        </span>
                      </span>
                      {item.fields.length > 0 ? <ChevronDown size={16} aria-hidden className="log-chevron" /> : null}
                    </summary>
                    {item.fields.length > 0 ? (
                      <dl className="log-fields">
                        {item.fields.map((field) => (
                          <div key={field.label}>
                            <dt>{field.label}</dt>
                            <dd>{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );
}
