import { Download } from 'lucide-react';
import Link from 'next/link';
import { netPay } from '@/lib/domain/payroll';
import { hiddenSections } from '@/lib/domain/sections';
import { GivePointsForm } from '@/components/give-points-form';
import { MonthPicker } from '@/components/month-picker';
import { pointsStatement } from '@/lib/domain/points-statement';
import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { dateInZone, monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { roleTags, titleTags } from '@/lib/domain/roles';
import { money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import { buildMonthlySummary, getOrgTimezone, getPointRules } from '@/lib/services/rewards';
import type { Attendance, Bonus, MonthlyPoints, PointEntry, PointSettings, Profile, ProfileRole, Role, ViolationType } from '@/types/database';

// How each kind of point entry is named in the history.
const SOURCE_LABEL: Record<string, (points: number) => string> = {
  attendance: () => 'Attendance',
  task: () => 'Completed task',
  violation: () => 'Deduction',
  adjustment: (points) => (points >= 0 ? 'Given' : 'Taken away'),
};

const TABS = [
  { key: 'points', label: 'Points' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'bonuses', label: 'Bonuses' },
  { key: 'team', label: 'Team' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'settings', label: 'Rules' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// One topic per tab, so points, attendance, bonuses and the team list are not
// stacked on a single long page.
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const { month: requested, tab: requestedTab } = await searchParams;
  const { supabase, orgId, isAdmin, userId, can, canEdit, localDate } = await getPageContext();
  const seesTeamPoints = can('team_points');
  const seesTeamBonuses = can('bonuses');
  // Viewing and changing are separate: these say what this person may change.
  const editsTeamPoints = canEdit('team_points');
  const editsTeamBonuses = canEdit('bonuses');

  const timeZone = await getOrgTimezone(supabase, orgId);
  const now = new Date();
  const currentMonth = monthStart(now, timeZone);
  const month = parseMonth(requested) ?? currentMonth;
  const today = dateInZone(now, timeZone);
  const monthEnded = month < currentMonth;
  // The Rules tab holds violation types and point rules, for admins and roles with team points.
  // A company that switched off Points & rewards keeps only the team list here.
  const orgSettings = await supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle();
  const pointsOff = !orgSettings.error && hiddenSections((orgSettings.data as { settings?: unknown } | null)?.settings).includes('points');
  const tabs = TABS.filter((item) =>
    item.key === 'payroll' ? isAdmin : pointsOff ? item.key === 'team' : item.key !== 'settings' || isAdmin || seesTeamPoints,
  );
  const tab: Tab = tabs.some((item) => item.key === requestedTab) ? (requestedTab as Tab) : pointsOff ? 'team' : 'points';
  const href = (next: Tab) => `/employees?tab=${next}&month=${month.slice(0, 7)}`;
  const canGivePoints = editsTeamPoints;

  // Everything the page needs is fetched in one parallel round.
  const [rules, peopleR, attendanceR, entriesR, violationsR, settingsR, bonusesR, rolesR, heldR, totalsR, leaveR] = await Promise.all([
    getPointRules(supabase, orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('attendance').select('*').eq('org_id', orgId).gte('work_date', month).lt('work_date', nextMonth(month)).order('work_date', { ascending: false }),
    supabase.from('point_entries').select('*').eq('org_id', orgId).eq('period_month', month).order('created_at', { ascending: false }),
    supabase.from('violation_types').select('*').eq('org_id', orgId).order('name'),
    supabase.from('point_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('bonuses').select('*').eq('org_id', orgId).order('period_month', { ascending: false }),
    supabase.from('roles').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profile_roles').select('*').eq('org_id', orgId),
    supabase.from('monthly_points').select('*').eq('org_id', orgId).eq('period_month', month),
    // Approved leave overlapping this month, shown next to attendance.
    supabase.from('leave_requests').select('*').eq('org_id', orgId).eq('status', 'approved').lte('start_date', nextMonth(month)).gte('end_date', month),
  ]);
  // Points for the six months up to the one shown, for everyone (people who see team points).
  const historyMonths = Array.from({ length: 6 }, (_, back) => {
    const [year, monthNumber] = month.slice(0, 7).split('-').map(Number);
    const total = year * 12 + (monthNumber - 1) - back;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
  }).reverse();
  const historyR = seesTeamPoints
    ? await supabase.from('monthly_points').select('employee_id, period_month, total_points').eq('org_id', orgId).gte('period_month', historyMonths[0]).lte('period_month', month)
    : { data: [] };
  const history = new Map<string, number>();
  for (const row of rowsOf<{ employee_id: string; period_month: string; total_points: number }>(historyR.data)) {
    history.set(`${row.employee_id}|${row.period_month.slice(0, 10)}`, Number(row.total_points));
  }
  const onLeave = rowsOf<{ id: string; employee_id: string; start_date: string; end_date: string; reason: string }>(leaveR.data);
  const people = rowsOf<Profile>(peopleR.data);
  // Payroll (admins only): salaries, this month's payslips, and accounts to pay from.
  const payroll = await (async () => {
    if (tab !== 'payroll' || !isAdmin)
      return { ready: false, salary: new Map<string, number>(), slips: [], accounts: [] as { value: string; label: string }[], advances: [] as Record<string, unknown>[] };
    const [salaryR, slipR, accountR, advanceR, balanceR] = await Promise.all([
      supabase.from('salaries').select('profile_id, monthly_amount').eq('org_id', orgId),
      supabase.from('payslips').select('*').eq('org_id', orgId).eq('month', month),
      supabase.from('accounts').select('id, name').eq('org_id', orgId).order('name'),
      supabase.from('salary_advances').select('id, profile_id, amount, per_month, given_on, note').eq('org_id', orgId).order('given_on', { ascending: false }),
      supabase.from('advance_balances').select('advance_id, repaid, left_to_repay').eq('org_id', orgId),
    ]);
    const balance = new Map(rowsOf<{ advance_id: string; repaid: number; left_to_repay: number }>(balanceR.data).map((row) => [row.advance_id, row]));
    const name = new Map(people.map((profile) => [profile.id, profile.full_name]));
    return {
      ready: !salaryR.error && !slipR.error,
      salary: new Map(rowsOf<{ profile_id: string; monthly_amount: number }>(salaryR.data).map((row) => [row.profile_id, Number(row.monthly_amount)])),
      slips: rowsOf<{ id: string; profile_id: string; base_salary: number; bonus: number; additions: number; deductions: number; status: string }>(slipR.data)
        .map((row) => ({ ...row, full_name: name.get(row.profile_id) ?? '—', href: `/payslips/${row.id}`, net: netPay(row), account_id: '' }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
      accounts: rowsOf<{ id: string; name: string }>(accountR.data).map((row) => ({ value: row.id, label: row.name })),
      advances: rowsOf<{ id: string; profile_id: string; amount: number; per_month: number; given_on: string; note: string | null }>(advanceR.data).map((row) => {
        const left = Number(balance.get(row.id)?.left_to_repay ?? row.amount);
        return {
          ...row,
          full_name: name.get(row.profile_id) ?? '—',
          repaid: Number(balance.get(row.id)?.repaid ?? 0),
          left_to_repay: left,
          state: left > 0 ? 'repaying' : 'repaid',
        };
      }),
    };
  })();
  const attendance = rowsOf<Attendance>(attendanceR.data);
  const entries = rowsOf<PointEntry>(entriesR.data);
  const violations = rowsOf<ViolationType>(violationsR.data);
  const settings = settingsR.data as PointSettings | null;
  const bonuses = rowsOf<Bonus>(bonusesR.data);
  const roles = rowsOf<Role>(rolesR.data);
  const held = rowsOf<ProfileRole>(heldR.data);

  let summary = buildMonthlySummary(people, rowsOf<MonthlyPoints>(totalsR.data), rules);
  // Other people's points are only for roles that include the team points segment.
  if (!seesTeamPoints) summary = summary.filter((row) => row.employee_id === userId);

  const statement = pointsStatement(entries);
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
    source_label: SOURCE_LABEL[entry.source]?.(entry.points) ?? entry.source,
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
      standing: profile.is_active ? 'active' : 'suspended',
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
            Showing {monthLabel(month)}
            {month === currentMonth ? ' (current month)' : ''}. Points start from zero each month.
          </p>
        </div>
        <div className="header-tools">
          <MonthPicker value={month.slice(0, 7)} current={currentMonth.slice(0, 7)} keep={{ tab }} />
          <details className="export-menu">
            <summary className="button">
              <Download size={14} aria-hidden />
              Export
            </summary>
            <div>
              <a href={`/api/export?type=points&month=${month.slice(0, 7)}`} download>
                Points (CSV)
              </a>
              <a href={`/api/export?type=attendance&month=${month.slice(0, 7)}`} download>
                Attendance (CSV)
              </a>
              {isAdmin ? <Link href={`/report?month=${month.slice(0, 7)}`}>Monthly summary (print / PDF)</Link> : null}
              {isAdmin ? <Link href={`/kpi?month=${month.slice(0, 7)}`}>KPIs</Link> : null}
            </div>
          </details>
        </div>
      </div>

      <nav className="tabs" aria-label="Employees and rewards sections">
        {tabs.map((item) => (
          <Link key={item.key} href={href(item.key)} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'points' ? (
        <>
          {canGivePoints ? (
            <GivePointsForm
              people={isAdmin ? staff : staff.filter((person) => person.value !== userId)}
              month={month}
              needsApproval={needsApproval}
            />
          ) : null}

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>{seesTeamPoints ? 'Points this month' : 'My points this month'}</h2>
                <p className="muted">
                  Target {rules.monthly_target.toLocaleString('en-US')} points. Every {rules.bonus_step_points.toLocaleString('en-US')} points
                  above it earns a {money(rules.bonus_step_amount)} bonus, once approved.
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
                <h2>{seesTeamPoints ? 'Where the points came from' : 'Where my points came from'}</h2>
                <p className="muted">Every point this month, split by its source. The full list is below.</p>
              </div>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="num">Attendance</th>
                    <th className="num">Tasks</th>
                    <th className="num">Projects</th>
                    <th className="num">Given</th>
                    <th className="num">Deducted</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => {
                    const parts = statement.get(row.employee_id) ?? { attendance: 0, tasks: 0, projects: 0, given: 0, deducted: 0, total: 0 };
                    const show = (value: number) => (value === 0 ? '—' : value.toLocaleString('en-US'));
                    return (
                      <tr key={row.employee_id}>
                        <td>{row.full_name}</td>
                        <td className="num">{show(parts.attendance)}</td>
                        <td className="num">{show(parts.tasks)}</td>
                        <td className="num">{show(parts.projects)}</td>
                        <td className="num">{show(parts.given)}</td>
                        <td className="num">{show(parts.deducted)}</td>
                        <td className="num">
                          <strong>{parts.total.toLocaleString('en-US')}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <ResourceManager
            title={seesTeamPoints ? 'Point history' : 'My point history'}
            description={
              canGivePoints
                ? 'Every point given or deducted this month. Attendance and task points are added automatically.'
                : 'Every point you earned or lost this month. Only an admin decides points.'
            }
            endpoint="/api/points"
            rows={asRows(entryRows)}
            columns={[
              { key: 'recorded_on', label: 'Date' },
              { key: 'employee_name', label: 'Employee' },
              { key: 'source_label', label: 'Type' },
              { key: 'points', label: 'Points', kind: 'number' },
              { key: 'reason', label: 'Reason' },
            ]}
            fields={[
              { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: isAdmin ? staff : staff.filter((person) => person.value !== userId) },
              {
                name: 'violation_type_id',
                label: 'Violation type',
                type: 'select',
                options: options(violations.filter((type) => type.is_active), (type) => `${type.name} (−${type.deduction_points})`),
                hint: 'Optional. Add types under the Rules tab.',
              },
              { name: 'points', label: 'Points to deduct', type: 'number', hint: 'Leave empty to use the violation type\'s amount.' },
              { name: 'reason', label: 'Reason', type: 'textarea', required: true },
            ]}
            editFields={[
              { name: 'points', label: 'Points', type: 'number', required: true },
              { name: 'reason', label: 'Reason', type: 'textarea' },
            ]}
            fixedValues={{ month, source: 'violation' }}
            canWrite={canGivePoints}
            needsApproval={needsApproval}
            addLabel="Deduct points"
            emptyText="No data found."
          />

          {seesTeamPoints ? (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>Points by month</h2>
                  <p className="muted">Everyone&apos;s total for the six months up to {monthLabel(month)}. Every month is kept; pick an older month above to look further back.</p>
                </div>
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      {historyMonths.map((item) => (
                        <th key={item} className="num">
                          <Link href={`/employees?tab=points&month=${item.slice(0, 7)}`}>{new Date(`${item}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {people
                      .filter((profile) => profile.is_active)
                      .map((profile) => (
                        <tr key={profile.id}>
                          <td>{profile.full_name}</td>
                          {historyMonths.map((item) => {
                            const value = history.get(`${profile.id}|${item}`);
                            return (
                              <td key={item} className="num">
                                {value === undefined ? <span className="muted">—</span> : value.toLocaleString('en-US')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'attendance' ? (
        <>
          {onLeave.length > 0 ? (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>On leave this month</h2>
                  <p className="muted">Approved leave. No attendance is expected on these days.</p>
                </div>
              </header>
              <ul className="message-list">
                {onLeave.map((leave) => (
                  <li key={leave.id} className="message">
                    <div className="min-w-0 flex-1">
                      <p className="message-meta">
                        <strong>{nameOf(leave.employee_id)}</strong>
                      </p>
                      <p className="message-body">
                        {leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} to ${leave.end_date}`} · {leave.reason}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
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
            title={seesTeamPoints ? 'Attendance' : 'My attendance'}
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
            canWrite={editsTeamPoints}
            needsApproval={needsApproval}
            addLabel="Record attendance"
            emptyText="No data found."
          />
        </>
      ) : null}

      {tab === 'bonuses' ? (
        <>
          {isAdmin ? (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>Calculate bonuses</h2>
                  <p className="muted">
                    {monthEnded
                      ? `Works out who earned a bonus in ${monthLabel(month)}. Each one then waits for your approval below.`
                      : 'Bonuses can be calculated once the month has ended. Pick an earlier month above.'}
                  </p>
                </div>
                {monthEnded ? (
                  <ActionButton endpoint="/api/bonuses/calculate" body={{ month }} primary>
                    Calculate for {monthLabel(month)}
                  </ActionButton>
                ) : null}
              </header>
            </section>
          ) : null}

          <ResourceManager
            title={seesTeamBonuses ? 'Bonus records' : 'My bonuses'}
            description="A bonus is paid only after an admin approves it."
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
            canWrite={editsTeamBonuses}
            needsApproval={needsApproval}
            emptyText="No data found."
          />
        </>
      ) : null}

      {tab === 'payroll' && isAdmin ? (
        payroll.ready ? (
          <>
            <ResourceManager
              title="Salaries"
              description="Each person's monthly salary. Only admins see salaries."
              endpoint="/api/salaries"
              rows={asRows(
                people
                  .filter((profile) => profile.is_active)
                  .map((profile) => ({ id: profile.id, full_name: profile.full_name, monthly_amount: payroll.salary.get(profile.id) ?? null })),
              )}
              columns={[
                { key: 'full_name', label: 'Employee' },
                { key: 'monthly_amount', label: 'Monthly salary', kind: 'money' },
              ]}
              fields={undefined}
              editFields={[{ name: 'monthly_amount', label: 'Monthly salary', type: 'number', required: true }]}
              canWrite
              allowDelete={false}
              emptyText="No active employees."
              pageSize={25}
            />

            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>Payslips for {monthLabel(month)}</h2>
                  <p className="muted">
                    Each payslip starts with the salary and the bonus approved for that month (earned through points), with
                    days present, days on leave and points for reference. Unpaid leave (a day is the salary over 30) and
                    salary advance instalments are taken off as deductions. Adjust additions or deductions with Edit, then choose
                    the account it was paid from to mark it paid: that records the salary as an expense in Cash Flow. Paid
                    payslips can be printed or saved as a PDF, and each person sees their own. Deleting a paid payslip also
                    removes its salary expense.
                  </p>
                </div>
                <ActionButton endpoint="/api/payslips/generate" body={{ month }} primary>
                  Create payslips for {monthLabel(month)}
                </ActionButton>
              </header>
            </section>
            <ResourceManager
              title={`Payslips · ${monthLabel(month)}`}
              endpoint="/api/payslips"
              rows={asRows(payroll.slips)}
              columns={[
                { key: 'full_name', label: 'Employee', kind: 'nav', hrefKey: 'href' },
                { key: 'base_salary', label: 'Salary', kind: 'money' },
                { key: 'bonus', label: 'Bonus', kind: 'money' },
                { key: 'additions', label: 'Additions', kind: 'money' },
                { key: 'deductions', label: 'Deductions', kind: 'money' },
                { key: 'net', label: 'Take-home', kind: 'money' },
                { key: 'leave_days', label: 'Leave days', kind: 'number' },
                { key: 'status', label: 'Status', kind: 'label' },
              ]}
              editFields={[
                { name: 'base_salary', label: 'Salary', type: 'number' },
                { name: 'bonus', label: 'Bonus', type: 'number' },
                { name: 'additions', label: 'Other additions', type: 'number', hint: 'Overtime, allowances…' },
                { name: 'deductions', label: 'Deductions', type: 'number', hint: 'Already includes unpaid leave and advance instalments.' },
                { name: 'note', label: 'Note on the payslip', type: 'textarea' },
                {
                  name: 'account_id',
                  label: 'Paid from account',
                  type: 'select',
                  options: payroll.accounts,
                  hint: 'Choosing one marks it paid and records the salary in Cash Flow. Leave empty to keep it a draft.',
                },
              ]}
              canWrite
              emptyText={`No payslips for ${monthLabel(month)} yet. Set salaries above, then press Create payslips.`}
              pageSize={50}
            />

            <ResourceManager
              title="Salary advances"
              description="Money given ahead of salary. Each payslip created afterwards takes back the monthly amount until it is repaid. Choosing the account it came from records it in Cash Flow."
              endpoint="/api/advances"
              rows={asRows(payroll.advances)}
              columns={[
                { key: 'full_name', label: 'Employee' },
                { key: 'given_on', label: 'Given' },
                { key: 'amount', label: 'Amount', kind: 'money' },
                { key: 'per_month', label: 'Taken back monthly', kind: 'money' },
                { key: 'repaid', label: 'Repaid', kind: 'money' },
                { key: 'left_to_repay', label: 'Left', kind: 'money' },
                { key: 'state', label: 'Status', kind: 'label' },
              ]}
              fields={[
                {
                  name: 'profile_id',
                  label: 'Employee',
                  type: 'select',
                  required: true,
                  options: people.filter((profile) => profile.is_active).map((profile) => ({ value: profile.id, label: profile.full_name })),
                },
                { name: 'amount', label: 'Amount given', type: 'number', required: true },
                { name: 'per_month', label: 'Take back each month', type: 'number', required: true },
                { name: 'given_on', label: 'Given on', type: 'date', required: true, defaultValue: localDate(new Date().toISOString()) },
                { name: 'account_id', label: 'Paid from account', type: 'select', options: payroll.accounts, hint: 'Optional: records it in Cash Flow.' },
                { name: 'note', label: 'Note', type: 'textarea' },
              ]}
              canWrite
              emptyText="No salary advances."
              pageSize={25}
            />
          </>
        ) : (
          <section className="panel">
            <p className="muted">Payroll arrives with the next database update. Reload this page in a minute.</p>
          </section>
        )
      ) : null}

      {tab === 'team' ? (
        <ResourceManager
          title="Team"
          description={isAdmin ? 'Add, edit, suspend or delete people here. Contact details and passwords are under Profiles & Contacts; roles themselves under Roles & Access.' : undefined}
          endpoint="/api/employees"
          rows={asRows(peopleRows)}
          columns={[
            { key: 'full_name', label: 'Name' },
            { key: 'role_names', label: 'Roles', kind: 'tags' },
            { key: 'standing', label: 'Status', kind: 'label' },
          ]}
          fields={[
            { name: 'email', label: 'Login email', type: 'email', required: true },
            ...personFields,
            { name: 'password', label: 'Password', hint: 'Optional. Leave empty and one is chosen for you; find it under Profiles & Contacts, Login details.' },
          ]}
          editFields={[...personFields, { name: 'is_active', label: 'Allowed to sign in (untick to suspend)', type: 'checkbox' }]}
          canWrite={isAdmin}
          addLabel="Add employee"
        />
      ) : null}

      {tab === 'settings' ? (
        <>
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

          <ResourceManager
            title="Violation types"
            description="Ready-made deductions for responsibility violations, used by Deduct points."
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
            canWrite={editsTeamPoints}
            needsApproval={needsApproval}
            addLabel="Add violation type"
            emptyText="No violation types yet."
          />
        </>
      ) : null}
    </>
  );
}
