import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { dateInZone, monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { roleTags, titleTags } from '@/lib/domain/roles';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import { getMonthlySummary, getOrgTimezone, getPointRules } from '@/lib/services/rewards';
import type { Attendance, Bonus, PointEntry, PointSettings, Profile, ProfileRole, Role, ViolationType } from '@/types/database';

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requested } = await searchParams;
  const { supabase, orgId, isAdmin, userId, can, localDate } = await getPageContext();
  const seesTeamPoints = can('team_points');
  const seesTeamBonuses = can('bonuses');

  const timeZone = await getOrgTimezone(supabase, orgId);
  const now = new Date();
  const currentMonth = monthStart(now, timeZone);
  const month = parseMonth(requested) ?? currentMonth;
  const today = dateInZone(now, timeZone);
  const monthEnded = month < currentMonth;

  const [rules, peopleR, attendanceR, entriesR, violationsR, settingsR, bonusesR, rolesR, heldR] = await Promise.all([
    getPointRules(supabase, orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('attendance').select('*').eq('org_id', orgId).gte('work_date', month).lt('work_date', nextMonth(month)).order('work_date', { ascending: false }),
    supabase.from('point_entries').select('*').eq('org_id', orgId).eq('period_month', month).order('created_at', { ascending: false }),
    supabase.from('violation_types').select('*').eq('org_id', orgId).order('name'),
    supabase.from('point_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('bonuses').select('*').eq('org_id', orgId).order('period_month', { ascending: false }),
    supabase.from('roles').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profile_roles').select('*').eq('org_id', orgId),
  ]);
  const people = rowsOf<Profile>(peopleR.data);
  const attendance = rowsOf<Attendance>(attendanceR.data);
  const entries = rowsOf<PointEntry>(entriesR.data);
  const violations = rowsOf<ViolationType>(violationsR.data);
  const settings = settingsR.data as PointSettings | null;
  const bonuses = rowsOf<Bonus>(bonusesR.data);
  const roles = rowsOf<Role>(rolesR.data);
  const held = rowsOf<ProfileRole>(heldR.data);

  let summary = await getMonthlySummary(supabase, orgId, month, rules);
  // Other people's points are only for roles that include the team points segment.
  if (!seesTeamPoints) summary = summary.filter((row) => row.employee_id === userId);

  const person = new Map(people.map((profile) => [profile.id, profile]));
  const nameOf = (id: string | null) => (id ? (person.get(id)?.full_name ?? '—') : null);
  const staff = peopleOptions(people);
  const markedToday = attendance.some((day) => day.employee_id === userId && day.work_date === today);

  const attendanceRows = attendance.map((day) => ({
    ...day,
    check_in: day.check_in ? day.check_in.slice(0, 5) : null,
    check_out: day.check_out ? day.check_out.slice(0, 5) : null,
    employee_name: nameOf(day.employee_id),
    verified_by_name: nameOf(day.verified_by),
  }));
  const entryRows = entries.map((entry) => ({
    ...entry,
    employee_name: nameOf(entry.employee_id),
    recorded_on: localDate(entry.created_at),
  }));
  const bonusRows = bonuses.map((bonus) => ({
    ...bonus,
    employee_name: nameOf(bonus.employee_id),
    month_label: monthLabel(bonus.period_month),
    decided_by_name: nameOf(bonus.decided_by),
  }));

  // Roles are tags: a person can hold several.
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const roleColor = new Map(roles.map((role) => [role.name, role.color]));
  const needsApproval = !isAdmin;
  const peopleRows = people.map((profile) => {
    const ids = held.filter((row) => row.profile_id === profile.id).map((row) => row.role_id);
    return {
      ...profile,
      role_ids: ids,
      role_names: roleTags(ids.map((id) => roleName.get(id)), roleColor),
    };
  });
  const personFields: Field[] = [
    { name: 'full_name', label: 'Full name', required: true },
    {
      name: 'role_ids',
      label: 'Roles',
      type: 'multiselect',
      required: true,
      options: options(roles, (role) => role.name),
      hint: 'Pick one or more. A person sees everything any of their roles allows.',
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
            <h2>{seesTeamPoints ? 'Monthly points' : 'My points this month'}</h2>
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
                  <td>
                    <span className="tags">
                      {titleTags(row.job_title, roleColor).map((tag) => (
                        <span key={tag.label} className={tag.color ? `badge tag-${tag.color}` : 'badge'}>
                          {tag.label}
                        </span>
                      ))}
                    </span>
                  </td>
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
            <h2>Mark attendance</h2>
            <p className="muted">
              {markedToday ? "Today's attendance is recorded." : 'Enter the time you arrived and the time you left.'}
            </p>
          </div>
        </header>
        {markedToday ? null : (
          <ApiForm
            endpoint="/api/attendance"
            submitLabel="Mark attendance"
            initial={{ work_date: today }}
            fields={[
              { name: 'work_date', label: 'Date', type: 'date', required: true },
              { name: 'check_in', label: 'Entry time', type: 'time', required: true },
              { name: 'check_out', label: 'Exit time', type: 'time', required: true },
              { name: 'note', label: 'Note' },
            ]}
          />
        )}
      </section>

      <ResourceManager
        title={`${seesTeamPoints ? 'Attendance' : 'My attendance'} in ${monthLabel(month)}`}
        endpoint="/api/attendance"
        rows={asRows(attendanceRows)}
        columns={[
          { key: 'work_date', label: 'Date' },
          { key: 'employee_name', label: 'Employee' },
          { key: 'check_in', label: 'Entry' },
          { key: 'check_out', label: 'Exit' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'verified_by_name', label: 'Verified by' },
          { key: 'note', label: 'Note' },
        ]}
        fields={[
          { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: staff },
          { name: 'work_date', label: 'Date', type: 'date', required: true, defaultValue: today },
          { name: 'check_in', label: 'Entry time', type: 'time' },
          { name: 'check_out', label: 'Exit time', type: 'time' },
          { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'verified', options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'note', label: 'Note' },
        ]}
        editFields={[
          { name: 'work_date', label: 'Date', type: 'date', required: true },
          { name: 'check_in', label: 'Entry time', type: 'time' },
          { name: 'check_out', label: 'Exit time', type: 'time' },
          { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['pending', 'verified', 'rejected']) },
          { name: 'note', label: 'Note' },
        ]}
        canWrite={isAdmin || seesTeamPoints}
        needsApproval={needsApproval}
        addLabel="Record attendance"
        emptyText="No data found."
      />

      <ResourceManager
        title={`${seesTeamPoints ? 'Point history' : 'My point history'} for ${monthLabel(month)}`}
        description={isAdmin ? 'Points from verified attendance and approved tasks are added automatically. You can also give or deduct points here, with a reason.' : seesTeamPoints ? 'You can give or deduct points for other people here, with a reason. Nothing counts until an admin approves it.' : 'Every point you earned or lost this month. Only an admin decides points.'}
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
          { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: isAdmin ? staff : staff.filter((person) => person.value !== userId) },
          {
            name: 'source',
            label: 'Type',
            type: 'select',
            required: true,
            defaultValue: 'adjustment',
            options: [
              { value: 'adjustment', label: 'Give points' },
              { value: 'violation', label: 'Deduct points (responsibility violation)' },
            ],
          },
          {
            name: 'violation_type_id',
            label: 'Violation type',
            type: 'select',
            options: options(violations.filter((type) => type.is_active), (type) => `${type.name} (−${type.deduction_points})`),
          },
          { name: 'points', label: 'Points', type: 'number', hint: 'How many points to give or deduct. For a deduction with a violation type chosen, leave empty to use that type\'s amount.' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true },
        ]}
        editFields={[
          { name: 'points', label: 'Points', type: 'number', required: true },
          { name: 'reason', label: 'Reason', type: 'textarea' },
        ]}
        fixedValues={{ month }}
        canWrite={isAdmin || seesTeamPoints}
        needsApproval={needsApproval}
        addLabel="Give or deduct points"
        emptyText="No data found."
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
        title={seesTeamBonuses ? 'Bonus records' : 'My bonuses'}
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
        canWrite={isAdmin || seesTeamBonuses}
        needsApproval={needsApproval}
        emptyText="No bonuses yet."
      />

      <ResourceManager
        title="Team"
        description={isAdmin ? 'Edit a person to change their roles; create or change the roles themselves under Roles & Access. Adding someone sends them an email invitation.' : undefined}
        endpoint="/api/employees"
        rows={asRows(peopleRows)}
        columns={[
          { key: 'full_name', label: 'Name' },
          { key: 'role_names', label: 'Roles', kind: 'tags' },
          { key: 'is_active', label: 'Active', kind: 'bool' },
        ]}
        fields={[{ name: 'email', label: 'Email', type: 'email', required: true }, ...personFields]}
        editFields={[...personFields, { name: 'is_active', label: 'Active', type: 'checkbox' }]}
        canWrite={isAdmin}
        allowDelete={false}
        addLabel="Invite employee"
      />

      {isAdmin || seesTeamPoints ? (
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
            needsApproval={needsApproval}
            addLabel="Add violation type"
            emptyText="No violation types yet."
          />

          {isAdmin ? (
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
          ) : null}
        </>
      ) : null}
    </>
  );
}
