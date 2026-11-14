import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MonthPicker } from '@/components/month-picker';
import { PrintButton } from '@/components/print-button';
import { monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { label, money, monthLabel } from '@/lib/format';
import { getPageContext, rowsOf } from '@/lib/page';
import { getOrgTimezone } from '@/lib/services/rewards';
import type { Expense, MonthlyPoints, Payment, Profile } from '@/types/database';

// Admin only: one month on a page, to read, print or save as a PDF.
export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, orgId, isAdmin, orgName } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');
  const timeZone = await getOrgTimezone(supabase, orgId);
  const currentMonth = monthStart(new Date(), timeZone);
  const month = parseMonth((await searchParams).month) ?? currentMonth;
  const until = nextMonth(month);

  const [paymentsR, expensesR, invoicesR, peopleR, pointsR, attendanceR, projectsR, tasksR] = await Promise.all([
    supabase.from('payments').select('*').eq('org_id', orgId).gte('paid_on', month).lt('paid_on', until),
    supabase.from('expenses').select('*').eq('org_id', orgId).gte('expense_date', month).lt('expense_date', until),
    supabase.from('invoices').select('id, amount, status').eq('org_id', orgId).gte('issue_date', month).lt('issue_date', until),
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('is_active', true).order('full_name'),
    supabase.from('monthly_points').select('*').eq('org_id', orgId).eq('period_month', month),
    supabase.from('attendance').select('employee_id, status').eq('org_id', orgId).gte('work_date', month).lt('work_date', until),
    supabase.from('projects').select('id, status, created_at').eq('org_id', orgId).gte('created_at', month).lt('created_at', until),
    supabase.from('tasks').select('id, status').eq('org_id', orgId).eq('status', 'approved'),
  ]);
  const payments = rowsOf<Payment>(paymentsR.data);
  const expenses = rowsOf<Expense>(expensesR.data);
  const invoices = rowsOf<{ id: string; amount: number; status: string }>(invoicesR.data).filter((row) => row.status !== 'void');
  const people = rowsOf<Profile>(peopleR.data);
  const points = new Map(rowsOf<MonthlyPoints>(pointsR.data).map((row) => [row.employee_id, row]));
  const attendance = rowsOf<{ employee_id: string; status: string }>(attendanceR.data);

  const received = payments.reduce((sum, row) => sum + Number(row.amount), 0);
  const invoiced = invoices.reduce((sum, row) => sum + Number(row.amount), 0);
  const spent = expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const byCategory = new Map<string, number>();
  for (const row of expenses) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + Number(row.amount ?? 0));
  const team = people
    .map((person) => ({
      name: person.full_name,
      role: person.job_title,
      points: Number(points.get(person.id)?.total_points ?? 0),
      days: attendance.filter((row) => row.employee_id === person.id && row.status === 'verified').length,
    }))
    .sort((a, b) => b.points - a.points);

  return (
    <>
      <div className="page-header no-print">
        <div>
          <p className="muted">
            <Link href="/cashflow">Cash Flow</Link> / Monthly summary
          </p>
          <h1>Monthly summary</h1>
        </div>
        <div className="header-tools">
          <MonthPicker value={month.slice(0, 7)} current={currentMonth.slice(0, 7)} />
          <PrintButton />
        </div>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>
              {orgName} · {monthLabel(month)}
            </h2>
            <p className="muted">Money in and out, work and the team for the month.</p>
          </div>
        </header>
        <div className="report-grid">
          {[
            ['Received', money(received)],
            ['Invoiced', money(invoiced)],
            ['Costs', money(spent)],
            ['Net (received − costs)', money(received - spent)],
            ['New projects', String(rowsOf(projectsR.data).length)],
            ['Deliverables done (all time)', String(rowsOf(tasksR.data).length)],
          ].map(([name, value]) => (
            <div key={name} className="stat-tile">
              <p className="muted" style={{ margin: 0 }}>{name}</p>
              <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Costs by type</h2>
        </header>
        {byCategory.size === 0 ? (
          <p className="muted">No costs this month.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {[...byCategory].sort((a, b) => b[1] - a[1]).map(([category, total]) => (
                  <tr key={category}>
                    <td>{label(category)}</td>
                    <td style={{ textAlign: 'right' }}>{money(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Team</h2>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Points</th>
                <th style={{ textAlign: 'right' }}>Days present</th>
              </tr>
            </thead>
            <tbody>
              {team.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.role ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.points}</td>
                  <td style={{ textAlign: 'right' }}>{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
