-- Project rules and assignment notifications.
--
-- * Roles with editing access to projects create and change projects and
--   deliverables directly, without waiting for admin approval.
-- * Only admins delete a project, approve a deliverable or set its points.
-- * People are told when a project or a deliverable is assigned to them.

create policy editor_insert on public.projects for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));
create policy editor_update on public.projects for update to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));

create policy editor_all on public.tasks for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));

create policy editor_all on public.project_members for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));

-- A project can name a new client.
create policy project_editor_insert on public.clients for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_edit_segment('projects'));

create or replace function public.set_project_members(p_project uuid, p_members uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null or not public.has_edit_segment('projects') then
    raise exception 'Only admins and project managers can assign people to projects' using errcode = '42501';
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

-- Points are an admin's decision: only an admin approves a deliverable or sets
-- what it is worth. (Server-side jobs without a signed-in user are not limited.)
create function public.tasks_points_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'approved' or new.points_value is not null then
      raise exception 'Only an admin can approve a deliverable or set its points' using errcode = '42501';
    end if;
  elsif (new.status = 'approved' and old.status is distinct from 'approved')
     or new.points_value is distinct from old.points_value then
    raise exception 'Only an admin can approve a deliverable or set its points' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tasks_points_guard
before insert or update on public.tasks
for each row execute function public.tasks_points_guard();

-- Notifications: one line per thing a person should know about.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (profile_id, created_at) where read_at is null;

grant select, update on public.notifications to authenticated;
revoke all on public.notifications from anon;
alter table public.notifications enable row level security;

create policy own_read on public.notifications for select to authenticated
  using (profile_id = auth.uid());
create policy own_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Being added to a project's team.
create function public.notify_project_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is distinct from auth.uid() then
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, new.profile_id, 'You were assigned to a project', p.name, '/projects/' || p.id
    from public.projects p where p.id = new.project_id;
  end if;
  return new;
end $$;
create trigger project_members_notify
after insert on public.project_members
for each row execute function public.notify_project_member();

-- Being given a deliverable, whether or not you are on the project's team.
create function public.notify_task_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null
     and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, new.assignee_id, 'A task was assigned to you', new.title || ' · ' || p.name, '/tasks/' || new.id
    from public.projects p where p.id = new.project_id;
  end if;
  return new;
end $$;
create trigger tasks_notify_assignee
after insert or update of assignee_id on public.tasks
for each row execute function public.notify_task_assignee();
