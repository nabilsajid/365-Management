import { CalendarClock, Link2, Star } from 'lucide-react';
import Link from 'next/link';
import { ResourceManager } from '@/components/resource-manager';
import { label } from '@/lib/format';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import type { Profile, Project, ProjectMember, Task } from '@/types/database';

// The board's columns and which task statuses fall into each. A task sent back
// for changes needs the assignee's attention again, so it sits under "To do".
const COLUMNS = [
  { key: 'todo', title: 'To do', badge: 'badge', statuses: ['todo', 'changes_requested'] },
  { key: 'doing', title: 'In progress', badge: 'badge badge-in_progress', statuses: ['in_progress'] },
  { key: 'review', title: 'In review', badge: 'badge badge-submitted', statuses: ['submitted'] },
  { key: 'done', title: 'Done', badge: 'badge badge-approved', statuses: ['approved'] },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function shortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Everything a person is involved in: tasks assigned to them, the projects they
// are on, and every task in those projects, so the whole team sees the work.
// Shown as a board of cards by default, with the earlier tables under "List".
export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'list' ? 'list' : 'board';
  const { supabase, orgId, userId, localDate } = await getPageContext();
  const today = localDate(new Date().toISOString());

  const membershipsR = await supabase.from('project_members').select('*').eq('org_id', orgId).eq('profile_id', userId);
  const memberProjectIds = rowsOf<ProjectMember>(membershipsR.data).map((row) => row.project_id);

  const [mineR, teamR, projectsR, peopleR] = await Promise.all([
    supabase.from('tasks').select('*').eq('org_id', orgId).eq('assignee_id', userId).order('due_date', { ascending: true, nullsFirst: false }),
    memberProjectIds.length > 0
      ? supabase.from('tasks').select('*').eq('org_id', orgId).in('project_id', memberProjectIds).order('position')
      : Promise.resolve({ data: [] }),
    supabase.from('projects').select('id, name, status, due_date').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, job_title').eq('org_id', orgId),
  ]);
  const mine = rowsOf<Task>(mineR.data);
  const projectTasks = rowsOf<Task>(teamR.data);
  const teamTasks = projectTasks.filter((task) => task.assignee_id !== userId);
  const projects = rowsOf<Pick<Project, 'id' | 'name' | 'status' | 'due_date'>>(projectsR.data);
  const person = new Map(rowsOf<Pick<Profile, 'id' | 'full_name' | 'job_title'>>(peopleR.data).map((profile) => [profile.id, profile]));
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  const involved = new Set([...memberProjectIds, ...mine.map((task) => task.project_id)]);
  const myProjects = projects
    .filter((project) => involved.has(project.id))
    .map((project) => {
      // For projects the person is a member of, every task is visible, so real progress can be shown.
      const known = memberProjectIds.includes(project.id) ? projectTasks.filter((task) => task.project_id === project.id) : [];
      const approved = known.filter((task) => task.status === 'approved').length;
      return {
        ...project,
        href: `/projects/${project.id}`,
        total: known.length,
        approved,
        percent: known.length === 0 ? 0 : Math.round((approved / known.length) * 100),
        mine: mine.filter((task) => task.project_id === project.id && task.status !== 'approved').length,
      };
    });

  const toRow = (task: Task) => ({
    ...task,
    project_name: projectName.get(task.project_id) ?? '—',
    assignee_name: task.assignee_id ? (person.get(task.assignee_id)?.full_name ?? '—') : 'Unassigned',
    href: `/tasks/${task.id}`,
    overdue: Boolean(task.due_date) && task.due_date! < today && task.status !== 'approved',
    link_count: (task.file_links ?? []).length,
  });
  const myRows = mine.map(toRow);
  const teamRows = teamTasks.map(toRow);
  const openCount = myRows.filter((task) => task.status !== 'approved').length;

  const columns = [
    { key: 'title', label: 'Task', kind: 'nav' as const, hrefKey: 'href' },
    { key: 'project_name', label: 'Project' },
    { key: 'status', label: 'Status', kind: 'label' as const },
    { key: 'due_date', label: 'Due' },
    { key: 'file_links', label: 'Files', kind: 'links' as const },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Tasks</h1>
          <p className="muted">
            {openCount === 0
              ? 'Nothing is waiting on you right now.'
              : `${openCount} open ${openCount === 1 ? 'task' : 'tasks'}. Open a card to see the details and submit your work.`}
          </p>
        </div>
      </div>

      <nav className="tabs" aria-label="Task views">
        <Link href="/my-tasks" aria-current={view === 'board' ? 'page' : undefined}>
          Board
        </Link>
        <Link href="/my-tasks?view=list" aria-current={view === 'list' ? 'page' : undefined}>
          List
        </Link>
      </nav>

      {view === 'board' ? (
        <>
          <div className="board">
            {COLUMNS.map((column) => {
              const inColumn = myRows.filter((task) => (column.statuses as readonly string[]).includes(task.status));
              return (
                <section key={column.key} className="board-col" aria-label={column.title}>
                  <header className="board-head">
                    <span className={column.badge}>{column.title}</span>
                    <span className="count">{inColumn.length}</span>
                  </header>
                  {inColumn.length === 0 ? <p className="board-empty">Nothing here</p> : null}
                  {inColumn.map((task, index) => (
                    <Link key={task.id} href={task.href} className="project-card" style={{ animationDelay: `${index * 50}ms` }}>
                      <p className="project-name">{task.title}</p>
                      <p className="project-client">{task.project_name}</p>
                      {task.status === 'changes_requested' ? (
                        <span className="badge badge-changes_requested mt-2 justify-self-start">Changes requested</span>
                      ) : null}
                      <div className="project-foot">
                        <span className="project-tags">
                          {task.points_value ? (
                            <span className="project-meta" title="Points on approval">
                              <Star size={13} aria-hidden />
                              {task.points_value}
                            </span>
                          ) : null}
                          {task.link_count > 0 ? (
                            <span className="project-meta" title="Files attached">
                              <Link2 size={13} aria-hidden />
                              {task.link_count}
                            </span>
                          ) : null}
                        </span>
                        {task.due_date ? (
                          <span className={task.overdue ? 'badge badge-rejected' : 'badge'}>
                            <CalendarClock size={12} aria-hidden className="mr-1" />
                            {task.overdue ? 'Overdue · ' : ''}
                            {shortDate(task.due_date)}
                          </span>
                        ) : (
                          <span className="project-meta">No due date</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </section>
              );
            })}
          </div>

          <h2 className="section-title">
            My projects
            <span className="count">{myProjects.length}</span>
          </h2>
          {myProjects.length === 0 ? (
            <section className="panel">
              <p className="muted empty">You are not assigned to any project yet.</p>
            </section>
          ) : (
            <div className="card-grid">
              {myProjects.map((project, index) => (
                <Link key={project.id} href={project.href} className="project-card" style={{ animationDelay: `${index * 50}ms` }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="project-name">{project.name}</p>
                    <span className={`badge badge-${project.status}`}>{label(project.status)}</span>
                  </div>
                  <p className="project-client">
                    {project.mine === 0 ? 'No open tasks for you' : `${project.mine} open ${project.mine === 1 ? 'task' : 'tasks'} for you`}
                  </p>
                  {project.total > 0 ? (
                    <div className="project-progress">
                      <div
                        role="progressbar"
                        aria-label={`${project.name} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={project.percent}
                        className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
                      >
                        <div className="h-full rounded-full bg-success" style={{ width: `${project.percent}%` }} />
                      </div>
                      <span className="project-meta">
                        {project.approved} of {project.total} tasks approved
                      </span>
                    </div>
                  ) : null}
                  {project.due_date ? (
                    <div className="project-foot">
                      <span />
                      <span className="badge">
                        <CalendarClock size={12} aria-hidden className="mr-1" />
                        {shortDate(project.due_date)}
                      </span>
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}

          {teamRows.length > 0 ? (
            <>
              <h2 className="section-title">
                What my teammates are working on
                <span className="count">{teamRows.length}</span>
              </h2>
              <div className="card-grid">
                {teamRows.map((task, index) => (
                  <Link key={task.id} href={task.href} className="project-card" style={{ animationDelay: `${index * 40}ms` }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="project-name">{task.title}</p>
                      <span className={`badge badge-${task.status}`}>{label(task.status)}</span>
                    </div>
                    <p className="project-client">{task.project_name}</p>
                    <div className="project-foot">
                      <span className="avatars">
                        <span className="avatar" aria-hidden>
                          {task.assignee_id ? initials(task.assignee_name) : '?'}
                        </span>
                        <span className="project-meta ml-2">{task.assignee_name}</span>
                      </span>
                      {task.due_date ? (
                        <span className={task.overdue ? 'badge badge-rejected' : 'badge'}>
                          {task.overdue ? 'Overdue · ' : ''}
                          {shortDate(task.due_date)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <ResourceManager
            title="Assigned to me"
            description="Open a task to submit your work."
            endpoint="/api/tasks"
            rows={asRows(myRows.filter((task) => task.status !== 'approved'))}
            columns={columns}
            emptyText="Nothing is assigned to you right now."
          />

          <ResourceManager
            title="My projects"
            description="Projects you are assigned to. Open one to see its brief, links and team."
            endpoint="/api/projects"
            rows={asRows(myProjects)}
            columns={[
              { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
              { key: 'status', label: 'Status', kind: 'label' },
              { key: 'due_date', label: 'Due' },
            ]}
            emptyText="You are not assigned to any project yet."
          />

          <ResourceManager
            title="Other tasks in my projects"
            description="Tasks your teammates hold in the projects you are on."
            endpoint="/api/tasks"
            rows={asRows(teamRows)}
            columns={[
              { key: 'title', label: 'Task', kind: 'nav', hrefKey: 'href' },
              { key: 'project_name', label: 'Project' },
              { key: 'assignee_name', label: 'Assigned to' },
              { key: 'status', label: 'Status', kind: 'label' },
              { key: 'due_date', label: 'Due' },
            ]}
            emptyText="No other tasks in your projects."
          />

          <ResourceManager
            title="My approved tasks"
            endpoint="/api/tasks"
            rows={asRows(myRows.filter((task) => task.status === 'approved'))}
            columns={columns}
            emptyText="No approved tasks yet."
          />
        </>
      )}
    </>
  );
}
