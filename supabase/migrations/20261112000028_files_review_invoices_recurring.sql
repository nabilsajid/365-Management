-- Files on deliverables, client review links, shareable invoices, recurring
-- monthly projects and reminders for overdue invoices.

-- 1. Files on deliverables -----------------------------------------------------------------

create table public.task_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- Where it is kept in storage: <org>/<task>/<random>-<file name>
  path text not null unique,
  name text not null,
  size bigint not null check (size >= 0),
  content_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index task_files_task_idx on public.task_files (task_id, created_at);

grant select, insert, delete on public.task_files to authenticated;
revoke all on public.task_files from anon;
alter table public.task_files enable row level security;

create policy member_read on public.task_files for select to authenticated
  using (org_id = public.current_org_id());
create policy member_insert on public.task_files for insert to authenticated
  with check (
    org_id = public.current_org_id() and uploaded_by = auth.uid()
    and split_part(path, '/', 1) = org_id::text and split_part(path, '/', 2) = task_id::text
    and exists (select 1 from public.tasks t where t.id = task_files.task_id and t.org_id = task_files.org_id)
  );
create policy own_or_admin_delete on public.task_files for delete to authenticated
  using (org_id = public.current_org_id() and (uploaded_by = auth.uid() or public.is_admin()));

create trigger task_files_log_delete after delete on public.task_files for each row execute function public.log_delete('task_id', 'tasks');
create trigger task_files_bump_activity after insert or update or delete on public.task_files for each row execute function public.bump_activity();

-- The storage bucket (Supabase Storage). Private: files are only reachable
-- through short-lived links the app hands out. Up to 200 MB per file.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('deliverables', 'deliverables', false, 209715200)
    on conflict (id) do nothing;

    execute $p$
      create policy deliverables_read on storage.objects for select to authenticated
        using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = public.current_org_id()::text)
    $p$;
    execute $p$
      create policy deliverables_upload on storage.objects for insert to authenticated
        with check (bucket_id = 'deliverables' and (storage.foldername(name))[1] = public.current_org_id()::text)
    $p$;
    execute $p$
      create policy deliverables_delete on storage.objects for delete to authenticated
        using (bucket_id = 'deliverables' and (storage.foldername(name))[1] = public.current_org_id()::text
               and (owner = auth.uid() or public.is_admin()))
    $p$;
  end if;
end $$;

-- 2. Client review links ------------------------------------------------------------------

-- A link an admin or project manager sends to a client, to look at a
-- project's deliverables and approve each one or ask for changes. No sign-in;
-- the long random token is the key. Links can be switched off.
create table public.review_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.client_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  link_id uuid not null references public.review_links (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  decision text not null check (decision in ('approved', 'changes')),
  comment text check (comment is null or length(comment) <= 2000),
  created_at timestamptz not null default now()
);
create index client_feedback_task_idx on public.client_feedback (task_id, created_at);

grant select, insert, update, delete on public.review_links to authenticated;
grant select on public.client_feedback to authenticated;
revoke all on public.review_links, public.client_feedback from anon;
alter table public.review_links enable row level security;
alter table public.client_feedback enable row level security;

create policy editor_all on public.review_links for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));
create policy member_read on public.client_feedback for select to authenticated
  using (org_id = public.current_org_id());
-- Client feedback is written by the server on the client's behalf (no sign-in), never by members.

create function public.notify_client_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task record;
  v_title text;
begin
  select t.id, t.title, t.assignee_id into v_task from public.tasks t where t.id = new.task_id;
  v_title := case when new.decision = 'approved' then 'Client approved: ' else 'Client asked for changes: ' end || v_task.title;
  perform public.notify_admins(new.org_id, v_title, new.name || coalesce(': ' || left(new.comment, 150), ''), '/tasks/' || new.task_id);
  if v_task.assignee_id is not null then
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, v_task.assignee_id, v_title, new.name || coalesce(': ' || left(new.comment, 150), ''), '/tasks/' || new.task_id
    from public.profiles p where p.id = v_task.assignee_id and p.access_role <> 'admin';
  end if;
  return new;
end $$;
create trigger client_feedback_notify after insert on public.client_feedback for each row execute function public.notify_client_feedback();
create trigger client_feedback_bump_activity after insert on public.client_feedback for each row execute function public.bump_activity();

-- 3. Shareable invoices and reminders ------------------------------------------------------------

alter table public.invoices
  -- Set when an admin shares the invoice; the link shows a printable invoice without sign-in.
  add column share_token text unique,
  -- When admins were last reminded that this invoice is overdue.
  add column reminded_at timestamptz;

-- Tells admins once a week about each sent invoice that is past its due date and not fully paid.
create function public.remind_overdue_invoices() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select i.id, i.org_id, i.invoice_number, b.outstanding, c.name as client
    from public.invoices i
    join public.invoice_balances b on b.invoice_id = i.id
    join public.clients c on c.id = i.client_id
    join public.organizations o on o.id = i.org_id
    where i.status = 'sent' and i.due_date < (now() at time zone o.timezone)::date and b.outstanding > 0
      and (i.reminded_at is null or i.reminded_at < now() - interval '7 days')
  loop
    insert into public.notifications (org_id, profile_id, title, body, href)
    select r.org_id, p.id, 'Invoice overdue: ' || r.invoice_number, r.client || ' still owes ' || r.outstanding, '/cashflow?tab=income'
    from public.profiles p
    where p.org_id = r.org_id and p.is_active and p.access_role = 'admin';
    update public.invoices set reminded_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.remind_overdue_invoices() from public, authenticated;

-- 4. Recurring monthly projects ------------------------------------------------------------

alter table public.projects
  -- A project marked to repeat is copied at the start of every month.
  add column recurs_monthly boolean not null default false,
  -- On a copy: the project it was copied from, and the month it is for.
  add column recurring_source_id uuid references public.projects (id) on delete set null,
  add column recurring_month date;
create unique index projects_recurring_once on public.projects (recurring_source_id, recurring_month)
  where recurring_source_id is not null;

-- Creates this month's copy of each repeating project, once: same client,
-- brief, team and deliverables (types, notes, assignees), without dates,
-- links or progress. Safe to run any number of times.
create function public.create_recurring_projects() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_month date;
  v_new uuid;
  src record;
begin
  for src in
    select p.*, o.timezone from public.projects p join public.organizations o on o.id = p.org_id
    where p.recurs_monthly and p.status <> 'archived'
  loop
    v_month := date_trunc('month', now() at time zone src.timezone)::date;
    -- Not in the month the original was made, and only once per month.
    continue when date_trunc('month', src.created_at at time zone src.timezone)::date = v_month;
    continue when exists (select 1 from public.projects c where c.recurring_source_id = src.id and c.recurring_month = v_month);

    insert into public.projects (org_id, client_id, name, brief, status, recurring_source_id, recurring_month)
    values (src.org_id, src.client_id, src.name || ' · ' || to_char(v_month, 'Mon YYYY'), src.brief, 'onboarding', src.id, v_month)
    returning id into v_new;

    insert into public.project_members (project_id, profile_id, org_id)
    select v_new, m.profile_id, m.org_id from public.project_members m where m.project_id = src.id;

    insert into public.tasks (org_id, project_id, title, description, assignee_id, position, kind)
    select t.org_id, v_new, t.title, t.description, t.assignee_id, t.position, t.kind
    from public.tasks t where t.project_id = src.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.create_recurring_projects() from public, authenticated;
