import { redirect } from 'next/navigation';
import { ResourceManager } from '@/components/resource-manager';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import type { Attendance, Bonus, Profile, Task, TaskSubmission } from '@/types/database';

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive', dropbox: 'Dropbox', text: 'Text note' };

export default async function ApprovalsPage() {
  const { supabase, orgId, isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/projects');

  const [submissionsR, attendanceR, bonusesR, peopleR, tasksR] = await Promise.all([
    supabase.from('task_submissions').select('*').eq('org_id', orgId).eq('review_status', 'pending').order('created_at'),
    supabase.from('attendance').select('*').eq('org_id', orgId).eq('status', 'pending').order('work_date'),
    supabase.from('bonuses').select('*').eq('org_id', orgId).eq('status', 'pending').order('period_month'),
    supabase.from('profiles').select('*').eq('org_id', orgId),
    supabase.from('tasks').select('id, title').eq('org_id', orgId),
  ]);
  const person = new Map(rowsOf<Profile>(peopleR.data).map((profile) => [profile.id, profile]));
  const taskTitle = new Map(rowsOf<Pick<Task, 'id' | 'title'>>(tasksR.data).map((task) => [task.id, task.title]));
  const who = (id: string) => person.get(id)?.full_name ?? '—';
  const role = (id: string) => person.get(id)?.job_title ?? null;

  const submissions = rowsOf<TaskSubmission>(submissionsR.data).map((row) => ({
    ...row,
    task_title: taskTitle.get(row.task_id) ?? 'Task',
    task_href: `/tasks/${row.task_id}`,
    by: who(row.submitted_by),
    kind_label: KIND_LABEL[row.kind] ?? row.kind,
    link_text: row.url ? 'Open link' : null,
    submitted_on: row.created_at.slice(0, 10),
  }));
  const attendance = rowsOf<Attendance>(attendanceR.data).map((row) => ({
    ...row,
    employee_name: who(row.employee_id),
    employee_role: role(row.employee_id),
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

      <ResourceManager
        title="Attendance"
        description="Verifying a day awards the attendance points."
        endpoint="/api/attendance"
        rows={asRows(attendance)}
        columns={[
          { key: 'work_date', label: 'Date' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'employee_role', label: 'Role' },
          { key: 'note', label: 'Note' },
        ]}
        editFields={[
          { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'note', label: 'Note' },
        ]}
        canWrite
        allowDelete={false}
        emptyText="No attendance waiting to be verified."
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
