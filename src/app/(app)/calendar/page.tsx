import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { eventsOn, monthGrid, shiftMonth, type CalendarEvent } from '@/lib/domain/calendar';
import { monthStart, parseMonth } from '@/lib/domain/points';
import { monthLabel } from '@/lib/format';
import { getPageContext, rowsOf } from '@/lib/page';
import { cn } from '@/lib/utils';
import type { Profile, Project, Task } from '@/types/database';

const KIND_LABEL: Record<CalendarEvent['kind'], string> = { leave: 'Leave', shoot: 'Shoot', deadline: 'Project due', task: 'Task due' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// One view of what is happening when: task and project deadlines, confirmed shoots and approved leave.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; mine?: string }> }) {
  const params = await searchParams;
  const { supabase, orgId, userId, timeZone, localDate } = await getPageContext();
  const today = localDate(new Date().toISOString());
  const current = monthStart(new Date(), timeZone);
  const month = parseMonth(params.month) ?? current;
  const mine = params.mine === '1';

  const weeks = monthGrid(month);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];

  const [tasksR, projectsR, membersR, leaveR, peopleR] = await Promise.all([
    supabase.from('tasks').select('*').eq('org_id', orgId).gte('due_date', from).lte('due_date', to),
    supabase.from('projects').select('*').eq('org_id', orgId),
    supabase.from('project_members').select('project_id, profile_id').eq('org_id', orgId).eq('profile_id', userId),
    supabase.from('leave_requests').select('*').eq('org_id', orgId).eq('status', 'approved').lte('start_date', to).gte('end_date', from),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
  ]);
  const name = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((person) => [person.id, person.full_name]));
  const myProjects = new Set(rowsOf<{ project_id: string }>(membersR.data).map((row) => row.project_id));
  const projects = rowsOf<Project>(projectsR.data);
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  const events: CalendarEvent[] = [];
  // Tasks of hidden (finished) projects stay inside their project.
  const hiddenProjects = new Set(projects.filter((project) => project.status === 'archived').map((project) => project.id));
  for (const task of rowsOf<Task>(tasksR.data).filter((item) => !hiddenProjects.has(item.project_id))) {
    if (!task.due_date || (mine && task.assignee_id !== userId)) continue;
    events.push({
      id: `t-${task.id}`,
      kind: 'task',
      title: task.title,
      start: task.due_date,
      end: task.due_date,
      href: `/tasks/${task.id}`,
      done: task.status === 'approved',
      detail: [projectName.get(task.project_id), task.assignee_id ? name.get(task.assignee_id) : 'Unassigned'].filter(Boolean).join(' · '),
    });
  }
  for (const project of projects) {
    if (mine && !myProjects.has(project.id)) continue;
    if (project.due_date && project.due_date >= from && project.due_date <= to) {
      events.push({ id: `p-${project.id}`, kind: 'deadline', title: project.name, start: project.due_date, end: project.due_date, href: `/projects/${project.id}`, done: project.status === 'completed' });
    }
    if (project.shoot_status === 'confirmed' && project.shoot_date && project.shoot_date >= from && project.shoot_date <= to) {
      events.push({ id: `s-${project.id}`, kind: 'shoot', title: project.name, start: project.shoot_date, end: project.shoot_date, href: `/projects/${project.id}` });
    }
  }
  for (const leave of rowsOf<{ id: string; employee_id: string; start_date: string; end_date: string }>(leaveR.data)) {
    if (mine && leave.employee_id !== userId) continue;
    events.push({ id: `l-${leave.id}`, kind: 'leave', title: `${name.get(leave.employee_id) ?? 'Someone'} away`, start: leave.start_date, end: leave.end_date, href: '/leave' });
  }

  const link = (next: { month?: string; mine?: boolean }) => {
    const query = new URLSearchParams();
    query.set('month', (next.month ?? month).slice(0, 7));
    if (next.mine ?? mine) query.set('mine', '1');
    return `/calendar?${query.toString()}`;
  };
  const inMonth = (day: string) => day.slice(0, 7) === month.slice(0, 7);
  const upcoming = weeks.flat().filter((day) => inMonth(day) && eventsOn(day, events).length > 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Deadlines, confirmed shoots and approved leave.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="tabs" aria-label="Whose events" style={{ marginBottom: 0 }}>
            <Link href={link({ mine: false })} aria-current={!mine ? 'page' : undefined}>
              Everyone
            </Link>
            <Link href={link({ mine: true })} aria-current={mine ? 'page' : undefined}>
              Mine
            </Link>
          </nav>
        </div>
      </div>

      <section className="panel">
        <header className="cal-head">
          <Link href={link({ month: shiftMonth(month, -1) })} className="cal-step" aria-label="Previous month">
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <h2>{monthLabel(month)}</h2>
          <Link href={link({ month: shiftMonth(month, 1) })} className="cal-step" aria-label="Next month">
            <ChevronRight size={16} aria-hidden />
          </Link>
          {month !== current ? (
            <Link href={link({ month: current })} className="cal-today">
              Today
            </Link>
          ) : null}
          <span className="cal-legend" aria-hidden>
            {(['task', 'deadline', 'shoot', 'leave'] as const).map((kind) => (
              <span key={kind}>
                <i className={`cal-dot cal-${kind}`} />
                {KIND_LABEL[kind]}
              </span>
            ))}
          </span>
        </header>

        <div className="cal-grid" role="grid" aria-label={monthLabel(month)}>
          {WEEKDAYS.map((day) => (
            <div key={day} className="cal-weekday" role="columnheader">
              {day}
            </div>
          ))}
          {weeks.flat().map((day) => {
            const items = eventsOn(day, events);
            return (
              <div key={day} role="gridcell" className={cn('cal-day', !inMonth(day) && 'cal-out', day === today && 'cal-today-cell')}>
                <span className="cal-num">{Number(day.slice(8))}</span>
                {items.slice(0, 3).map((item) => (
                  <Link key={item.id} href={item.href ?? '#'} className={cn('cal-event', `cal-${item.kind}`, item.done && 'cal-done')} title={item.detail ? `${item.title} · ${item.detail}` : item.title}>
                    {item.title}
                  </Link>
                ))}
                {items.length > 3 ? <span className="cal-more">+{items.length - 3} more</span> : null}
              </div>
            );
          })}
        </div>

        {/* On phones the grid is too small to read, so the month is also listed day by day. */}
        <div className="cal-list">
          {upcoming.length === 0 ? (
            <p className="muted">No data found.</p>
          ) : (
            upcoming.map((day) => (
              <div key={day} className="cal-list-day">
                <p className={cn('cal-list-date', day === today && 'text-primary')}>
                  {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </p>
                {eventsOn(day, events).map((item) => (
                  <Link key={item.id} href={item.href ?? '#'} className={cn('cal-list-item', item.done && 'cal-done')}>
                    <i className={`cal-dot cal-${item.kind}`} aria-hidden />
                    <span>
                      <strong>{item.title}</strong>
                      <span className="muted">
                        {KIND_LABEL[item.kind]}
                        {item.detail ? ` · ${item.detail}` : ''}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
