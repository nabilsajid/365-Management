import { redirect } from 'next/navigation';
import { ChangeSummary } from '@/components/change-summary';
import { ClearLog } from '@/components/clear-log';
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

// Admin only: everything deleted in the last 3 days, and a button to clear it.
export default async function DeleteLogPage() {
  const { supabase, orgId, isAdmin, localDateTime } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');

  const [logR, peopleR, ...namedR] = await Promise.all([
    supabase.from('delete_log').select('*').eq('org_id', orgId).order('deleted_at', { ascending: false }).limit(500),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
    supabase.from('projects').select('id, name').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('accounts').select('id, name').eq('org_id', orgId),
  ]);
  const entries = rowsOf<DeleteLogEntry>(logR.data);
  const personName = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((person) => [person.id, person.full_name]));
  const named = new Map(namedR.flatMap((result) => rowsOf<{ id: string; name: string }>(result.data).map((row) => [row.id, row.name] as const)));
  const nameOf = (id: string) => personName.get(id) ?? named.get(id);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Delete Log</h1>
          <p className="muted">Everything deleted in the last 3 days, by anyone. Older entries drop off by themselves.</p>
        </div>
        <ClearLog count={entries.length} />
      </div>

      <section className="panel">
        {logR.error ? (
          <p className="muted">
            The delete log needs a database update first. Run the file
            <code> 20261112000020_delete_log_role_preview.sql </code>
            in the Supabase SQL Editor, then reload this page.
          </p>
        ) : entries.length === 0 ? (
          <p className="muted empty">Nothing was deleted in the last 3 days.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Deleted</th>
                  <th>By</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{localDateTime(entry.deleted_at)}</td>
                    <td>{entry.deleted_by ? (personName.get(entry.deleted_by) ?? '—') : '—'}</td>
                    <td>
                      <ChangeSummary
                        details={{
                          ...changeDetails(
                            { method: 'POST', path: `/api/${RESOURCE[entry.table_name] ?? entry.table_name}`, body: entry.data, summary: '' },
                            nameOf,
                          ),
                          heading: `Deleted ${thing(entry.table_name)}`,
                          name: entry.label,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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
