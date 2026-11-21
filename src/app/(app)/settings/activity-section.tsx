import Link from 'next/link';
import { getPageContext, rowsOf } from '@/lib/page';

const THING: Record<string, string> = {
  invoices: 'Invoice',
  payments: 'Payment',
  payslips: 'Payslip',
  projects: 'Project',
  expenses: 'Cost',
  salaries: 'Salary',
};
const FILTERS = ['all', ...Object.keys(THING)] as const;
// Columns that are only bookkeeping, not worth showing.
const QUIET = new Set(['id', 'org_id', 'created_at', 'created_by', 'expense_id', 'month_id', 'project_month_id']);

const show = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : '…';
  return String(value).slice(0, 80);
};
const field = (key: string) => key.replace(/_id$/, '').replace(/_/g, ' ');

/** Who added, changed or deleted invoices, payments, payslips, projects, costs and salaries, and what changed. */
export async function ActivitySection({ kind }: { kind?: string }) {
  const { supabase, orgId, timeZone } = await getPageContext();
  const filter = (FILTERS as readonly string[]).includes(kind ?? '') ? (kind as string) : 'all';
  let query = supabase.from('activity_log').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
  if (filter !== 'all') query = query.eq('table_name', filter);
  const [logR, peopleR] = await Promise.all([query, supabase.from('profiles').select('id, full_name').eq('org_id', orgId)]);
  const name = new Map(rowsOf<{ id: string; full_name: string }>(peopleR.data).map((row) => [row.id, row.full_name]));
  const entries = rowsOf<{
    id: string;
    actor_id: string | null;
    table_name: string;
    row_id: string;
    action: string;
    label: string | null;
    changes: Record<string, [unknown, unknown]> | null;
    created_at: string;
  }>(logR.data);
  const when = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Activity history</h2>
          <p className="muted">Who added, changed or deleted money records and projects, newest first. The latest 300 are shown.</p>
        </div>
      </header>
      <nav className="tabs" aria-label="Filter activity">
        {FILTERS.map((item) => (
          <Link key={item} href={`/settings?tab=activity&kind=${item}`} aria-current={filter === item ? 'page' : undefined}>
            {item === 'all' ? 'All' : `${THING[item]}s`}
          </Link>
        ))}
      </nav>
      {logR.error ? (
        <p className="muted">Activity history arrives with the next database update. Reload this page in a minute.</p>
      ) : entries.length === 0 ? (
        <p className="muted">Nothing recorded yet. Changes made from now on show here.</p>
      ) : (
        <ul className="message-list">
          {entries.map((entry) => {
            const changes = Object.entries(entry.changes ?? {}).filter(([key]) => !QUIET.has(key));
            return (
              <li key={entry.id} className="message">
                <div className="min-w-0 flex-1">
                  <p className="message-meta">
                    <strong>{entry.actor_id ? (name.get(entry.actor_id) ?? 'A former employee') : 'The system'}</strong> {entry.action}{' '}
                    {(THING[entry.table_name] ?? entry.table_name).toLowerCase()} <strong>{entry.label ?? ''}</strong> · {when.format(new Date(entry.created_at))}
                  </p>
                  {changes.length > 0 ? (
                    <p className="message-body">
                      {changes.map(([key, [before, after]]) => (
                        <span key={key} style={{ display: 'block' }}>
                          {field(key)}: {show(before)} → {show(after)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
