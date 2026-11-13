-- Everyone in the organization can open the Projects section and comment on
-- any project. Changing a project still needs the projects role or an admin.

drop policy segment_read on public.projects;
create policy member_read on public.projects for select to authenticated
  using (org_id = public.current_org_id());

drop policy segment_read on public.tasks;
create policy member_read on public.tasks for select to authenticated
  using (org_id = public.current_org_id());

drop policy member_read on public.project_members;
create policy member_read on public.project_members for select to authenticated
  using (org_id = public.current_org_id());

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index project_comments_project_idx on public.project_comments (project_id, created_at);

grant select, insert, delete on public.project_comments to authenticated;
revoke all on public.project_comments from anon;
alter table public.project_comments enable row level security;

create policy member_read on public.project_comments for select to authenticated
  using (org_id = public.current_org_id());
-- Anyone comments as themselves.
create policy member_insert on public.project_comments for insert to authenticated
  with check (org_id = public.current_org_id() and author_id = auth.uid());
-- People remove their own comments; admins remove any.
create policy own_or_admin_delete on public.project_comments for delete to authenticated
  using (org_id = public.current_org_id() and (author_id = auth.uid() or public.is_admin()));
