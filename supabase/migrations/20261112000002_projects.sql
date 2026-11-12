-- Module 1: clients, projects, per-deliverable tasks, submissions and admin review.
create type public.project_status as enum ('onboarding', 'active', 'completed', 'archived');
create type public.task_status as enum ('todo', 'in_progress', 'submitted', 'changes_requested', 'approved');
create type public.submission_kind as enum ('drive', 'dropbox', 'text');
create type public.review_status as enum ('pending', 'approved', 'changes_requested');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
create index clients_org_idx on public.clients (org_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null,
  brief text,
  status public.project_status not null default 'onboarding',
  start_date date,
  due_date date,
  created_at timestamptz not null default now()
);
create index projects_org_idx on public.projects (org_id);
create index projects_client_idx on public.projects (client_id);

-- One task per deliverable ("Video 1", "Video 2", ...).
-- file_links is an array of {"label": text, "url": text}.
-- points_value overrides the organization's default points for a completed task.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  file_links jsonb not null default '[]'::jsonb check (jsonb_typeof(file_links) = 'array'),
  assignee_id uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'todo',
  points_value integer check (points_value >= 0),
  due_date date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  kind public.submission_kind not null,
  url text,
  note text,
  review_status public.review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint submission_has_content check (
    (kind in ('drive', 'dropbox') and url is not null and length(trim(url)) > 0)
    or (kind = 'text' and note is not null and length(trim(note)) > 0)
  )
);
create index task_submissions_task_idx on public.task_submissions (task_id);

-- Keep the task status in step with its submissions and their review.
create function public.sync_task_status_from_submission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.tasks set status = 'submitted'
    where id = new.task_id and status <> 'approved';
  elsif new.review_status is distinct from old.review_status then
    update public.tasks
    set status = case new.review_status
      when 'approved' then 'approved'::public.task_status
      when 'changes_requested' then 'changes_requested'::public.task_status
      else 'submitted'::public.task_status
    end
    where id = new.task_id;
  end if;
  return new;
end $$;

create trigger task_submissions_sync_task
after insert or update of review_status on public.task_submissions
for each row execute function public.sync_task_status_from_submission();
