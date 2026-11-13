-- More notifications, points for a finished project, and live updates.

-- 1. A finished project asks the admin to give its team points -------------------

alter table public.projects add column points_awarded_at timestamptz;
-- Projects that were already finished are not put back on the admin's list.
update public.projects set points_awarded_at = now() where status = 'completed';

-- 2. Notifications for admins and for everyone ------------------------------------

-- Tells every admin of an organization, except the person who caused it.
create function public.notify_admins(p_org uuid, p_title text, p_body text, p_href text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (org_id, profile_id, title, body, href)
  select p_org, p.id, p_title, left(p_body, 200), p_href
  from public.profiles p
  where p.org_id = p_org and p.is_active and p.access_role = 'admin' and p.id is distinct from auth.uid()
$$;

create function public.notify_on_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if tg_table_name = 'change_requests' then
    if new.status = 'pending' then
      perform public.notify_admins(new.org_id, 'A change is waiting for your approval', new.summary, '/approvals');
    end if;
  elsif tg_table_name = 'task_submissions' then
    select t.title into v_name from public.tasks t where t.id = new.task_id;
    perform public.notify_admins(new.org_id, 'Work was submitted for review', v_name, '/approvals');
  elsif tg_table_name = 'attendance' then
    if new.status = 'pending' then
      select p.full_name into v_name from public.profiles p where p.id = new.employee_id;
      perform public.notify_admins(new.org_id, 'Attendance is waiting to be verified', v_name || ' · ' || new.work_date, '/approvals');
    end if;
  elsif tg_table_name = 'password_requests' then
    perform public.notify_admins(new.org_id, 'Someone forgot their password', new.email, '/approvals');
  elsif tg_table_name = 'broadcasts' then
    perform public.notify_admins(new.org_id, 'New broadcast', new.message, '/broadcasts');
  elsif tg_table_name = 'projects' then
    if new.status = 'completed' and old.status is distinct from 'completed' and new.points_awarded_at is null then
      perform public.notify_admins(new.org_id, 'Project completed: give points to the team', new.name, '/projects/' || new.id || '#award');
      -- The admin who completes it should still see it on their list, so they are told too.
      insert into public.notifications (org_id, profile_id, title, body, href)
      select new.org_id, p.id, 'Project completed: give points to the team', new.name, '/projects/' || new.id || '#award'
      from public.profiles p
      where p.id = auth.uid() and p.is_active and p.access_role = 'admin';
    end if;
  elsif tg_table_name = 'notices' then
    -- A notice goes to everyone, admins and employees alike.
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, p.id, case when new.is_urgent then 'Urgent notice' else 'New notice' end, new.title, '/notices'
    from public.profiles p
    where p.org_id = new.org_id and p.is_active and p.id is distinct from auth.uid();
  end if;
  return new;
end $$;

create trigger change_requests_notify after insert on public.change_requests for each row execute function public.notify_on_event();
create trigger task_submissions_notify after insert on public.task_submissions for each row execute function public.notify_on_event();
create trigger attendance_notify after insert on public.attendance for each row execute function public.notify_on_event();
create trigger password_requests_notify after insert on public.password_requests for each row execute function public.notify_on_event();
create trigger broadcasts_notify after insert on public.broadcasts for each row execute function public.notify_on_event();
create trigger notices_notify after insert on public.notices for each row execute function public.notify_on_event();
create trigger projects_completed_notify after update of status on public.projects for each row execute function public.notify_on_event();

-- 3. Live updates --------------------------------------------------------------------

-- One counter per organization that goes up whenever anything changes. Open
-- apps watch it and reload their data when it moves, so nobody has to refresh.
create table public.org_activity (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  version bigint not null default 0,
  changed_at timestamptz not null default now()
);
insert into public.org_activity (org_id) select id from public.organizations on conflict do nothing;

grant select on public.org_activity to authenticated;
revoke all on public.org_activity from anon;
alter table public.org_activity enable row level security;
create policy member_read on public.org_activity for select to authenticated
  using (org_id = public.current_org_id());

create function public.bump_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := nullif(to_jsonb(coalesce(new, old)) ->> 'org_id', '')::uuid;
begin
  if v_org is not null and exists (select 1 from public.organizations where id = v_org) then
    insert into public.org_activity (org_id, version) values (v_org, 1)
    on conflict (org_id) do update set version = public.org_activity.version + 1, changed_at = now();
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'projects', 'tasks', 'task_submissions', 'accounts', 'invoices', 'payments',
    'fixed_expenses', 'expenses', 'equipment', 'equipment_needs', 'violation_types', 'attendance',
    'point_entries', 'bonuses', 'roles', 'profile_roles', 'broadcasts', 'notices', 'project_comments',
    'project_members', 'change_requests', 'password_requests', 'notifications', 'point_settings'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_activity()', t || '_bump_activity', t);
  end loop;
end $$;

-- Lets open apps hear about the counter moving straight away (Supabase Realtime).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.org_activity;
  end if;
end $$;
