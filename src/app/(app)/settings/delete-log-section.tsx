import { ClearLog } from '@/components/clear-log';
import { DeleteLogList, type DeleteLogItem } from '@/components/delete-log-list';
import { changeDetails } from '@/lib/domain/changes';
import { getPageContext, rowsOf } from '@/lib/page';
import type { DeleteLogEntry, Profile } from '@/types/database';

/** The API name of each table, which the shared change layout uses to name the record. */
const RESOURCE: Record<string, string> = {
  fixed_expenses: 'fixed-expenses',
  violation_types: 'violation-types',
  point_entries: 'points',
  equipment_needs: 'equipment-needs',
  task_submissions: 'submissions',
  project_comments: 'project-comments',
  profiles: 'employees',
};

/** Everything deleted within the company's chosen period, and a button to clear it. */
export async function DeleteLogSection() {
  const { supabase, orgId, localDate, timeZone } = await getPageContext();

  const [logR, peopleR, orgR, ...namedR] = await Promise.all([
    supabase.from('delete_log').select('*').eq('org_id', orgId).order('deleted_at', { ascending: false }).limit(500),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('projects').select('id, name').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('accounts').select('id, name').eq('org_id', orgId),
  ]);
  const entries = rowsOf<DeleteLogEntry>(logR.data);
  const days = Number((orgR.data as { delete_log_days?: number } | null)?.delete_log_days ?? 30);
  const personName = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((person) => [person.id, person.full_name]));
  const named = new Map(namedR.flatMap((result) => rowsOf<{ id: string; name: string }>(result.data).map((row) => [row.id, row.name] as const)));
  const nameOf = (id: string) => personName.get(id) ?? named.get(id);

  // Each entry as a card: what, its name, who, when, and the details it held.
  const today = localDate(new Date().toISOString());
  const yesterday = localDate(new Date(Date.now() - 86400000).toISOString());
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
  const dayName = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
  const items: DeleteLogItem[] = entries.map((entry) => {
    const day = localDate(entry.deleted_at);
    const kind = thing(entry.table_name);
    const details = changeDetails(
      { method: 'POST', path: `/api/${RESOURCE[entry.table_name] ?? entry.table_name}`, body: entry.data, summary: '' },
      nameOf,
    );
    return {
      id: entry.id,
      kind: kind.charAt(0).toUpperCase() + kind.slice(1),
      thing: kind.charAt(0).toUpperCase() + kind.slice(1),
      name: entry.label,
      by: entry.deleted_by ? (personName.get(entry.deleted_by) ?? 'a former employee') : 'the system',
      day: day === today ? 'Today' : day === yesterday ? 'Yesterday' : dayName.format(new Date(entry.deleted_at)),
      time: clock.format(new Date(entry.deleted_at)).toLowerCase(),
      fields: details.fields.filter((field) => field.value && field.value !== '—'),
    };
  });

  return (
    <section className="panel delete-log">
      <header className="panel-header">
        <div>
          <h2>Delete log</h2>
          <p className="muted">
            {entries.length === 0
              ? `Nothing was deleted in the last ${days} days.`
              : `${entries.length} ${entries.length === 1 ? 'item' : 'items'} deleted in the last ${days} days, by anyone. Tap one to see what it held.`}{' '}
            Change how long entries are kept under Rules.
          </p>
        </div>
        <ClearLog count={entries.length} />
      </header>
      {logR.error ? (
        <p className="muted">
          The delete log needs a database update first. Open System check to see which updates are missing.
        </p>
      ) : entries.length === 0 ? null : (
        <DeleteLogList items={items} />
      )}
    </section>
  );
}

function thing(table: string): string {
  const names: Record<string, string> = {
    profiles: 'employee',
    tasks: 'deliverable',
    task_submissions: 'submission',
    point_entries: 'points entry',
    equipment_needs: 'needed item',
    project_comments: 'comment',
    attendance: 'attendance day',
    bonuses: 'bonus',
    equipment: 'equipment',
  };
  return names[table] ?? table.replace(/_/g, ' ').replace(/s$/, '');
}
