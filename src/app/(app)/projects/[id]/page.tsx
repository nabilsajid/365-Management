import { Pencil } from 'lucide-react';
import { Avatar, loadPhotos } from '@/components/avatar';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AwardProjectPoints } from '@/components/award-project-points';
import { CopyProject } from '@/components/copy-project';
import { DeleteProject } from '@/components/delete-project';
import { MonthBar, monthName, type MonthTab } from '@/components/month-bar';
import { nextMonthStart } from '@/lib/domain/deliverables';
import { monthStart } from '@/lib/domain/points';
import { DeliveryTracker } from '@/components/delivery-tracker';
import { ExtrasInvoiceForm } from '@/components/extras-invoice';
import { ShareLink } from '@/components/share-link';
import { MonthTasksToolbar } from '@/components/month-tasks-toolbar';
import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { label, money } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import { TASK_KINDS, TASK_KIND_LABEL, TASK_KIND_SINGLE, deliveryCounts, describeFixed, extrasForMonth, planTasksFromFixed, thumbnailState, type TaskKind } from '@/lib/domain/deliverables';
import { titleTags } from '@/lib/domain/roles';
import type { Client, Profile, Project, ProjectComment, ProjectMember, Role, Task } from '@/types/database';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; month?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // Arriving from the board's Edit button opens the edit form straight away.
  const startEditing = Boolean(query.edit);
  const { supabase, orgId, userId, isAdmin, can, canEdit, localDateTime, timeZone } = await getPageContext();
  const photos = await loadPhotos(supabase, orgId);

  const projectResult = await supabase.from('projects').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const project = projectResult.data as Project | null;
  if (!project) notFound();

  const [clientResult, tasksResult, peopleResult, membersResult, rolesResult, commentsResult, directProbe, reviewResult, feedbackResult, monthsResult, targetsResult] = await Promise.all([
    project.client_id
      ? supabase.from('clients').select('*').eq('id', project.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('tasks').select('*').eq('project_id', id).eq('org_id', orgId).order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('project_id', id),
    supabase.from('roles').select('name, color').eq('org_id', orgId),
    supabase.from('project_comments').select('*').eq('project_id', id).eq('org_id', orgId).order('created_at'),
    // After the project rules database update, project roles change things without admin approval.
    supabase.from('notifications').select('id').limit(1),
    // The client review link (only people who edit projects can see it).
    supabase.from('review_links').select('token, is_active').eq('project_id', id).eq('org_id', orgId).limit(1).maybeSingle(),
    supabase.from('client_feedback').select('id, task_id, name, decision, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200),
    // A monthly client's months and package (after the monthly clients database update).
    supabase.from('project_months').select('*').eq('project_id', id).eq('org_id', orgId).order('month', { ascending: false }),
    supabase.from('project_targets').select('*').eq('project_id', id).eq('org_id', orgId).order('position').order('created_at'),
  ]);
  // Client review arrives with a database update; until then it is left out.
  const reviewReady = !reviewResult.error;
  const reviewLink = reviewResult.data as { token: string; is_active: boolean } | null;
  const needsApproval = !isAdmin && Boolean(directProbe.error);
  // Comments arrive with a database update; until then the section is left out.
  const commentsReady = !commentsResult.error;
  const comments = rowsOf<ProjectComment>(commentsResult.data);
  const client = clientResult.data as Client | null;
  const allTasks = rowsOf<Task & { month_id?: string | null; is_extra?: boolean }>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));
  const team = rowsOf<ProjectMember>(membersResult.data)
    .map((row) => person.get(row.profile_id))
    .filter((profile): profile is Profile => Boolean(profile));
  const links = project.file_links ?? [];
  const roleColor = new Map(rowsOf<Pick<Role, 'name' | 'color'>>(rolesResult.data).map((role) => [role.name, role.color]));

  // Deliverable types, thumbnail pairing and the shoot status arrive with a database update.
  const typesReady = 'shoot_status' in project;
  const mayEdit = canEdit('projects');
  // A monthly client shows one month at a time: its package deliverables and its extras.
  const monthlyReady = !monthsResult.error && 'kind' in project;
  const monthly = monthlyReady && (project as Project & { kind?: string }).kind === 'monthly';
  const months = rowsOf<{ id: string; month: string; status: 'open' | 'closed'; note: string | null }>(monthsResult.data);
  // A monthly client's fixed deliverables ("5 videos", "Social media management"), and the month's counts against them.
  const targets = rowsOf<{ id: string; kind: TaskKind; quantity: number | null; label: string | null; position: number }>(targetsResult.data);
  const thisMonth = monthStart(new Date(), timeZone);

  const selectedMonth = monthly
    ? (months.find((row) => row.id === query.month) ?? months.find((row) => row.month === thisMonth) ?? months[0] ?? null)
    : null;
  const inMonth = (task: (typeof allTasks)[number]) => !monthly || (selectedMonth ? task.month_id === selectedMonth.id : !task.month_id);
  // A month shows everything in it together: package deliverables and extras (tagged "Extra").
  const tasks = allTasks.filter(inMonth);
  const counts = monthly && selectedMonth ? deliveryCounts(tasks, targets) : [];
  // This month's invoices (fee and extras), and what could go on an extras invoice.
  const billing = await (async () => {
    const canInvoice = isAdmin || canEdit('cashflow');
    if (!monthly || !selectedMonth || !(canInvoice || can('cashflow'))) return { ready: false, canInvoice, invoices: [], extras: [], rates: {} as Record<string, number> };
    const result = await supabase
      .from('invoices')
      .select('id, invoice_number, amount, status, is_extras')
      .eq('project_month_id', selectedMonth.id)
      .order('created_at');
    return {
      ready: !result.error,
      canInvoice,
      invoices: rowsOf<{ id: string; invoice_number: string; amount: number; status: string; is_extras: boolean }>(result.data),
      extras: extrasForMonth(counts, monthName(selectedMonth.month)),
      rates: ((project as { extra_rates?: Record<string, number> | null }).extra_rates ?? {}) as Record<string, number>,
    };
  })();
  const missingFromFixed = monthly && selectedMonth ? planTasksFromFixed(targets, tasks).length : 0;
  const monthTabs: MonthTab[] = months.map((row) => {
    const own = allTasks.filter((task) => task.month_id === row.id);
    return {
      id: row.id,
      month: row.month,
      status: row.status,
      done: own.filter((task) => task.status === 'approved').length,
      total: own.length,
      extras: own.filter((task) => task.is_extra).length,
    };
  });
  const titleOf = new Map(allTasks.map((task) => [task.id, task.title]));
  const clientAnswers = rowsOf<{ id: string; task_id: string; name: string; decision: string; created_at: string }>(feedbackResult.data).filter((row) =>
    titleOf.has(row.task_id),
  );
  const videos = tasks.filter((task) => task.kind === 'video');

  const toRow = (task: (typeof allTasks)[number]) => {
    const assignee = task.assignee_id ? person.get(task.assignee_id) : undefined;
    return {
      ...task,
      kind: (task.kind ?? 'other') as TaskKind,
      assignee_name: assignee?.full_name ?? 'Unassigned',
      assignee_role: assignee?.job_title ?? null,
      href: `/tasks/${task.id}`,
      // On a video: where its thumbnail stands. On a thumbnail: which video it is for.
      thumbnail: task.kind === 'video' ? thumbnailState(task.id, tasks) : null,
      for_video: task.for_task_id ? (titleOf.get(task.for_task_id) ?? '—') : null,
    };
  };
  const taskRows = tasks.map(toRow);

  const kindField: Field = {
    name: 'kind',
    label: 'Type',
    type: 'select',
    required: true,
    options: TASK_KINDS.map((kind) => ({ value: kind, label: TASK_KIND_SINGLE[kind] })),
  };
  const forVideoField: Field = {
    name: 'for_task_id',
    label: 'Thumbnail for',
    type: 'select',
    options: videos.map((video) => ({ value: video.id, label: video.title })),
    hint: 'The video this thumbnail belongs to.',
  };
  const baseFields: Field[] = [
    { name: 'title', label: 'Title', required: true, placeholder: 'Video 1' },
    { name: 'assignee_id', label: 'Assignee', type: 'select', options: peopleOptions(people), hint: 'Anyone on the team, including people not assigned to this project. They are notified.' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'todo', options: enumOptions(isAdmin ? ['todo', 'in_progress', 'submitted', 'changes_requested', 'approved'] : ['todo', 'in_progress', 'submitted', 'changes_requested']) },
    // Points are an admin's decision.
    ...(isAdmin ? [{ name: 'points_value', label: 'Points on approval', type: 'number' as const, hint: 'Leave empty to use the organization default.' }] : []),
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'description', label: 'Quick notes', type: 'textarea', placeholder: 'Longer than the rest, about 10 minutes.' },
    { name: 'file_links', label: 'File links', type: 'links' },
  ];
  /** A fixed deliverable of a monthly client. */
  const fixedFields: Field[] = [
    { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'video', options: TASK_KINDS.map((kind) => ({ value: kind, label: TASK_KIND_SINGLE[kind] })) },
    { name: 'quantity', label: 'How many a month', type: 'number', placeholder: '5', hint: 'Leave empty for an ongoing service with no fixed number.' },
    { name: 'label', label: 'Name (optional)', placeholder: 'Social media management', hint: 'For a service, or to tell lines apart (e.g. Reels).' },
  ];

  /** The form for one type of deliverable; thumbnails also choose their video. */
  const fieldsFor = (kind: TaskKind | null, editing: boolean): Field[] => {
    if (!typesReady) return baseFields;
    const [title, ...rest] = baseFields;
    return [
      title,
      ...(editing || kind === null ? [kindField] : []),
      ...(kind === 'thumbnail' || kind === null ? [forVideoField] : []),
      ...rest,
    ];
  };
  const columnsFor = (kind: TaskKind | null) => [
    { key: 'title', label: 'Task', kind: 'nav' as const, hrefKey: 'href' },
    ...(kind === 'video' ? [{ key: 'thumbnail', label: 'Thumbnail', kind: 'label' as const }] : []),
    ...(kind === 'thumbnail' ? [{ key: 'for_video', label: 'For video' }] : []),
    { key: 'description', label: 'Notes' },
    { key: 'assignee_name', label: 'Assignee' },
    { key: 'status', label: 'Status', kind: 'label' as const },
    { key: 'points_value', label: 'Points', kind: 'number' as const },
    { key: 'due_date', label: 'Due' },
    { key: 'file_links', label: 'Files', kind: 'links' as const },
  ];
  const groups = typesReady ? TASK_KINDS.filter((kind) => taskRows.some((task) => task.kind === kind)) : [];
  const missingThumbnails = taskRows.filter((task) => task.thumbnail === 'missing').length;

  const shootText =
    project.shoot_status === 'waiting'
      ? 'Waiting for the client to confirm'
      : project.shoot_status === 'confirmed'
        ? `Confirmed${project.shoot_date ? ` for ${project.shoot_date}` : ''}`
        : 'No shoot planned';

  // The next batch for the same client: same scope, no dates, links or progress.
  const copyPayload = {
    name: `${project.name} (copy)`,
    client_name: client?.name ?? null,
    brief: project.brief,
    member_ids: team.map((profile) => profile.id),
    // A monthly client is copied with its package; a one-time project with its deliverables.
    ...(monthly ? { kind: 'monthly' } : {}),
    ...(monthly
      ? {
          targets: Object.fromEntries(
            TASK_KINDS.map((kind) => [kind, targets.filter((row) => row.kind === kind && row.quantity !== null && !row.label).reduce((sum, row) => sum + (row.quantity ?? 0), 0)]).filter(([, count]) => (count as number) > 0),
          ),
          services: targets.filter((row) => row.label).map((row) => row.label as string),
        }
      : {}),
    deliverables: monthly
      ? []
      : tasks.map((task) => ({
      title: task.title,
      description: task.description,
      assignee_id: task.assignee_id,
      ...(isAdmin ? { points_value: task.points_value } : {}),
      ...(typesReady ? { kind: task.kind ?? 'other' } : {}),
      ...(task.for_task_id && tasks.some((other) => other.id === task.for_task_id)
        ? { for_index: tasks.findIndex((other) => other.id === task.for_task_id) }
        : {}),
    })),
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted">
            <Link href="/projects">Projects</Link>
            {client ? ` / ${client.name}` : ''}
          </p>
          <h1>
            {project.name}
            {monthly ? (
              <span className="badge badge-active" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                Monthly client
              </span>
            ) : null}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mayEdit ? (
            <Link href={`/projects/${project.id}?edit=1#edit`} className="button">
              <Pencil size={14} aria-hidden style={{ marginRight: 6 }} />
              Edit project
            </Link>
          ) : null}
          {mayEdit ? <CopyProject payload={copyPayload} /> : null}
          {isAdmin ? <DeleteProject id={project.id} name={project.name} /> : null}
        </div>
      </div>

      <section className="panel">
        <dl className="detail">
          <dt>Client</dt>
          <dd>{client?.name ?? 'No client (internal project)'}</dd>
          <dt>Team</dt>
          <dd>
            {team.length === 0 ? (
              'Nobody assigned yet.'
            ) : (
              <span className="grid gap-1.5">
                {team.map((profile) => (
                  <span key={profile.id} className="tags">
                    <Avatar name={profile.full_name} photo={photos.get(profile.id)} />
                    <strong>{profile.full_name}</strong>
                    {titleTags(profile.job_title, roleColor).map((tag) => (
                      <span key={tag.label} className={tag.color ? `badge tag-${tag.color}` : 'badge'}>
                        {tag.label}
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            )}
          </dd>
          <dt>Links</dt>
          <dd>
            {links.length === 0
              ? 'No links attached.'
              : links.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="chip">
                    {link.label}
                  </a>
                ))}
          </dd>
          <dt>Status</dt>
          <dd>{label(project.status)}</dd>
          {typesReady ? (
            <>
              <dt>Shoot</dt>
              <dd>
                <span className={project.shoot_status === 'waiting' ? 'badge badge-pending' : project.shoot_status === 'confirmed' ? 'badge badge-approved' : 'badge'}>
                  {shootText}
                </span>
              </dd>
            </>
          ) : null}
          <dt>Dates</dt>
          <dd>
            {project.start_date ?? '—'} to {project.due_date ?? '—'}
          </dd>
          <dt>Brief</dt>
          <dd>{project.brief ?? 'No brief written yet.'}</dd>
        </dl>
      </section>

      {isAdmin && project.status === 'completed' && 'points_awarded_at' in project && !project.points_awarded_at ? (
        <AwardProjectPoints
          projectId={project.id}
          people={[...new Set([...team.map((profile) => profile.id), ...tasks.map((task) => task.assignee_id).filter((value): value is string => Boolean(value))])]
            .map((personId) => person.get(personId))
            .filter((profile): profile is Profile => Boolean(profile))
            .map((profile) => {
              const own = tasks.filter((task) => task.assignee_id === profile.id);
              const approved = own.filter((task) => task.status === 'approved').length;
              return {
                id: profile.id,
                name: profile.full_name,
                role: profile.job_title,
                note: own.length === 0 ? 'On the team' : `${own.length} deliverable${own.length === 1 ? '' : 's'}, ${approved} approved`,
              };
            })}
        />
      ) : null}

      {mayEdit ? (
        <details className="panel fold" id="edit" open={startEditing}>
          <summary>Edit project details and team</summary>
          <ApiForm
            endpoint={`/api/projects/${project.id}`}
            method="PATCH"
            submitLabel="Save project"
            resetOnSuccess={false}
            initial={{
              name: project.name,
              client_name: client?.name ?? null,
              status: project.status,
              start_date: project.start_date,
              due_date: project.due_date,
              brief: project.brief,
              member_ids: team.map((profile) => profile.id),
              file_links: links,
              ...(monthlyReady ? { kind: monthly ? 'monthly' : 'one_time' } : {}),
              ...(monthly && 'monthly_fee' in project ? { monthly_fee: (project as { monthly_fee?: number | null }).monthly_fee ?? '' } : {}),
            }}
            fields={[
              { name: 'name', label: 'Project name', required: true },
              { name: 'client_name', label: 'Client', placeholder: 'Optional', hint: 'Type a name, or leave empty for an internal project.' },
              { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['onboarding', 'active', 'completed', 'archived']) },
              { name: 'start_date', label: 'Start date', type: 'date' },
              { name: 'due_date', label: 'Due date', type: 'date' },
              { name: 'brief', label: 'Project brief', type: 'textarea' },
              { name: 'member_ids', label: 'Assigned employees', type: 'multiselect', options: peopleOptions(people), hint: 'Tick to add someone, untick to remove them. New people are notified.' },
              { name: 'file_links', label: 'Links', type: 'links' },
              ...(monthlyReady
                ? [
                    {
                      name: 'kind',
                      label: 'Type',
                      type: 'select' as const,
                      required: true,
                      options: [
                        { value: 'one_time', label: 'One-time project' },
                        { value: 'monthly', label: 'Monthly client (ongoing, a package every month)' },
                      ],
                      hint: 'A monthly client keeps one project, with its fixed deliverables and a month for each calendar month.',
                    },
                  ]
                : []),
              ...(monthly && isAdmin && 'monthly_fee' in project
                ? [
                    {
                      name: 'monthly_fee',
                      label: 'Monthly fee (optional)',
                      type: 'number' as const,
                      hint: 'When set, a draft invoice for this amount is made on the 1st of every month, listing the fixed deliverables. You check and send it.',
                    },
                  ]
                : []),
            ]}
          />
        </details>
      ) : null}

      {reviewReady && mayEdit ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Client review</h2>
              <p className="muted">
                Send the client a link. They see the deliverables and shared work, then approve each one or ask for changes — no account needed.
              </p>
            </div>
          </header>
          <ShareLink
            endpoint={`/api/projects/${project.id}/review-link`}
            basePath="/review"
            token={reviewLink?.is_active ? reviewLink.token : null}
            createLabel={reviewLink ? 'Turn the review link back on' : 'Make a review link'}
          />
          {clientAnswers.length > 0 ? (
            <ul className="comments" style={{ marginTop: '1rem' }}>
              {clientAnswers.slice(0, 10).map((answer) => (
                <li key={answer.id} className="comment">
                  <span className="avatar" aria-hidden>
                    {answer.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="comment-meta">
                      <strong>{answer.name}</strong>
                      <span> · {localDateTime(answer.created_at)} · </span>
                      <Link href={`/tasks/${answer.task_id}`}>{titleOf.get(answer.task_id)}</Link>{' '}
                      <span className={answer.decision === 'approved' ? 'badge badge-approved' : 'badge badge-pending'}>
                        {answer.decision === 'approved' ? 'Approved' : 'Asked for changes'}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {typesReady && mayEdit ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Shoot</h2>
              <p className="muted">
                No fixed date yet? Mark it as waiting, then set the date once the client confirms.
                {needsApproval ? ' Your change goes to an admin for approval.' : ''}
              </p>
            </div>
          </header>
          <ApiForm
            endpoint={`/api/projects/${project.id}`}
            method="PATCH"
            submitLabel="Save shoot"
            resetOnSuccess={false}
            initial={{ shoot_status: project.shoot_status ?? 'none', shoot_date: project.shoot_date ?? null }}
            fields={[
              {
                name: 'shoot_status',
                label: 'Shoot',
                type: 'select',
                required: true,
                options: [
                  { value: 'none', label: 'No shoot planned' },
                  { value: 'waiting', label: 'Waiting for client confirmation' },
                  { value: 'confirmed', label: 'Confirmed' },
                ],
              },
              { name: 'shoot_date', label: 'Shoot date', type: 'date', hint: 'Fill in once confirmed.' },
            ]}
          />
        </section>
      ) : null}

      {monthly ? (
        <ResourceManager
          title="Fixed deliverables"
          description="What this client gets every month, if anything is fixed: for example 5 videos, 5 thumbnails, Social media management. Give a number to count it, or just a name for an ongoing service. Leave it empty if nothing is fixed."
          endpoint="/api/project-targets"
          rows={asRows(
            targets.map((row) => ({
              ...row,
              what: describeFixed(row),
              kind_label: TASK_KIND_LABEL[row.kind] ?? row.kind,
              amount: row.quantity === null ? 'Ongoing' : `${row.quantity} a month`,
            })),
          )}
          columns={[
            { key: 'what', label: 'Every month' },
            { key: 'kind_label', label: 'Type' },
            { key: 'amount', label: 'How many' },
          ]}
          fields={fixedFields}
          editFields={fixedFields}
          fixedValues={{ project_id: project.id, position: targets.length }}
          canWrite={mayEdit}
          addLabel="Add a fixed deliverable"
          emptyText="Nothing fixed. Tasks are added month by month, and deliveries are still counted."
        />
      ) : null}

      {monthly ? (
        <MonthBar
          projectId={project.id}
          tabs={monthTabs}
          selectedId={selectedMonth?.id ?? null}
          thisMonth={thisMonth}
          nextMonth={nextMonthStart(thisMonth)}
          canEdit={mayEdit}
          isAdmin={isAdmin}
        />
      ) : null}

      {monthly && selectedMonth && mayEdit && selectedMonth.status === 'open' ? (
        <MonthTasksToolbar
          projectId={project.id}
          monthId={selectedMonth.id}
          monthLabel={monthName(selectedMonth.month)}
          missing={missingFromFixed}
          hasFixed={targets.length > 0}
          people={peopleOptions(people)}
          showPoints={isAdmin}
        />
      ) : null}

      {typesReady && missingThumbnails > 0 ? (
        <p role="status" className="mb-5 rounded-card border border-warning bg-warning-soft px-4 py-3 text-[13px] text-warning-strong">
          {missingThumbnails} {missingThumbnails === 1 ? 'video has' : 'videos have'} no thumbnail yet. Add a thumbnail and choose the video it is for.
        </p>
      ) : null}

      {groups.map((kind) => (
        <ResourceManager
          key={kind}
          title={TASK_KIND_LABEL[kind]}
          endpoint="/api/tasks"
          rows={asRows(taskRows.filter((task) => task.kind === kind))}
          columns={columnsFor(kind)}
          fields={monthly ? undefined : fieldsFor(kind, false)}
          editFields={fieldsFor(kind, true)}
          fixedValues={{
            project_id: project.id,
            position: allTasks.length,
            kind,
            ...(monthly && selectedMonth ? { month_id: selectedMonth.id } : {}),
          }}
          canWrite={mayEdit && !(monthly && selectedMonth?.status === 'closed')}
          needsApproval={needsApproval}
          addLabel={`Add ${TASK_KIND_SINGLE[kind].toLowerCase()}`}
          pageSize={25}
        />
      ))}

      {monthly ? (
        selectedMonth ? (
          <DeliveryTracker
            month={monthName(selectedMonth.month)}
            counts={counts}
            allTime={TASK_KINDS.map((kind) => ({ kind, delivered: allTasks.filter((task) => task.kind === kind && task.status === 'approved').length })).filter((row) => row.delivered > 0)}
          />
        ) : null
      ) : null}

      {monthly && selectedMonth && billing.ready ? (
        <section className="panel" id="billing">
          <header className="panel-header">
            <div>
              <h2>Invoices for {monthName(selectedMonth.month)}</h2>
              <p className="muted">
                The monthly fee is invoiced by itself on the 1st. Anything extra goes on a separate invoice: it starts with
                what was delivered beyond the fixed deliverables, at the prices you used last time.
              </p>
            </div>
          </header>
          <p>
            <Link href={`/projects/${project.id}/invoice-preview?month=${selectedMonth.id}`} className="button">
              {billing.invoices.some((invoice) => !invoice.is_extras) ? 'View monthly invoice draft' : 'Preview monthly invoice'}
            </Link>
          </p>
          {billing.invoices.length > 0 ? (
            <ul className="message-list">
              {billing.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link href={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>{' '}
                  <span className="muted">
                    · {invoice.is_extras ? 'Extras' : 'Monthly fee'} · {money(invoice.amount)} · {label(invoice.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No invoices for this month yet.</p>
          )}
          {billing.canInvoice ? (
            project.client_id ? (
              <details className="fold-inline" open={billing.extras.length > 0 && !billing.invoices.some((invoice) => invoice.is_extras)}>
                <summary>
                  Create extras invoice
                  {billing.extras.length > 0 ? ` (${billing.extras.reduce((sum, line) => sum + line.quantity, 0)} extra delivered)` : ''}
                </summary>
                <ExtrasInvoiceForm projectId={project.id} monthId={selectedMonth.id} suggested={billing.extras} rates={billing.rates} />
              </details>
            ) : (
              <p className="muted">Give this project a client (Edit project) to invoice it.</p>
            )
          ) : null}
        </section>
      ) : null}

      {monthly ? (
        null
      ) : typesReady ? (
        mayEdit || groups.length === 0 ? (
          <ResourceManager
            title={groups.length === 0 ? 'Deliverables' : 'Add another type'}
            description={
              groups.length === 0
                ? 'Everything this client gets, one line each: a shoot, videos, thumbnails, graphics. They are grouped by type.'
                : 'A shoot, a video, a thumbnail, a graphic or anything else. It joins its own group above.'
            }
            endpoint="/api/tasks"
            rows={[]}
            columns={columnsFor(null)}
            fields={fieldsFor(null, false)}
            fixedValues={{ project_id: project.id, position: tasks.length }}
            canWrite={mayEdit}
            needsApproval={needsApproval}
            addLabel="Add deliverable"
            emptyText={groups.length === 0 ? 'No deliverables yet.' : 'Choose a type when adding.'}
          />
        ) : null
      ) : (
        <ResourceManager
          title="Deliverables"
          description="One task per deliverable, each with its own notes, file links and assignee."
          endpoint="/api/tasks"
          rows={asRows(taskRows)}
          columns={columnsFor(null)}
          fields={baseFields}
          fixedValues={{ project_id: project.id, position: tasks.length }}
          canWrite={mayEdit}
          needsApproval={needsApproval}
          addLabel="Add deliverable"
          emptyText="No deliverables yet."
        />
      )}

      {commentsReady ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Comments
                {comments.length > 0 ? <span className="count">{comments.length}</span> : null}
              </h2>
              <p className="muted">Anyone on the team can comment on this project.</p>
            </div>
          </header>
          {comments.length > 0 ? (
            <ul className="comments">
              {comments.map((comment) => {
                const author = comment.author_id ? person.get(comment.author_id) : undefined;
                return (
                  <li key={comment.id} className="comment">
                    <Avatar name={author?.full_name ?? '?'} photo={comment.author_id ? photos.get(comment.author_id) : null} />
                    <div className="min-w-0 flex-1">
                      <p className="comment-meta">
                        <strong>{author?.full_name ?? 'Former employee'}</strong>
                        {author?.job_title ? <span> · {author.job_title}</span> : null}
                        <span> · {localDateTime(comment.created_at)}</span>
                      </p>
                      <p className="comment-body">{comment.body}</p>
                    </div>
                    {isAdmin || comment.author_id === userId ? (
                      <ActionButton endpoint={`/api/project-comments/${comment.id}`} method="DELETE">
                        Delete
                      </ActionButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No comments yet.</p>
          )}
          <ApiForm
            endpoint={`/api/projects/${project.id}/comments`}
            submitLabel="Add comment"
            fields={[{ name: 'body', label: 'Your comment', type: 'textarea', required: true, placeholder: 'Write an update, a question or feedback…' }]}
          />
        </section>
      ) : null}
    </>
  );
}
