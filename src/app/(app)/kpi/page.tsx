import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MonthPicker } from '@/components/month-picker';
import { deliveryStats, monthsEnding, percent } from '@/lib/domain/kpi';
import { monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { money, monthLabel } from '@/lib/format';
import { getPageContext, rowsOf } from '@/lib/page';

const shortMonth = (month: string) => new Date(`${month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

// Admin only: how the work is going, month by month — on-time delivery, first-time
// approval, delivered against the fixed numbers per client, money received per
// client and points per person. Six months ending with the chosen one.
export default async function KpiPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, orgId, isAdmin, timeZone } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');
  const currentMonth = monthStart(new Date(), timeZone);
  const month = parseMonth((await searchParams).month) ?? currentMonth;
  const months = monthsEnding(month, 6);
  const from = months[0];
  const until = nextMonth(month);
  // A little earlier than the range, so a deliverable approved in range but sent before it still counts.
  const lookBack = new Date(Date.parse(`${from}T00:00:00Z`) - 92 * 86400000).toISOString();

  const [tasksR, subsR, paymentsR, invoicesR, clientsR, projectsR, monthsR, targetsR, pointsR, peopleR] = await Promise.all([
    supabase.from('tasks').select('id, due_date, status, month_id, project_id').eq('org_id', orgId).limit(20000),
    supabase.from('task_submissions').select('task_id, review_status, reviewed_at, created_at').eq('org_id', orgId).gte('created_at', lookBack).limit(20000),
    supabase.from('payments').select('invoice_id, amount, paid_on').eq('org_id', orgId).gte('paid_on', from).lt('paid_on', until),
    supabase.from('invoices').select('id, client_id').eq('org_id', orgId).limit(20000),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('projects').select('id, name, client_id').eq('org_id', orgId),
    supabase.from('project_months').select('id, project_id, month').eq('org_id', orgId).gte('month', from).lt('month', until),
    supabase.from('project_targets').select('project_id, quantity').eq('org_id', orgId),
    supabase.from('monthly_points').select('employee_id, period_month, total_points').eq('org_id', orgId).gte('period_month', from).lt('period_month', until),
    supabase.from('profiles').select('id, full_name, is_active').eq('org_id', orgId).order('full_name'),
  ]);

  const tasks = rowsOf<{ id: string; due_date: string | null; status: string; month_id: string | null; project_id: string }>(tasksR.data);
  const stats = deliveryStats(tasks, rowsOf(subsR.data), timeZone);
  const clientName = new Map(rowsOf<{ id: string; name: string }>(clientsR.data).map((row) => [row.id, row.name]));
  const invoiceClient = new Map(rowsOf<{ id: string; client_id: string }>(invoicesR.data).map((row) => [row.id, row.client_id]));
  const payments = rowsOf<{ invoice_id: string; amount: number; paid_on: string }>(paymentsR.data);
  const revenueByMonth = new Map<string, number>();
  const revenueByClient = new Map<string, number>();
  for (const row of payments) {
    const key = `${row.paid_on.slice(0, 7)}-01`;
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(row.amount));
    if (key === month) {
      const client = invoiceClient.get(row.invoice_id) ?? '';
      revenueByClient.set(client, (revenueByClient.get(client) ?? 0) + Number(row.amount));
    }
  }
  const points = rowsOf<{ employee_id: string; period_month: string; total_points: number }>(pointsR.data);
  const pointsByMonth = new Map<string, number>();
  for (const row of points) pointsByMonth.set(row.period_month, (pointsByMonth.get(row.period_month) ?? 0) + Number(row.total_points));

  // Monthly clients this month: delivered (approved) against their fixed numbers.
  const projects = new Map(rowsOf<{ id: string; name: string; client_id: string | null }>(projectsR.data).map((row) => [row.id, row]));
  const target = new Map<string, number>();
  for (const row of rowsOf<{ project_id: string; quantity: number }>(targetsR.data)) target.set(row.project_id, (target.get(row.project_id) ?? 0) + Number(row.quantity));
  const thisMonthIds = new Map(
    rowsOf<{ id: string; project_id: string; month: string }>(monthsR.data)
      .filter((row) => row.month === month)
      .map((row) => [row.id, row.project_id]),
  );
  const delivered = new Map<string, { total: number; approved: number }>();
  for (const task of tasks) {
    const projectId = task.month_id ? thisMonthIds.get(task.month_id) : undefined;
    if (!projectId) continue;
    const row = delivered.get(projectId) ?? { total: 0, approved: 0 };
    row.total += 1;
    if (task.status === 'approved') row.approved += 1;
    delivered.set(projectId, row);
  }
  const clientRows = [...new Set([...thisMonthIds.values()])]
    .map((projectId) => {
      const project = projects.get(projectId);
      const counts = delivered.get(projectId) ?? { total: 0, approved: 0 };
      const fixed = target.get(projectId) ?? 0;
      return {
        id: projectId,
        name: project?.name ?? '—',
        client: project?.client_id ? clientName.get(project.client_id) ?? '—' : '—',
        approved: counts.approved,
        total: counts.total,
        fixed,
        share: percent(counts.approved, fixed),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const revenueRows = [...revenueByClient.entries()]
    .map(([id, amount]) => ({ name: clientName.get(id) ?? 'Other', amount }))
    .sort((a, b) => b.amount - a.amount);
  const people = rowsOf<{ id: string; full_name: string; is_active: boolean }>(peopleR.data).filter((row) => row.is_active);
  const pointOf = (id: string, m: string) => Number(points.find((row) => row.employee_id === id && row.period_month === m)?.total_points ?? 0);

  const current = stats.get(month);
  const maxRevenue = Math.max(1, ...months.map((m) => revenueByMonth.get(m) ?? 0));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>KPIs</h1>
          <p className="muted">
            How the work is going, month by month. A deliverable counts in the month it was first approved: on time if
            approved by its due date, first time if it was never sent back for changes.
          </p>
        </div>
        <MonthPicker value={month.slice(0, 7)} current={currentMonth.slice(0, 7)} />
      </div>

      <section className="panel">
        <div className="report-grid">
          {[
            [`On-time delivery · ${monthLabel(month)}`, pct(percent(current?.onTime ?? 0, current?.withDue ?? 0)), `${current?.onTime ?? 0} of ${current?.withDue ?? 0} with a due date`],
            ['First-time approval', pct(percent(current?.firstTime ?? 0, current?.approved ?? 0)), `${current?.firstTime ?? 0} of ${current?.approved ?? 0} approved`],
            ['Delivered', String(current?.approved ?? 0), 'deliverables approved'],
            ['Received', money(revenueByMonth.get(month) ?? 0), `payments in ${monthLabel(month)}`],
          ].map(([name, value, note]) => (
            <div key={name} className="stat-tile">
              <p className="muted" style={{ margin: 0 }}>{name}</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{value}</p>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Month by month</h2>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">On time</th>
                <th className="num">First-time approval</th>
                <th className="num">Delivered</th>
                <th className="num">Received</th>
                <th>Received</th>
                <th className="num">Team points</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const row = stats.get(m);
                const revenue = revenueByMonth.get(m) ?? 0;
                return (
                  <tr key={m}>
                    <td>
                      <Link href={`/kpi?month=${m.slice(0, 7)}`}>{shortMonth(m)}</Link>
                    </td>
                    <td className="num">{pct(percent(row?.onTime ?? 0, row?.withDue ?? 0))}</td>
                    <td className="num">{pct(percent(row?.firstTime ?? 0, row?.approved ?? 0))}</td>
                    <td className="num">{row?.approved ?? 0}</td>
                    <td className="num">{money(revenue)}</td>
                    <td style={{ minWidth: 120 }}>
                      <span style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--accent, #4f46e5)', width: `${Math.round((revenue / maxRevenue) * 100)}%` }} />
                    </td>
                    <td className="num">{pointsByMonth.get(m) ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Monthly clients · {monthLabel(month)}</h2>
            <p className="muted">Approved deliverables against the fixed numbers set for each client.</p>
          </div>
        </header>
        {clientRows.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th className="num">Approved</th>
                  <th className="num">Fixed</th>
                  <th className="num">Done</th>
                  <th className="num">In this month</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/projects/${row.id}`}>{row.name}</Link>
                    </td>
                    <td>{row.client}</td>
                    <td className="num">{row.approved}</td>
                    <td className="num">{row.fixed || '—'}</td>
                    <td className="num">{pct(row.share)}</td>
                    <td className="num">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No monthly client work in {monthLabel(month)}.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Received per client · {monthLabel(month)}</h2>
          </div>
        </header>
        {revenueRows.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="num">Received</th>
                </tr>
              </thead>
              <tbody>
                {revenueRows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td className="num">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No payments in {monthLabel(month)}.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Points per person</h2>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                {months.map((m) => (
                  <th key={m} className="num">
                    {shortMonth(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.full_name}</td>
                  {months.map((m) => (
                    <td key={m} className="num">
                      {pointOf(person.id, m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
