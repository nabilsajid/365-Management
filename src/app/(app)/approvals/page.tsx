import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MonthPicker } from '@/components/month-picker';
import { PasswordRequests } from '@/components/password-requests';
import { EmailSection } from './email-section';
import { ActionButton, ResourceManager } from '@/components/resource-manager';
import { ChangeSummary } from '@/components/change-summary';
import { changeDetails, sectionOf } from '@/lib/domain/changes';
import { nextMonth, parseMonth } from '@/lib/domain/points';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import type { Attendance, Bonus, ChangeRequest, PasswordRequest, Profile, Task, TaskSubmission } from '@/types/database';

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive', dropbox: 'Dropbox', text: 'Text note' };

type Tab = 'requests' | 'work' | 'attendance' | 'bonuses' | 'emails';

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  // Optional month filter for the attendance list. Without it, every pending day is shown.
  const query = await searchParams;
  const month = parseMonth(query.month);
  const { supabase, orgId, isAdmin, can, localDate, localDateTime } = await getPageContext();
  const approvesEmails = isAdmin || can('emails');
  if (!isAdmin && !approvesEmails) redirect('/dashboard');

  const emailCount = await supabase.from('email_outbox').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['pending', 'failed']);
  const emailsWaiting = emailCount.error ? 0 : (emailCount.count ?? 0);

  // People who only approve emails see just that section.
  if (!isAdmin) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Approvals</h1>
          </div>
        </div>
        <nav className="tabs" aria-label="Approval sections">
          <Link href="/approvals?tab=emails" aria-current="page">
            Emails{emailsWaiting > 0 ? <span className="count">{emailsWaiting}</span> : null}
          </Link>
        </nav>
        <EmailSection />
      </>
    );
  }

  const [submissionsR, attendanceR, bonusesR, peopleR, tasksR, changesR, passwordsR, leaveR, ...namedR] = await Promise.all([
    supabase.from('task_submissions').select('*').eq('org_id', orgId).eq('review_status', 'pending').order('created_at'),
    month
      ? supabase.from('attendance').select('*').eq('org_id', orgId).eq('status', 'pending').gte('work_date', month).lt('work_date', nextMonth(month)).order('work_date')
      : supabase.from('attendance').select('*').eq('org_id', orgId).eq('status', 'pending').order('work_date'),
    supabase.from('bonuses').select('*').eq('org_id', orgId).eq('status', 'pending').order('period_month'),
    supabase.from('profiles').select('*').eq('org_id', orgId),
    supabase.from('tasks').select('id, title').eq('org_id', orgId),
    supabase.from('change_requests').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at'),
    supabase.from('password_requests').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at'),
    supabase.from('leave_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
    // Names for the ids a change request can mention.
    supabase.from('projects').select('*').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('accounts').select('id, name').eq('org_id', orgId),
    supabase.from('fixed_expenses').select('id, name').eq('org_id', orgId),
    supabase.from('violation_types').select('id, name').eq('org_id', orgId),
  ]);
  const named = new Map(namedR.flatMap((result) => rowsOf<{ id: string; name: string }>(result.data).map((row) => [row.id, row.name] as const)));
  const person = new Map(rowsOf<Profile>(peopleR.data).map((profile) => [profile.id, profile]));
  const taskTitle = new Map(rowsOf<Pick<Task, 'id' | 'title'>>(tasksR.data).map((task) => [task.id, task.title]));
  const who = (id: string) => person.get(id)?.full_name ?? '—';
  const role = (id: string) => person.get(id)?.job_title ?? null;

  const nameOf = (id: string) => person.get(id)?.full_name ?? named.get(id) ?? taskTitle.get(id);
  // Finished projects whose team has not been given points yet.
  const finished = rowsOf<{ id: string; name: string; status: string; points_awarded_at?: string | null }>(namedR[0]?.data).filter(
    (project) => project.status === 'completed' && 'points_awarded_at' in project && !project.points_awarded_at,
  );
  const leaveWaiting = rowsOf<{ id: string }>(leaveR.data).length;
  const changes = rowsOf<ChangeRequest>(changesR.data);
  const passwordRows = rowsOf<PasswordRequest>(passwordsR.data).map((row) => ({
    id: row.id,
    name: who(row.profile_id),
    role: role(row.profile_id),
    email: row.email,
    sent: localDateTime(row.created_at),
  }));

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

  // Sections, each with how many things wait in it.
  const counts: Record<Tab, number> = {
    requests: changes.length + passwordRows.length + leaveWaiting + finished.length,
    work: submissions.length,
    attendance: rowsOf<Attendance>(attendanceR.data).length,
    bonuses: rowsOf<Bonus>(bonusesR.data).length,
    emails: emailsWaiting,
  };
  const TABS: { key: Tab; label: string }[] = [
    { key: 'requests', label: 'Requests & changes' },
    { key: 'work', label: 'Work submissions' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'bonuses', label: 'Bonuses' },
    { key: 'emails', label: 'Emails' },
  ];
  const requested = TABS.find((item) => item.key === query.tab)?.key;
  // Without a choice, open the first section with something waiting.
  const tab: Tab = requested ?? TABS.find((item) => counts[item.key] > 0)?.key ?? 'requests';
  const tabHref = (key: Tab) => `/approvals?tab=${key}${month ? `&month=${month.slice(0, 7)}` : ''}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Everything waiting for a decision, by section.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Approval sections">
        {TABS.map((item) => (
          <Link key={item.key} href={tabHref(item.key)} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
            {counts[item.key] > 0 ? <span className="count">{counts[item.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === 'emails' ? <EmailSection /> : null}

      {tab === 'requests' ? (
      <>
      {passwordRows.length > 0 ? <PasswordRequests rows={passwordRows} /> : null}

      {leaveWaiting > 0 ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Leave requests <span className="count">{leaveWaiting}</span>
              </h2>
              <p className="muted">Approve or deny them on the Leave page.</p>
            </div>
            <Link href="/leave">Open Leave</Link>
          </header>
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Completed projects: give points
                <span className="count">{finished.length}</span>
              </h2>
              <p className="muted">These projects are finished and their teams have not been given points yet.</p>
            </div>
          </header>
          <div className="table-wrap">
            <table>
              <tbody>
                {finished.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td className="row-actions">
                      <Link href={`/projects/${project.id}#award`}>Give points</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
                    <td>
                      <ChangeSummary details={changeDetails(change, nameOf)} />
                    </td>
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
      </>
      ) : null}

      {tab === 'work' ? (

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
        quickActions={[
          { label: 'Approve', body: { review_status: 'approved' }, primary: true },
          { label: 'Request changes', body: { review_status: 'changes_requested' } },
        ]}
        emptyText="No submissions waiting for review."
      />
      ) : null}

      {tab === 'attendance' ? (
      <>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Attendance month</h2>
            <p className="muted">
              {month ? `Showing days waiting in ${monthLabel(month)}.` : 'Showing every day that is waiting. Pick a month to narrow it down.'}
            </p>
          </div>
          <MonthPicker value={month ? month.slice(0, 7) : ''} current={localDate(new Date().toISOString()).slice(0, 7)} allowAll keep={{ tab: 'attendance' }} />
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
      </>
      ) : null}

      {tab === 'bonuses' ? (

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
      ) : null}
    </>
  );
}
