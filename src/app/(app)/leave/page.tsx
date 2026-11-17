import type { ReactNode } from 'react';
import { MonthPicker } from '@/components/month-picker';
import { ActionButton, ApiForm } from '@/components/resource-manager';
import { monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { monthLabel } from '@/lib/format';
import { getPageContext, rowsOf } from '@/lib/page';
import type { LeaveRequest, Profile } from '@/types/database';

const days = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
/** Days of a leave that fall inside the month starting `month` (YYYY-MM-01). */
const daysInMonth = (row: { start_date: string; end_date: string }, month: string) => {
  const last = new Date(Date.parse(nextMonth(month)) - 86400000).toISOString().slice(0, 10);
  const from = row.start_date > month ? row.start_date : month;
  const to = row.end_date < last ? row.end_date : last;
  return to < from ? 0 : days(from, to);
};

// Ask for leave, see your requests, and (admins and HR) decide. Every month's leave stays on record:
// pick a month to see who was away and for how many days. Approved leave also shows on the calendar.
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: requested } = await searchParams;
  const { supabase, orgId, userId, isAdmin, canEdit, timeZone, localDate } = await getPageContext();
  // HR: people who edit Employees & Rewards decide leave too (not their own).
  const decides = isAdmin || canEdit('team_points');
  const currentMonth = monthStart(new Date(), timeZone);
  const month = parseMonth(requested) ?? currentMonth;
  const [leaveR, peopleR] = await Promise.all([
    supabase.from('leave_requests').select('*').eq('org_id', orgId).order('start_date', { ascending: false }).limit(3000),
    supabase.from('profiles').select('id, full_name, job_title').eq('org_id', orgId),
  ]);
  const person = new Map(rowsOf<Pick<Profile, 'id' | 'full_name' | 'job_title'>>(peopleR.data).map((row) => [row.id, row]));

  if (leaveR.error) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Leave</h1>
          </div>
        </div>
        <section className="panel">
          <p className="muted">
            Leave requests need a database update first. An admin has to run the file
            <code> 20261112000026_rules_leave_notifications.sql </code>
            in the Supabase SQL Editor, then reload this page.
          </p>
        </section>
      </>
    );
  }

  const all = rowsOf<LeaveRequest>(leaveR.data);
  const today = localDate(new Date().toISOString());
  const mine = all.filter((row) => row.employee_id === userId);
  const waiting = all.filter((row) => row.status === 'pending' && row.employee_id !== userId);
  // Every request touching the chosen month, and approved days per person in it.
  const inMonth = all
    .filter((row) => row.start_date < nextMonth(month) && row.end_date >= month)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const perPerson = new Map<string, number>();
  for (const row of inMonth) if (row.status === 'approved') perPerson.set(row.employee_id, (perPerson.get(row.employee_id) ?? 0) + daysInMonth(row, month));
  const totals = [...perPerson.entries()].sort((a, b) => b[1] - a[1]);
  const upcoming = all.filter((row) => row.status === 'approved' && row.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));

  const line = (row: LeaveRequest, actions: ReactNode) => {
    const who = person.get(row.employee_id);
    return (
      <li key={row.id} className="message">
        <div className="min-w-0 flex-1">
          <p className="message-meta">
            <strong>{who?.full_name ?? '—'}</strong>
            {who?.job_title ? <span> · {who.job_title}</span> : null}
          </p>
          <p className="message-body">
            {row.start_date === row.end_date ? row.start_date : `${row.start_date} to ${row.end_date}`} · {days(row.start_date, row.end_date)}{' '}
            {days(row.start_date, row.end_date) === 1 ? 'day' : 'days'}
          </p>
          <p className="message-meta">{row.reason}</p>
        </div>
        {actions}
      </li>
    );
  };
  const badge = (row: LeaveRequest) => (
    <span className={row.status === 'approved' ? 'badge badge-approved' : row.status === 'denied' ? 'badge badge-rejected' : 'badge badge-pending'}>
      {row.status === 'pending' ? 'Waiting' : row.status === 'approved' ? 'Approved' : 'Denied'}
    </span>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leave</h1>
          <p className="muted">Ask for days off. Admins and HR are notified and decide; approved leave shows on the calendar.</p>
        </div>
        <MonthPicker value={month.slice(0, 7)} current={nextMonth(currentMonth).slice(0, 7)} />
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Ask for leave</h2>
          </div>
        </header>
        <ApiForm
          endpoint="/api/leave"
          submitLabel="Send request"
          fields={[
            { name: 'start_date', label: 'First day', type: 'date', required: true },
            { name: 'end_date', label: 'Last day', type: 'date', required: true },
            { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Family visit' },
          ]}
        />
      </section>

      {decides && waiting.length > 0 ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Waiting for you <span className="count">{waiting.length}</span>
              </h2>
            </div>
          </header>
          <ul className="message-list">
            {waiting.map((row) =>
              line(
                row,
                <span className="row-actions">
                  <ActionButton endpoint={`/api/leave/${row.id}`} method="PATCH" body={{ status: 'approved' }} primary>
                    Approve
                  </ActionButton>
                  <ActionButton endpoint={`/api/leave/${row.id}`} method="PATCH" body={{ status: 'denied' }}>
                    Deny
                  </ActionButton>
                </span>,
              ),
            )}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Leave in {monthLabel(month)}</h2>
            <p className="muted">
              {decides
                ? 'Every request that touches this month, with its decision. Pick another month above to see its record.'
                : 'Approved leave this month, and your own requests. Pick another month above.'}
            </p>
          </div>
        </header>
        {totals.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Days on leave in {monthLabel(month)}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map(([id, count]) => (
                  <tr key={id}>
                    <td>{person.get(id)?.full_name ?? '—'}</td>
                    <td className="num">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {inMonth.length > 0 ? (
          <ul className="message-list">{inMonth.map((row) => line(row, badge(row)))}</ul>
        ) : (
          <p className="muted">No leave in {monthLabel(month)}.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>My requests</h2>
          </div>
        </header>
        {mine.length > 0 ? (
          <ul className="message-list">
            {mine.map((row) =>
              line(
                row,
                <span className="row-actions">
                  {badge(row)}
                  {row.status === 'pending' ? (
                    <ActionButton endpoint={`/api/leave/${row.id}`} method="DELETE">
                      Withdraw
                    </ActionButton>
                  ) : null}
                </span>,
              ),
            )}
          </ul>
        ) : (
          <p className="muted">No data found.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Who is away</h2>
            <p className="muted">Approved leave from today onwards.</p>
          </div>
        </header>
        {upcoming.length > 0 ? <ul className="message-list">{upcoming.map((row) => line(row, badge(row)))}</ul> : <p className="muted">No one is on leave.</p>}
      </section>
    </>
  );
}
