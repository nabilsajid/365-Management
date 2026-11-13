import { CalendarClock, Link2, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { ProjectOnboardingForm } from '@/components/project-onboarding-form';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Profile, Project, ProjectMember, Task } from '@/types/database';

// The board groups projects into these columns, in this order.
const COLUMNS = ['onboarding', 'active', 'completed', 'archived'] as const;

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

// Two ways to look at the same projects: a board of cards grouped by status
// (the default), or the list, which is also where projects are edited.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'list' ? 'list' : 'board';
  const { supabase, orgId, isAdmin, canEdit: canEditSegment, localDate } = await getPageContext();
  const today = localDate(new Date().toISOString());
  // Everyone can look at projects and comment on them; changing them needs the projects role.
  const canEdit = canEditSegment('projects');

  const [clientsResult, projectsResult, tasksResult, peopleResult, membersResult] = await Promise.all([
    supabase.from('clients').select('*').eq('org_id', orgId),
    supabase.from('projects').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, project_id, status').eq('org_id', orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('org_id', orgId),
  ]);
  const clients = rowsOf<Client>(clientsResult.data);
  const projects = rowsOf<Project>(projectsResult.data);
  const tasks = rowsOf<Pick<Task, 'id' | 'project_id' | 'status'>>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const members = rowsOf<ProjectMember>(membersResult.data);

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const personName = new Map(people.map((profile) => [profile.id, profile.full_name]));
  const staff = peopleOptions(people);

  const projectRows = projects.map((project) => {
    const own = tasks.filter((task) => task.project_id === project.id);
    const approved = own.filter((task) => task.status === 'approved').length;
    const memberIds = members.filter((row) => row.project_id === project.id).map((row) => row.profile_id);
    return {
      ...project,
      total: own.length,
      approved,
      percent: own.length === 0 ? 0 : Math.round((approved / own.length) * 100),
      client_name: project.client_id ? (clientName.get(project.client_id) ?? null) : null,
      member_ids: memberIds,
      team: memberIds.map((id) => personName.get(id) ?? '').filter(Boolean).sort(),
      progress: own.length === 0 ? 'No tasks' : `${approved} of ${own.length} approved`,
      href: `/projects/${project.id}`,
    };
  });

  const projectFields: Field[] = [
    { name: 'name', label: 'Project name', required: true },
    { name: 'client_name', label: 'Client', placeholder: 'Optional', hint: 'Type a name, or leave empty for an internal project.' },
    { name: 'status', label: 'Status', type: 'select', options: enumOptions(['onboarding', 'active', 'completed', 'archived']), required: true },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'brief', label: 'Project brief', type: 'textarea' },
    { name: 'member_ids', label: 'Assigned employees', type: 'multiselect', options: staff },
    { name: 'file_links', label: 'Links', type: 'links' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">
            {view === 'board' ? 'Every project as a card, grouped by status. Open one to see its tasks.' : canEdit ? 'Every project in a table. Use Edit here to change a project.' : 'Every project in a table.'}
          </p>
        </div>
      </div>

      {canEdit ? <ProjectOnboardingForm people={staff} needsApproval={!isAdmin} /> : null}

      <nav className="tabs" aria-label="Project views">
        <Link href="/projects" aria-current={view === 'board' ? 'page' : undefined}>
          Board
        </Link>
        <Link href="/projects?view=list" aria-current={view === 'list' ? 'page' : undefined}>
          List
        </Link>
      </nav>

      {view === 'board' ? (
        projectRows.length === 0 ? (
          <section className="panel">
            <p className="muted empty">No projects yet. Use &quot;Add project&quot; above to create the first one.</p>
          </section>
        ) : (
          <div className="board">
            {COLUMNS.filter((status) => status !== 'archived' || projectRows.some((project) => project.status === 'archived')).map((status) => {
              const inColumn = projectRows.filter((project) => project.status === status);
              return (
                <section key={status} className="board-col" aria-label={label(status)}>
                  <header className="board-head">
                    <span className={`badge badge-${status}`}>{label(status)}</span>
                    <span className="count">{inColumn.length}</span>
                  </header>
                  {inColumn.length === 0 ? <p className="board-empty">Nothing here</p> : null}
                  {inColumn.map((project, index) => {
                    const overdue = Boolean(project.due_date) && project.due_date! < today && status !== 'completed' && status !== 'archived';
                    return (
                      <Link key={project.id} href={project.href} className="project-card" style={{ animationDelay: `${index * 50}ms` }}>
                        <p className="project-name">{project.name}</p>
                        <p className="project-client">{project.client_name ?? 'Internal project'}</p>

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
                            <ListChecks size={13} aria-hidden />
                            {project.total === 0 ? 'No tasks yet' : `${project.approved} of ${project.total} tasks approved`}
                          </span>
                        </div>

                        <div className="project-foot">
                          <span className="avatars" aria-label={project.team.length === 0 ? 'Nobody assigned' : `Team: ${project.team.join(', ')}`}>
                            {project.team.slice(0, 4).map((name) => (
                              <span key={name} className="avatar" title={name}>
                                {initials(name)}
                              </span>
                            ))}
                            {project.team.length > 4 ? <span className="avatar">+{project.team.length - 4}</span> : null}
                            {project.team.length === 0 ? <span className="project-meta">Nobody assigned</span> : null}
                          </span>
                          <span className="project-tags">
                            {(project.file_links ?? []).length > 0 ? (
                              <span className="project-meta" title="Links attached">
                                <Link2 size={13} aria-hidden />
                                {(project.file_links ?? []).length}
                              </span>
                            ) : null}
                            {project.due_date ? (
                              <span className={overdue ? 'badge badge-rejected' : 'badge'}>
                                <CalendarClock size={12} aria-hidden className="mr-1" />
                                {overdue ? 'Overdue · ' : ''}
                                {shortDate(project.due_date)}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <>
          <ResourceManager
            title="All projects"
            endpoint="/api/projects"
            rows={asRows(projectRows)}
            columns={[
              { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
              { key: 'client_name', label: 'Client' },
              { key: 'team', label: 'Team', kind: 'tags' },
              { key: 'status', label: 'Status', kind: 'label' },
              { key: 'progress', label: 'Tasks' },
              { key: 'due_date', label: 'Due' },
              { key: 'file_links', label: 'Links', kind: 'links' },
            ]}
            editFields={projectFields}
            canWrite={canEdit}
            needsApproval={!isAdmin}
            allowCreate={false}
            emptyText='No projects yet. Use "Add project" above to create the first one.'
          />
        </>
      )}
    </>
  );
}
