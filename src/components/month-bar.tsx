import { CalendarCheck2, CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { ActionButton } from './resource-manager';

export interface MonthTab {
  id: string;
  month: string;
  status: 'open' | 'closed';
  done: number;
  total: number;
  extras: number;
}

export function monthName(month: string, short = false): string {
  return new Date(`${month.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: short ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * For a monthly client: which month is shown, how far along it is, the other
 * months as history, and opening or closing a month.
 */
export function MonthBar({
  projectId,
  tabs,
  selectedId,
  thisMonth,
  nextMonth,
  canEdit,
  isAdmin,
}: {
  projectId: string;
  tabs: MonthTab[];
  selectedId: string | null;
  thisMonth: string;
  nextMonth: string;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const selected = tabs.find((tab) => tab.id === selectedId) ?? null;
  const hasThis = tabs.some((tab) => tab.month === thisMonth);
  const hasNext = tabs.some((tab) => tab.month === nextMonth);
  const percent = selected && selected.total > 0 ? Math.round((selected.done / selected.total) * 100) : 0;

  return (
    <section className="panel month-bar">
      <header className="panel-header">
        <div>
          <h2>
            {selected ? monthName(selected.month) : 'No month opened yet'}{' '}
            {selected ? (
              <span className={selected.status === 'closed' ? 'badge badge-approved' : 'badge badge-active'}>
                {selected.status === 'closed' ? 'Closed' : 'Open'}
              </span>
            ) : null}
          </h2>
          <p className="muted">
            {selected
              ? `${selected.done} of ${selected.total} deliverables done${selected.extras > 0 ? ` · ${selected.extras} extra` : ''}`
              : 'A month starts with the monthly package. It opens by itself on the 1st, or open it now.'}
          </p>
        </div>
        {canEdit ? (
          <div className="month-actions">
            {!hasThis ? (
              <ActionButton endpoint={`/api/projects/${projectId}/months`} body={{ month: 'current' }} primary>
                <CalendarPlus size={14} aria-hidden style={{ marginRight: 6 }} />
                Open {monthName(thisMonth, true)}
              </ActionButton>
            ) : null}
            {hasThis && !hasNext ? (
              <ActionButton endpoint={`/api/projects/${projectId}/months`} body={{ month: 'next' }}>
                <CalendarPlus size={14} aria-hidden style={{ marginRight: 6 }} />
                Open {monthName(nextMonth, true)} early
              </ActionButton>
            ) : null}
            {selected && selected.status === 'open' ? (
              <ActionButton endpoint={`/api/project-months/${selected.id}`} method="PATCH" body={{ status: 'closed' }}>
                <CalendarCheck2 size={14} aria-hidden style={{ marginRight: 6 }} />
                Close {monthName(selected.month, true)}
              </ActionButton>
            ) : null}
            {selected && selected.status === 'closed' ? (
              <ActionButton endpoint={`/api/project-months/${selected.id}`} method="PATCH" body={{ status: 'open' }}>
                Reopen
              </ActionButton>
            ) : null}
            {selected && isAdmin ? (
              <ActionButton endpoint={`/api/project-months/${selected.id}`} method="DELETE">
                Remove month
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </header>
      {selected ? (
        <div className="month-progress" role="progressbar" aria-label="Month progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {tabs.length > 1 ? (
        <nav className="month-tabs" aria-label="Months">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/projects/${projectId}?month=${tab.id}`}
              aria-current={tab.id === selectedId ? 'page' : undefined}
              scroll={false}
            >
              <span>{monthName(tab.month, true)}</span>
              <small>
                {tab.done}/{tab.total}
                {tab.status === 'closed' ? ' ✓' : ''}
              </small>
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
