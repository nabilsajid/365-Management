import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { dateInZone, monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { JOB_ROLES } from '@/lib/domain/roles';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import { getMonthlySummary, getOrgTimezone, getPointRules } from '@/lib/services/rewards';
import type { Attendance, Bonus, PointEntry, PointSettings, Profile, ViolationType } from '@/types/database';

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requested } = await searchParams;
  const { supabase, orgId, isAdmin, userId } = await getPageContext();

  const timeZone = await getOrgTimezone(supabase, orgId);
  const now = new Date();
  const currentMonth = monthStart(now, timeZone);
  const month = parseMonth(requested) ?? currentMonth;
  const today = dateInZone(now, timeZone);
  const monthEnded = month < currentMonth;

  const [rules, peopleR, attendanceR, entriesR, violationsR, settingsR, bonusesR] = await Promise.all([
    getPointRules(supabase, orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('attendance').select('*').eq('org_id', orgId).gte('work_date', month).lt('work_date', nextMonth(month)).order('work_date', { ascending: false }),
    supabase.from('point_entries').select('*').eq('org_id', orgId).eq('period_month', month).order('created_at', { ascending: false }),
    supabase.from('violation_types').select('*').eq('org_id', orgId).order('name'),
    supabase.from('point_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('bonuses').select('*').eq('org_id', orgId).order('period_month', { ascending: false }),
  ]);
  const people = rowsOf<Profile>(peopleR.data);
  const attendance = rowsOf<Attendance>(attendanceR.data);
  const entries = rowsOf<PointEntry>(entriesR.data);
  const violations = rowsOf<ViolationType>(violationsR.data);
  const settings = settingsR.data as PointSettings | null;
  const bonuses = rowsOf<Bonus>(bonusesR.data);

  let summary = await getMonthlySummary(supabase, orgId, month, rules);
  if (!isAdmin) summary = summary.filter((row) => row.employee_id === userId);

  const person = new Map(people.map((profile) => [profile.id, profile]));
  const nameOf = (id: string | null) => (id ? (person.get(id)?.full_name ?? '—') : null);
  const staff = peopleOptions(people);
  const markedToday = attendance.some((day) => day.employee_id === userId && day.work_date === today);

  const attendanceRows = attendance.map((day) => ({
    ...day,
    employee_name: nameOf(day.employee_id),
    verified_by_name: nameOf(day.verified_by),
  }));
  const entryRows = entries.map((entry) => ({
    ...entry,
    employee_name: nameOf(entry.employee_id),
    recorded_on: entry.created_at.slice(0, 10),
  }));
  const bonusRows = bonuses.map((bonus) => ({
    ...bonus,
    employee_name: nameOf(bonus.employee_id),
    month_label: monthLabel(bonus.period_month),
    decided_by_name: nameOf(bonus.decided_by),
  }));

  const profileFields: Field[] = [
    { name: 'full_name', label: 'Full name', required: true },
    {
      name: 'job_title',
      label: 'Role',
      type: 'select',
      required: true,
      options: JOB_ROLES.map((role) => ({ value: role, label: role })),
      hint: 'Admin has full edit access to everything. Every other role is an employee.',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Employees &amp; Rewards</h1>
          <p className="muted">
            Points start from zero on the first day of each month. Showing {monthLabel(month)}
            {month === currentMonth ? ' (current month)' : ''}.
          </p>
        </div>
        <form className="month-picker" method="get">
          <label className="field">
            <span>Month</span>
            <input type="month" name="month" defaultValue={month.slice(0, 7)} max={currentMonth.slice(0, 7)} />
          </label>
          <button type="submit">Show</button>
        </form>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Monthly points</h2>
            <p className="muted">
              Target {rules.monthly_target.toLocaleString('en-US')} points. Every {rules.bonus_step_points.toLocaleString('en-US')} points
              above the target earns a {money(rules.bonus_step_amount)} bonus, once approved. Deductions never reduce salary.
            </p>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th className="num">Earned</th>
                <th className="num">Deducted</th>
                <th className="num">Total</th>
                <th className="num">To target</th>
                <th className="num">{monthEnded ? 'Bonus earned' : 'Bonus so far'}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.full_name}</td>
                  <td>{row.job_title ?? '—'}</td>
                  <td className="num">{row.earned.toLocaleString('en-US')}</td>
                  <td className="num">{row.deducted.toLocaleString('en-US')}</td>
                  <td className="num">
                    <strong>{row.total.toLocaleString('en-US')}</strong>
                  </td>
                  <td className="num">{row.to_target === 0 ? 'Reached' : row.to_target.toLocaleString('en-US')}</td>
                  <td className="num">{money(row.projected_bonus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Attendance</h2>
            <p className="muted">
              Each office day an admin verifies earns {rules.attendance_points.toLocaleString('en-US')} points.
            </p>
          </div>
          {markedToday ? (
            <span className="muted">Today is marked.</span>
          ) : (
            <ActionButton endpoint="/api/attendance" body={{ work_date: today }} primary>
              Mark today&apos;s attendance
            </ActionButton>
          )}
        </header>
      </section>

      <ResourceManager
        title={`Attendance in ${monthLabel(month)}`}
        endpoint="/api/attendance"
        rows={asRows(attendanceRows)}
        columns={[
          { key: 'work_date', label: 'Date' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'verified_by_name', label: 'Verified by' },
          { key: 'note', label: 'Note' },
        ]}
        fields={[
          { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: staff },
          { name: 'work_date', label: 'Date', type: 'date', required: true, defaultValue: today },
          { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'verified', options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'note', label: 'Note' },
        ]}
        editFields={[
          { name: 'work_date', label: 'Date', type: 'date', required: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'note', label: 'Note' },
        ]}
        canWrite={isAdmin}
        addLabel="Record attendance"
        emptyText="No attendance recorded for this month."
      />

      <ResourceManager
        title={`Point history for ${monthLabel(month)}`}
        description="Attendance and task points are added automatically. Deductions and adjustments are recorded here with a reason."
        endpoint="/api/points"
        rows={asRows(entryRows)}
        columns={[
          { key: 'recorded_on', label: 'Date' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'source', label: 'Source', kind: 'label' },
          { key: 'points', label: 'Points', kind: 'number' },
          { key: 'reason', label: 'Reason' },
        ]}
        fields={[
          { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: staff },
          {
            name: 'source',
            label: 'Type',
            type: 'select',
            required: true,
            defaultValue: 'violation',
            options: [
              { value: 'violation', label: 'Responsibility violation (deduction)' },
              { value: 'adjustment', label: 'Manual adjustment' },
            ],
          },
          {
            name: 'violation_type_id',
            label: 'Violation type',
            type: 'select',
            options: options(violations.filter((type) => type.is_active), (type) => `${type.name} (−${type.deduction_points})`),
          },
          { name: 'points', label: 'Points', type: 'number', hint: 'Violation: overrides the type\'s deduction. Adjustment: use a minus sign to subtract.' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true },
        ]}
        editFields={[
          { name: 'points', label: 'Points', type: 'number', required: true },
          { name: 'reason', label: 'Reason', type: 'textarea' },
        ]}
        fixedValues={{ month }}
        canWrite={isAdmin}
        addLabel="Record deduction or adjustment"
        emptyText="No points recorded for this month."
      />

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Bonuses</h2>
            <p className="muted">A bonus is paid only after an admin approves it.</p>
          </div>
          {isAdmin && monthEnded ? (
            <ActionButton endpoint="/api/bonuses/calculate" body={{ month }} primary>
              Calculate bonuses for {monthLabel(month)}
            </ActionButton>
          ) : isAdmin ? (
            <span className="muted">Bonuses can be calculated once the month has ended.</span>
          ) : null}
        </header>
      </section>

      <ResourceManager
        title="Bonus records"
        endpoint="/api/bonuses"
        rows={asRows(bonusRows)}
        columns={[
          { key: 'month_label', label: 'Month' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'points_total', label: 'Points', kind: 'number' },
          { key: 'amount', label: 'Bonus', kind: 'money' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'decided_by_name', label: 'Decided by' },
        ]}
        editFields={[
          { name: 'status', label: 'Decision', type: 'select', required: true, options: enumOptions(['pending', 'approved', 'rejected']) },
        ]}
        canWrite={isAdmin}
        emptyText="No bonuses yet."
      />

      <ResourceManager
        title="Team"
        description={isAdmin ? 'Adding someone sends them an email invitation.' : undefined}
        endpoint="/api/employees"
        rows={asRows(people)}
        columns={[
          { key: 'full_name', label: 'Name' },
          { key: 'job_title', label: 'Role' },
          { key: 'access_role', label: 'Access', kind: 'label' },
          { key: 'is_active', label: 'Active', kind: 'bool' },
        ]}
        fields={[{ name: 'email', label: 'Email', type: 'email', required: true }, ...profileFields]}
        editFields={[...profileFields, { name: 'is_active', label: 'Active', type: 'checkbox' }]}
        canWrite={isAdmin}
        allowDelete={false}
        addLabel="Invite employee"
      />

      {isAdmin ? (
        <>
          <ResourceManager
            title="Violation types"
            description="Configurable deductions for responsibility violations."
            endpoint="/api/violation-types"
            rows={asRows(violations)}
            columns={[
              { key: 'name', label: 'Violation' },
              { key: 'deduction_points', label: 'Deduction', kind: 'number' },
              { key: 'is_active', label: 'Active', kind: 'bool' },
            ]}
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: 'Missed deadline' },
              { name: 'deduction_points', label: 'Points deducted', type: 'number', required: true },
              { name: 'is_active', label: 'Active', type: 'checkbox' },
            ]}
            canWrite
            addLabel="Add violation type"
            emptyText="No violation types yet."
          />

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Point rules</h2>
                <p className="muted">Changes apply to points awarded from now on.</p>
              </div>
            </header>
            <ApiForm
              endpoint="/api/point-settings"
              method="PATCH"
              submitLabel="Save rules"
              resetOnSuccess={false}
              initial={settings ? { ...settings } : { ...rules }}
              fields={[
                { name: 'monthly_target', label: 'Monthly target', type: 'number', required: true },
                { name: 'attendance_points', label: 'Points per verified office day', type: 'number', required: true },
                { name: 'default_task_points', label: 'Default points per completed task', type: 'number', required: true, hint: 'A task can set its own value.' },
                { name: 'bonus_step_points', label: 'Points per bonus step', type: 'number', required: true },
                { name: 'bonus_step_amount', label: 'Bonus per step (৳)', type: 'number', required: true },
              ]}
            />
          </section>
        </>
      ) : null}
    </>
  );
}
