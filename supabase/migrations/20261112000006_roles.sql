-- Roles as tags. An admin creates roles, chooses which segments each role can
-- see, and gives a person any number of roles. What someone can see is the
-- union of their roles' segments. A role flagged is_admin has full access.
--
-- Segments:
--   projects     all projects, clients, tasks and submissions
--   equipment    the whole equipment inventory
--   costs        fixed monthly expenses and transport expenses
--   cashflow     accounts, invoices, payments and all expenses
--   team_points  everyone's attendance, points and deductions
--   bonuses      everyone's bonuses
-- Without a segment a person still sees what is theirs: tasks assigned to
-- them, equipment they hold, and their own attendance, points and bonuses.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  permissions text[] not null default '{}'
    check (permissions <@ array['projects', 'equipment', 'costs', 'cashflow', 'team_points', 'bonuses']),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  primary key (profile_id, role_id)
);
create index profile_roles_role_idx on public.profile_roles (role_id);

-- True when the signed-in user is an admin or holds a role that includes the segment.
create function public.has_segment(p_segment text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where pr.profile_id = auth.uid() and p.is_active and p_segment = any (r.permissions)
  )
$$;

-- profiles.access_role and profiles.job_title are kept in step with the roles
-- a person holds: admin access if any role is an admin role, and the role names
-- joined together as the visible job title.
create function public.refresh_profile_roles(p_profile uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles p
  set access_role = case when exists (
        select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id
        where pr.profile_id = p_profile and r.is_admin
      ) then 'admin'::public.access_role else 'employee'::public.access_role end,
      job_title = (
        select string_agg(r.name, ', ' order by r.name)
        from public.profile_roles pr join public.roles r on r.id = pr.role_id
        where pr.profile_id = p_profile
      )
  where p.id = p_profile
$$;

create function public.profile_roles_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_profile_roles(coalesce(new.profile_id, old.profile_id));
  return null;
end $$;

create trigger profile_roles_sync
after insert or delete on public.profile_roles
for each row execute function public.profile_roles_changed();

create function public.role_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name or new.is_admin is distinct from old.is_admin then
    perform public.refresh_profile_roles(pr.profile_id)
    from public.profile_roles pr where pr.role_id = new.id;
  end if;
  return null;
end $$;

create trigger roles_sync_profiles
after update on public.roles
for each row execute function public.role_changed();

-- Replace the set of roles a person holds, in one step.
create function public.set_profile_roles(p_profile uuid, p_roles uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null or not public.is_admin() then
    raise exception 'Only admins can assign roles' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and org_id = v_org) then
    raise exception 'That person does not exist' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_roles) as wanted(id)
    where not exists (select 1 from public.roles r where r.id = wanted.id and r.org_id = v_org)
  ) then
    raise exception 'One of the roles does not exist' using errcode = '22023';
  end if;

  insert into public.profile_roles (profile_id, role_id, org_id)
  select p_profile, wanted.id, v_org from unnest(p_roles) as wanted(id)
  on conflict do nothing;

  delete from public.profile_roles
  where profile_id = p_profile and not (role_id = any (p_roles));
end $$;

-- Starting set of roles for an organization. Admins can change all of them.
create function public.create_default_roles(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.roles (org_id, name, permissions, is_admin) values
    (p_org, 'Admin', '{}', true),
    (p_org, 'Graphic Designer', '{}', false),
    (p_org, 'Senior Graphic Designer', '{}', false),
    (p_org, 'Video Editor', '{}', false),
    (p_org, 'Senior Visualizer', '{}', false),
    (p_org, 'Project Manager', '{projects}', false),
    (p_org, 'Finance Manager', '{cashflow,costs,bonuses}', false),
    (p_org, 'Human Resource', '{team_points,bonuses}', false),
    (p_org, 'Logistics Manager', '{equipment,costs}', false),
    (p_org, 'Operations Manager', '{projects,equipment,costs}', false)
  on conflict (org_id, name) do nothing
$$;

create function public.organization_default_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.create_default_roles(new.id);
  return new;
end $$;

create trigger organizations_create_default_roles
after insert on public.organizations
for each row execute function public.organization_default_roles();

-- Existing organizations and people: create the roles, keep every current
-- admin an admin, and turn each person's old job title into a role tag.
select public.create_default_roles(id) from public.organizations;

insert into public.profile_roles (profile_id, role_id, org_id)
select p.id, r.id, p.org_id
from public.profiles p
join public.roles r on r.org_id = p.org_id and r.is_admin
where p.access_role = 'admin'
on conflict do nothing;

insert into public.profile_roles (profile_id, role_id, org_id)
select p.id, r.id, p.org_id
from public.profiles p
join public.roles r on r.org_id = p.org_id and r.name = p.job_title and not r.is_admin
on conflict do nothing;

-- Access.
grant select, insert, update, delete on public.roles, public.profile_roles to authenticated;
revoke all on public.roles, public.profile_roles from anon;

alter table public.roles enable row level security;
alter table public.profile_roles enable row level security;

create policy member_read on public.roles for select to authenticated
  using (org_id = public.current_org_id());
create policy admin_insert on public.roles for insert to authenticated
  with check (org_id = public.current_org_id() and public.is_admin());
create policy admin_update on public.roles for update to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
-- The admin role itself can never be deleted.
create policy admin_delete on public.roles for delete to authenticated
  using (org_id = public.current_org_id() and public.is_admin() and not is_admin);

create policy member_read on public.profile_roles for select to authenticated
  using (org_id = public.current_org_id());
create policy admin_all on public.profile_roles for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

-- What each person can read now depends on their roles' segments.
drop policy member_read on public.clients;
drop policy member_read on public.projects;
drop policy member_read on public.tasks;
drop policy member_read on public.task_submissions;
drop policy member_read on public.equipment;

create policy segment_read on public.clients for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('projects') or public.has_segment('cashflow')));

create policy segment_read on public.tasks for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('projects') or assignee_id = auth.uid()));

create policy segment_read on public.projects for select to authenticated
  using (org_id = public.current_org_id() and (
    public.has_segment('projects')
    or exists (select 1 from public.tasks t where t.project_id = projects.id and t.assignee_id = auth.uid())
  ));

create policy segment_read on public.task_submissions for select to authenticated
  using (org_id = public.current_org_id() and (
    public.has_segment('projects')
    or submitted_by = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_submissions.task_id and t.assignee_id = auth.uid())
  ));

create policy segment_read on public.equipment for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('equipment') or current_holder_id = auth.uid()));

create policy segment_read on public.accounts for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('cashflow'));
create policy segment_read on public.invoices for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('cashflow'));
create policy segment_read on public.payments for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('cashflow'));

create policy segment_read on public.fixed_expenses for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('costs') or public.has_segment('cashflow')));

create policy segment_read on public.expenses for select to authenticated
  using (org_id = public.current_org_id() and (
    public.has_segment('cashflow') or (category = 'transport' and public.has_segment('costs'))
  ));

create policy segment_read on public.attendance for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('team_points'));
create policy segment_read on public.point_entries for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('team_points'));
create policy segment_read on public.bonuses for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('bonuses'));
