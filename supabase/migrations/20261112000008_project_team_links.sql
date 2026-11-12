-- Projects no longer need a client, and carry their own links and team.

alter table public.projects alter column client_id drop not null;

-- Links attached to the project itself: a list of {"label": text, "url": text}.
alter table public.projects
  add column file_links jsonb not null default '[]'::jsonb check (jsonb_typeof(file_links) = 'array');

-- Employees assigned to a project.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  primary key (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members (profile_id);

grant select, insert, update, delete on public.project_members to authenticated;
revoke all on public.project_members from anon;
alter table public.project_members enable row level security;

create policy admin_all on public.project_members for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy member_read on public.project_members for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('projects') or profile_id = auth.uid()));

-- Replace the team on a project in one step.
create function public.set_project_members(p_project uuid, p_members uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null or not public.is_admin() then
    raise exception 'Only admins can assign people to projects' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project and org_id = v_org) then
    raise exception 'That project does not exist' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_members) as wanted(id)
    where not exists (select 1 from public.profiles p where p.id = wanted.id and p.org_id = v_org)
  ) then
    raise exception 'One of the people does not exist' using errcode = '22023';
  end if;

  insert into public.project_members (project_id, profile_id, org_id)
  select p_project, wanted.id, v_org from unnest(p_members) as wanted(id)
  on conflict do nothing;

  delete from public.project_members
  where project_id = p_project and not (profile_id = any (p_members));
end $$;

-- People assigned to a project can see it and its deliverables, even without
-- the projects segment.
drop policy segment_read on public.projects;
create policy segment_read on public.projects for select to authenticated
  using (org_id = public.current_org_id() and (
    public.has_segment('projects')
    or exists (select 1 from public.tasks t where t.project_id = projects.id and t.assignee_id = auth.uid())
    or exists (select 1 from public.project_members m where m.project_id = projects.id and m.profile_id = auth.uid())
  ));

drop policy segment_read on public.tasks;
create policy segment_read on public.tasks for select to authenticated
  using (org_id = public.current_org_id() and (
    public.has_segment('projects')
    or assignee_id = auth.uid()
    or exists (select 1 from public.project_members m where m.project_id = tasks.project_id and m.profile_id = auth.uid())
  ));
