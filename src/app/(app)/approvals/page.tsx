import { redirect } from 'next/navigation';
import { MonthPicker } from '@/components/month-picker';
import { ActionButton, ResourceManager } from '@/components/resource-manager';
import { sectionOf } from '@/lib/domain/changes';
import { nextMonth, parseMonth } from '@/lib/domain/points';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import type { Attendance, Bonus, ChangeRequest, Profile, Task, TaskSubmission } from '@/types/database';

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive', dropbox: 'Dropbox', text: 'Text note' };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  // Optional month filter for the attendance list. Without it, every pending day is shown.
  const month = parseMonth((await searchParams).month);
  const { supabase, orgId, isAdmin, localDate, localDateTime } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');

  const [submissionsR, attendanceR, bonusesR, peopleR, tasksR, changesR] = await Promise.all([
    supabase.from('task_submissions').select('*').eq('org_id', orgId).eq('review_status', 'pending').order('created_at'),
    month
      ? supabase.from('attendance').select('*').eq('org_id', orgId).eq('status', 'pending').gte('work_date', month).lt('work_date', nextMonth(month)).order('work_date')
      : supabase.from('attendance').select('*').eq('org_id', orgId).eq('status', 'pending').order('work_date'),
    supabase.from('bonuses').select('*').eq('org_id', orgId).eq('status', 'pending').order('period_month'),
    supabase.from('profiles').select('*').eq('org_id', orgId),
    supabase.from('tasks').select('id, title').eq('org_id', orgId),
    supabase.from('change_requests').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at'),
  ]);
  const person = new Map(rowsOf<Profile>(peopleR.data).map((profile) => [profile.id, profile]));
  const taskTitle = new Map(rowsOf<Pick<Task, 'id' | 'title'>>(tasksR.data).map((task) => [task.id, task.title]));
  const who = (id: string) => person.get(id)?.full_name ?? '—';
  const role = (id: string) => person.get(id)?.job_title ?? null;

  const changes = rowsOf<ChangeRequest>(changesR.data);

  const submissions = rowsOf<TaskSubmission>(submissionsR.data).map((row) => ({
    ...row,
    task_title: taskTitle.get(row.task_id) ?? 'Task',
    task_href: `/tasks/${row.task_id}`,
    by: who(row.submitted_by),
    kind_label: KIND_LABEL[row.kind] ?? row.kind,
    link_text: row.url ? 'Open link' : null,
    submitted_on: localDate(row.created_at),
  }));
  const attendance = rowsOf<Attendance>(attendanceR.data).map((row) => ({
    ...row,
    employee_name: who(row.employee_id),
    employee_role: role(row.employee_id),
    check_in: row.check_in ? row.check_in.slice(0, 5) : null,
    check_out: row.check_out ? row.check_out.slice(0, 5) : null,
  }));
  const bonuses = rowsOf<Bonus>(bonusesR.data).map((row) => ({
    ...row,
    employee_name: who(row.employee_id),
    month_label: monthLabel(row.period_month),
    amount_label: money(row.amount),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Everything waiting for an admin decision. Use Edit on a row to decide.</p>
        </div>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>
              Change requests
              {changes.length > 0 ? <span className="count">{changes.length}</span> : null}
            </h2>
            <p className="muted">
              Edits made by people who are not admins. Approve to apply the change exactly as written; deny to drop it.
            </p>
          </div>
        </header>
        {changes.length === 0 ? (
          <p className="muted empty">No changes waiting for approval.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>From</th>
                  <th>Section</th>
                  <th>Change</th>
                  <th aria-label="Decision" />
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td>{localDateTime(change.created_at)}</td>
                    <td>
                      {who(change.requested_by)}
                      {role(change.requested_by) ? <span className="muted"> · {role(change.requested_by)}</span> : null}
                    </td>
                    <td>{sectionOf(change.path)}</td>
                    <td>{change.summary}</td>
                    <td className="row-actions">
                      <ActionButton endpoint={`/api/change-requests/${change.id}`} body={{ decision: 'approve' }} primary>
                        Approve
                      </ActionButton>{' '}
                      <ActionButton endpoint={`/api/change-requests/${change.id}`} body={{ decision: 'deny' }}>
                        Deny
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ResourceManager
        title="Task submissions"
        endpoint="/api/submissions"
        rows={asRows(submissions)}
        columns={[
          { key: 'task_title', label: 'Task', kind: 'nav', hrefKey: 'task_href' },
          { key: 'by', label: 'Submitted by' },
          { key: 'submitted_on', label: 'Date' },
          { key: 'kind_label', label: 'Type' },
          { key: 'link_text', label: 'Link', kind: 'link', hrefKey: 'url' },
          { key: 'note', label: 'Note' },
        ]}
        editFields={[
          { name: 'review_status', label: 'Review', type: 'select', required: true, options: enumOptions(['pending', 'approved', 'changes_requested']) },
          { name: 'review_note', label: 'Review note', type: 'textarea' },
        ]}
        canWrite
        allowDelete={false}
        emptyText="No submissions waiting for review."
      />

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Attendance month</h2>
            <p className="muted">
              {month ? `Showing days waiting in ${monthLabel(month)}.` : 'Showing every day that is waiting. Pick a month to narrow it down.'}
            </p>
          </div>
          <MonthPicker value={month ? month.slice(0, 7) : ''} current={localDate(new Date().toISOString()).slice(0, 7)} allowAll />
        </header>
      </section>

      <ResourceManager
        title={month ? `Attendance in ${monthLabel(month)}` : 'Attendance'}
        description="Verifying a day awards the attendance points."
        endpoint="/api/attendance"
        rows={asRows(attendance)}
        columns={[
          { key: 'work_date', label: 'Date' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'employee_role', label: 'Role' },
          { key: 'check_in', label: 'Entry' },
          { key: 'check_out', label: 'Exit' },
          { key: 'note', label: 'Note' },
        ]}
        editFields={[
          { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'check_in', label: 'Entry time', type: 'time' },
          { name: 'check_out', label: 'Exit time', type: 'time' },
          { name: 'note', label: 'Note' },
        ]}
        canWrite
        allowDelete={false}
        emptyText="No data found."
      />

      <ResourceManager
        title="Bonuses"
        endpoint="/api/bonuses"
        rows={asRows(bonuses)}
        columns={[
          { key: 'month_label', label: 'Month' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'points_total', label: 'Points', kind: 'number' },
          { key: 'amount', label: 'Bonus', kind: 'money' },
        ]}
        editFields={[
          { name: 'status', label: 'Decision', type: 'select', required: true, options: enumOptions(['pending', 'approved', 'rejected']) },
        ]}
        canWrite
        allowDelete={false}
        emptyText="No bonuses waiting for approval."
      />
    </>
  );
}
