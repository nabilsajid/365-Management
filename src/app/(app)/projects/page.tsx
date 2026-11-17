import { Camera, CalendarClock, CalendarSync, Link2, ListChecks, Pencil } from 'lucide-react';
import { Avatar, loadPhotos } from '@/components/avatar';
import Link from 'next/link';
import { ProjectOnboardingForm } from '@/components/project-onboarding-form';
import { ActionButton, ResourceManager } from '@/components/resource-manager';
import { PortalSettings } from '@/components/portal-settings';
import { ShareLink } from '@/components/share-link';
import type { Field } from '@/components/types';
import { monthName } from '@/components/month-bar';
import { TASK_KIND_LABEL, deliveryCounts } from '@/lib/domain/deliverables';
import { monthStart } from '@/lib/domain/points';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Profile, Project, ProjectMember, Task } from '@/types/database';

// The board groups projects into these columns, in this order.
const COLUMNS = ['onboarding', 'active', 'completed', 'archived'] as const;


function shortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Two ways to look at the same projects: a board of cards grouped by status
// (the default), or the list, which is also where projects are edited.
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; hidden?: string }> }) {
  const { view: requestedView, hidden: showHiddenParam } = await searchParams;
  // Hidden (archived) projects stay off the board unless asked for.
  const showHidden = showHiddenParam === '1';
  const view = requestedView === 'list' ? 'list' : requestedView === 'clients' ? 'clients' : 'board';
  const { supabase, orgId, isAdmin, can, canEdit: canEditSegment, localDate, timeZone } = await getPageContext();
  const thisMonth = monthStart(new Date(), timeZone);
  const today = localDate(new Date().toISOString());
  // Everyone can look at projects and comment on them; changing them needs the projects role.
  const canEdit = canEditSegment('projects');

  const [clientsResult, projectsResult, tasksResult, typesProbe, directProbe, peopleResult, membersResult, monthsResult] = await Promise.all([
    supabase.from('clients').select('*').eq('org_id', orgId),
    supabase.from('projects').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, project_id, status').eq('org_id', orgId),
    // Deliverable types arrive with a database update; until then the form leaves them out.
    supabase.from('tasks').select('kind').limit(1),
    // After the project rules database update, project roles change things without admin approval.
    supabase.from('notifications').select('id').limit(1),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('org_id', orgId),
    // The months of monthly clients (after the monthly clients database update).
    supabase.from('project_months').select('id, project_id, month, status').eq('org_id', orgId).order('month', { ascending: false }),
  ]);
  const months = monthsResult.error ? [] : rowsOf<{ id: string; project_id: string; month: string; status: string }>(monthsResult.data);
  const monthlyReady = !monthsResult.error;
  const [monthTasksResult, targetsResult] = monthlyReady
    ? await Promise.all([
        supabase.from('tasks').select('month_id, status, is_extra, kind').eq('org_id', orgId).not('month_id', 'is', null),
        supabase.from('project_targets').select('project_id, kind, quantity').eq('org_id', orgId),
      ])
    : [{ data: [] }, { data: [] }];
  const allTargets = rowsOf<{ project_id: string; kind: string; quantity: number }>(targetsResult.data);
  const monthTasks = rowsOf<{ month_id: string; status: string; is_extra: boolean; kind: string | null }>(monthTasksResult.data);
  const typesReady = !typesProbe.error;
  // Clients are visible to roles that can view projects or cash flow.
  const seesClients = can('projects') || can('cashflow');
  const editsClients = canEditSegment('projects') || canEditSegment('cashflow');
  const needsApproval = !isAdmin && Boolean(directProbe.error);
  const clients = rowsOf<Client>(clientsResult.data);
  const projects = rowsOf<Project>(projectsResult.data);
  const tasks = rowsOf<Pick<Task, 'id' | 'project_id' | 'status'>>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const members = rowsOf<ProjectMember>(membersResult.data);

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const personName = new Map(people.map((profile) => [profile.id, profile.full_name]));
  const photos = await loadPhotos(supabase, orgId);
  // Client portal links (Clients view).
  const portalsR = view === 'clients' && canEdit ? await supabase.from('client_portals').select('*').eq('org_id', orgId) : { data: [], error: null };
  const portalsReady = !portalsR.error;
  const activePortals = ((portalsR.data ?? []) as { client_id: string; token: string; is_active: boolean; show_invoices?: boolean; show_drafts?: boolean }[]).filter(
    (row) => row.is_active,
  );
  const portalToken = new Map(activePortals.map((row) => [row.client_id, row.token]));
  const portalOf = new Map(activePortals.map((row) => [row.client_id, row]));
  const photoByName = new Map(people.filter((profile) => photos.has(profile.id)).map((profile) => [profile.full_name, photos.get(profile.id)!]));
  const staff = peopleOptions(people);

  const isMonthly = (project: Project) => (project as Project & { kind?: string }).kind === 'monthly';
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
      type_label: isMonthly(project) ? 'Monthly client' : 'One-time',
    };
  });
  // Monthly clients: one card each, showing the month in progress.
  const monthlyCards = projectRows
    .filter((project) => isMonthly(project) && project.status !== 'archived')
    .map((project) => {
      const month = months.find((row) => row.project_id === project.id && row.month === thisMonth) ?? months.find((row) => row.project_id === project.id);
      const own = month ? monthTasks.filter((task) => task.month_id === month.id) : [];
      const done = own.filter((task) => task.status === 'approved').length;
      return {
        ...project,
        month,
        done,
        total: own.length,
        extras: own.filter((task) => task.is_extra).length,
        percent: own.length === 0 ? 0 : Math.round((done / own.length) * 100),
        // "3/5 videos · 2/5 thumbnails · 4 photos": delivered this month against targets.
        counter: deliveryCounts(own, allTargets.filter((row) => row.project_id === project.id))
          .map((row) => (row.target !== null ? `${row.delivered}/${row.target} ${TASK_KIND_LABEL[row.kind].toLowerCase()}` : `${row.delivered} ${TASK_KIND_LABEL[row.kind].toLowerCase()}`))
          .join(' · '),
      };
    });
  const oneTimeRows = projectRows.filter((project) => !isMonthly(project));
  // Hidden projects (status "archived"), one-time and monthly, shown only with "Show hidden".
  const hiddenCount = projectRows.filter((project) => project.status === 'archived').length;
  const hideButton = (project: { id: string; status: string }) =>
    !canEdit ? null : project.status === 'completed' ? (
      <ActionButton endpoint={`/api/projects/${project.id}`} method="PATCH" body={{ status: 'archived' }}>
        Hide
      </ActionButton>
    ) : project.status === 'archived' ? (
      <ActionButton endpoint={`/api/projects/${project.id}`} method="PATCH" body={{ status: 'completed' }}>
        Show on board
      </ActionButton>
    ) : null;

  // The shoot status arrives with a database update; until then the fields are left out.
  const shootReady = projects.some((project) => 'shoot_status' in project);
  const shootFields: Field[] = shootReady
    ? [
        {
          name: 'shoot_status',
          label: 'Shoot',
          type: 'select',
          options: [
            { value: 'none', label: 'No shoot planned' },
            { value: 'waiting', label: 'Waiting for client confirmation' },
            { value: 'confirmed', label: 'Confirmed' },
          ],
        },
        { name: 'shoot_date', label: 'Shoot date', type: 'date' },
      ]
    : [];

  const projectFields: Field[] = [
    { name: 'name', label: 'Project name', required: true },
    { name: 'client_name', label: 'Client', placeholder: 'Optional', hint: 'Type a name, or leave empty for an internal project.' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [...enumOptions(['onboarding', 'active', 'completed']), { value: 'archived', label: 'Hidden (finished, off the board)' }],
      required: true,
    },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    ...shootFields,
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
            {view === 'clients' ? 'Everyone you work for, with their contact details.' : view === 'board' ? 'Every project as a card, grouped by status. Open one to see its tasks.' : canEdit ? 'Every project in a table. Use Edit here to change a project.' : 'Every project in a table.'}
          </p>
        </div>
      </div>

      {canEdit ? <ProjectOnboardingForm people={staff} needsApproval={needsApproval} typesReady={typesReady} showPoints={isAdmin} monthlyReady={monthlyReady} /> : null}

      <nav className="tabs" aria-label="Project views">
        <Link href="/projects" aria-current={view === 'board' ? 'page' : undefined}>
          Board
        </Link>
        <Link href="/projects?view=list" aria-current={view === 'list' ? 'page' : undefined}>
          List
        </Link>
        {seesClients ? (
          <Link href="/projects?view=clients" aria-current={view === 'clients' ? 'page' : undefined}>
            Clients
          </Link>
        ) : null}
      </nav>

      {view === 'board' && monthlyCards.length > 0 && !showHidden ? (
        <section className="monthly-section" aria-labelledby="monthly-title">
          <header className="board-head">
            <h2 id="monthly-title" className="flex items-center gap-2">
              <CalendarSync size={16} aria-hidden />
              Monthly clients
            </h2>
            <span className="count">{monthlyCards.length}</span>
          </header>
          <div className="monthly-grid">
            {monthlyCards.map((project) => (
              <div key={project.id} className="project-card monthly-card">
                <Link href={project.href} className="card-cover" aria-label={`Open ${project.name}`} />
                {hideButton(project) ? <span className="project-card-actions">{hideButton(project)}</span> : null}
                <p className="project-name">
                  {project.name}
                  {project.status === 'archived' ? <span className="badge" style={{ marginLeft: 6 }}>Hidden</span> : null}
                </p>
                <p className="project-client">{project.client_name ?? 'Internal'}</p>
                <div className="project-progress">
                  <div
                    role="progressbar"
                    aria-label={`${project.name} this month`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={project.percent}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
                  >
                    <div className="h-full rounded-full bg-success" style={{ width: `${project.percent}%` }} />
                  </div>
                  <span className="project-meta">
                    <ListChecks size={13} aria-hidden />
                    {project.month
                      ? `${monthName(project.month.month, true)}: ${project.counter || `${project.done} of ${project.total} done`}`
                      : 'This month not started yet'}
                  </span>
                </div>
                <div className="project-foot">
                  <span className="avatars" aria-label={project.team.length === 0 ? 'Nobody assigned' : `Team: ${project.team.join(', ')}`}>
                    {project.team.slice(0, 4).map((name) => (
                      <Avatar key={name} name={name} photo={photoByName.get(name)} title={name} />
                    ))}
                    {project.team.length > 4 ? <span className="avatar">+{project.team.length - 4}</span> : null}
                  </span>
                  {project.month?.status === 'closed' ? <span className="badge badge-approved">Month closed</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === 'board' && monthlyCards.length > 0 && !showHidden ? (
        <h2 className="section-title">One-time projects</h2>
      ) : null}

      {(view === 'board' || view === 'list') && hiddenCount > 0 ? (
        showHidden ? (
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Hidden projects</h2>
                <p className="muted">
                  Finished projects kept off the board. Open one to see all its tasks and links, or bring it back.
                </p>
              </div>
              <Link href={view === 'list' ? '/projects?view=list' : '/projects'} className="button">
                Back to projects
              </Link>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Finished</th>
                    {canEdit ? <th aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {projectRows
                    .filter((project) => project.status === 'archived')
                    .sort((a, b) => String((b as { finished_at?: string | null }).finished_at ?? '').localeCompare(String((a as { finished_at?: string | null }).finished_at ?? '')))
                    .map((project) => {
                      const finished = (project as { finished_at?: string | null }).finished_at;
                      return (
                        <tr key={project.id}>
                          <td>
                            <Link href={project.href}>{project.name}</Link>
                          </td>
                          <td>{project.client_name ?? 'Internal'}</td>
                          <td>{isMonthly(project) ? 'Monthly client' : 'One-time'}</td>
                          <td>{finished ? monthName(finished.slice(0, 7) + '-01', true) : '—'}</td>
                          {canEdit ? <td className="row-actions">{hideButton(project)}</td> : null}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="muted board-hidden-note">
            {hiddenCount} finished {hiddenCount === 1 ? 'project is' : 'projects are'} hidden to keep things tidy. Their tasks are off My Tasks and the calendar too.{' '}
            <Link href={view === 'list' ? '/projects?view=list&hidden=1' : '/projects?hidden=1'}>Show hidden projects</Link>
          </p>
        )
      ) : null}

      {showHidden && hiddenCount > 0 && view !== 'clients' ? null : view === 'board' ? (
        oneTimeRows.length === 0 ? (
          <section className="panel">
            <p className="muted empty">{monthlyCards.length > 0 ? 'No one-time projects right now.' : 'No projects yet. Use "Add project" above to create the first one.'}</p>
          </section>
        ) : (
          <div className="board">
            {COLUMNS.filter((status): status is Exclude<(typeof COLUMNS)[number], 'archived'> => status !== 'archived').map((status) => {
              const inColumn = oneTimeRows.filter((project) => project.status === status);
              return (
                <section key={status} className="board-col" aria-label={label(status)}>
                  <header className="board-head">
                    <span className={`badge badge-${status}`}>{label(status)}</span>
                    <span className="count">{inColumn.length}</span>
                    {status === 'completed' && canEdit && inColumn.length > 1 ? (
                      <ActionButton endpoint="/api/projects/hide-done">Hide all</ActionButton>
                    ) : null}
                  </header>
                  {inColumn.length === 0 ? <p className="board-empty">Nothing here</p> : null}
                  {inColumn.map((project, index) => {
                    const overdue = Boolean(project.due_date) && project.due_date! < today && status !== 'completed';
                    return (
                      <div key={project.id} className="project-card-wrap">
                      <Link href={project.href} className={canEdit ? 'project-card editable' : 'project-card'} style={{ animationDelay: `${index * 50}ms` }}>
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
                              <Avatar key={name} name={name} photo={photoByName.get(name)} title={name} />
                            ))}
                            {project.team.length > 4 ? <span className="avatar">+{project.team.length - 4}</span> : null}
                            {project.team.length === 0 ? <span className="project-meta">Nobody assigned</span> : null}
                          </span>
                          <span className="project-tags">
                            {project.shoot_status === 'waiting' ? (
                              <span className="badge badge-pending" title="The shoot date is waiting for the client to confirm">
                                <Camera size={12} aria-hidden className="mr-1" />
                                Awaiting shoot date
                              </span>
                            ) : null}
                            {project.shoot_status === 'confirmed' ? (
                              <span className="badge badge-approved" title="Shoot confirmed">
                                <Camera size={12} aria-hidden className="mr-1" />
                                {project.shoot_date ? `Shoot ${shortDate(project.shoot_date)}` : 'Shoot confirmed'}
                              </span>
                            ) : null}
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
                      {canEdit ? (
                        <span className="project-card-actions">
                          {hideButton(project)}
                          <Link href={`${project.href}?edit=1#edit`} className="project-edit" aria-label={`Edit ${project.name}`}>
                            <Pencil size={11} aria-hidden />
                            Edit
                          </Link>
                        </span>
                      ) : null}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )
      ) : view === 'clients' ? (
        <ResourceManager
          title="Clients"
          description="A client is also created when you type a new name on a project."
          endpoint="/api/clients"
          rows={asRows(clients.map((client) => ({ ...client, projects: projects.filter((project) => project.client_id === client.id).length })))}
          columns={[
            { key: 'name', label: 'Client' },
            { key: 'contact_name', label: 'Contact person' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'projects', label: 'Projects', kind: 'number' },
            { key: 'notes', label: 'Notes' },
          ]}
          fields={[
            { name: 'name', label: 'Client name', required: true },
            { name: 'contact_name', label: 'Contact person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'notes', label: 'Notes', type: 'textarea' },
          ]}
          canWrite={editsClients}
          needsApproval={!isAdmin}
          allowDelete={isAdmin}
          addLabel="Add client"
          emptyText="No clients yet."
          pageSize={25}
        />
      ) : null}

      {view === 'clients' && canEdit && portalsReady && !(showHidden && hiddenCount > 0) ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Client portals</h2>
              <p className="muted">
                Give a client their own private link: all their projects and progress, and work waiting for their approval
                (they approve or ask for changes). No account needed. Invoices stay hidden until you tick &quot;Client can see
                invoices&quot;; drafts only with &quot;Include drafts&quot;. Turn a link off any time.
              </p>
            </div>
          </header>
          <ul className="portal-admin-list">
            {clients.map((client) => (
              <li key={client.id}>
                <strong>{client.name}</strong>
                <ShareLink
                  endpoint={`/api/clients/${client.id}/portal`}
                  basePath="/portal"
                  token={portalToken.get(client.id) ?? null}
                  createLabel="Create portal link"
                />
                {portalOf.get(client.id) && 'show_invoices' in portalOf.get(client.id)! ? (
                  <PortalSettings
                    clientId={client.id}
                    token={portalOf.get(client.id)!.token}
                    showInvoices={Boolean(portalOf.get(client.id)!.show_invoices)}
                    showDrafts={Boolean(portalOf.get(client.id)!.show_drafts)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view !== 'list' || (showHidden && hiddenCount > 0) ? null : (
        <>
          <ResourceManager
            title="All projects"
            endpoint="/api/projects"
            rows={asRows(projectRows.filter((project) => project.status !== 'archived'))}
            columns={[
              { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
              ...(monthlyReady ? [{ key: 'type_label', label: 'Type' }] : []),
              { key: 'client_name', label: 'Client' },
              { key: 'team', label: 'Team', kind: 'tags' },
              { key: 'status', label: 'Status', kind: 'label' },
              { key: 'progress', label: 'Tasks' },
              { key: 'due_date', label: 'Due' },
              { key: 'file_links', label: 'Links', kind: 'links' },
            ]}
            editFields={projectFields}
            canWrite={canEdit}
            needsApproval={needsApproval}
            allowDelete={isAdmin}
            allowCreate={false}
            emptyText='No projects yet. Use "Add project" above to create the first one.'
          />
        </>
      )}
    </>
  );
}
