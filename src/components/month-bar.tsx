import { CalendarPlus, Check, CircleDot } from 'lucide-react';
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
 * For a monthly client: the months as tabs (like pages of a calendar), the
 * chosen month's progress, and its status, In progress or Done, set the same
 * way a one-time project's status is.
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
  const ordered = [...tabs].sort((a, b) => a.month.localeCompare(b.month));
  // The month that can be started next: this month if it has not started, else next month.
  const startable = !hasThis ? { key: 'current', month: thisMonth } : !hasNext ? { key: 'next', month: nextMonth } : null;

  return (
    <section className="panel month-bar">
      <nav className="month-tabs" aria-label="Months">
        {ordered.map((tab) => (
          <Link
            key={tab.id}
            href={`/projects/${projectId}?month=${tab.id}`}
            aria-current={tab.id === selectedId ? 'page' : undefined}
            scroll={false}
          >
            <span>{monthName(tab.month, true)}</span>
            <small>{tab.status === 'closed' ? 'Done' : `${tab.done}/${tab.total}`}</small>
          </Link>
        ))}
        {canEdit && startable ? (
          <ActionButton endpoint={`/api/projects/${projectId}/months`} body={{ month: startable.key }}>
            <CalendarPlus size={14} aria-hidden style={{ marginRight: 6 }} />
            Start {monthName(startable.month, true)}
          </ActionButton>
        ) : null}
      </nav>

      {selected ? (
        <>
          <div className="month-head">
            <div>
              <h2>{monthName(selected.month)}</h2>
              <p className="muted">
                {selected.done} of {selected.total} deliverables done
              </p>
            </div>
            <div className="month-status" role="group" aria-label="Month status">
              {canEdit ? (
                <>
                  {selected.status === 'open' ? (
                    <span className="month-status-on">
                      <CircleDot size={14} aria-hidden /> In progress
                    </span>
                  ) : (
                    <ActionButton endpoint={`/api/project-months/${selected.id}`} method="PATCH" body={{ status: 'open' }}>
                      <CircleDot size={14} aria-hidden style={{ marginRight: 6 }} />
                      In progress
                    </ActionButton>
                  )}
                  {selected.status === 'closed' ? (
                    <span className="month-status-on done">
                      <Check size={14} aria-hidden /> Done
                    </span>
                  ) : (
                    <ActionButton endpoint={`/api/project-months/${selected.id}`} method="PATCH" body={{ status: 'closed' }}>
                      <Check size={14} aria-hidden style={{ marginRight: 6 }} />
                      Mark month done
                    </ActionButton>
                  )}
                </>
              ) : (
                <span className={selected.status === 'closed' ? 'month-status-on done' : 'month-status-on'}>
                  {selected.status === 'closed' ? 'Done' : 'In progress'}
                </span>
              )}
            </div>
          </div>
          <div className="month-progress" role="progressbar" aria-label="Month progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div style={{ width: `${percent}%` }} />
          </div>
          {isAdmin && canEdit ? (
            <details className="month-more">
              <summary>More</summary>
              <ActionButton endpoint={`/api/project-months/${selected.id}`} method="DELETE">
                Remove {monthName(selected.month, true)} and its deliverables
              </ActionButton>
            </details>
          ) : null}
        </>
      ) : (
        <div className="month-head">
          <div>
            <h2>No month started yet</h2>
            <p className="muted">Each month starts by itself on the 1st; add its work as it comes. Or start it now.</p>
          </div>
        </div>
      )}
    </section>
  );
}
