-- Module 4: attendance, monthly points, violations and bonuses.
-- Points live in a ledger keyed by month. A new month has no entries, so every
-- employee starts it at zero while earlier months stay untouched.
create type public.attendance_status as enum ('pending', 'verified', 'rejected');
create type public.point_source as enum ('attendance', 'task', 'violation', 'adjustment');
create type public.bonus_status as enum ('pending', 'approved', 'rejected');

create table public.point_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  monthly_target integer not null default 1500 check (monthly_target >= 0),
  attendance_points integer not null default 100 check (attendance_points >= 0),
  default_task_points integer not null default 0 check (default_task_points >= 0),
  bonus_step_points integer not null default 1000 check (bonus_step_points > 0),
  bonus_step_amount numeric(14, 2) not null default 1000 check (bonus_step_amount >= 0)
);

create function public.create_point_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.point_settings (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger organizations_create_point_settings
after insert on public.organizations
for each row execute function public.create_point_settings();

create table public.violation_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  deduction_points integer not null check (deduction_points > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index violation_types_org_idx on public.violation_types (org_id);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  status public.attendance_status not null default 'pending',
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index attendance_org_date_idx on public.attendance (org_id, work_date);

create table public.point_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  points integer not null check (points <> 0),
  source public.point_source not null,
  attendance_id uuid unique references public.attendance (id) on delete cascade,
  task_id uuid unique references public.tasks (id) on delete cascade,
  violation_type_id uuid references public.violation_types (id) on delete set null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint violation_is_documented_deduction check (
    source <> 'violation' or (points < 0 and reason is not null and length(trim(reason)) > 0)
  ),
  constraint adjustment_has_reason check (
    source <> 'adjustment' or (reason is not null and length(trim(reason)) > 0)
  )
);
create index point_entries_employee_month_idx on public.point_entries (employee_id, period_month);

-- A bonus is only ever a proposal until an admin approves it.
create table public.bonuses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  points_total integer not null,
  amount numeric(14, 2) not null check (amount >= 0),
  status public.bonus_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, period_month)
);
create index bonuses_org_month_idx on public.bonuses (org_id, period_month);

create view public.monthly_points with (security_invoker = true) as
select
  org_id,
  employee_id,
  period_month,
  sum(points)::integer as total_points,
  coalesce(sum(points) filter (where points > 0), 0)::integer as earned_points,
  coalesce(sum(points) filter (where points < 0), 0)::integer as deducted_points
from public.point_entries
group by org_id, employee_id, period_month;

-- Verified office day => attendance points for the month of that day.
-- Un-verifying removes them again.
create function public.sync_points_from_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_points integer;
begin
  if new.status = 'verified' then
    select attendance_points into v_points from public.point_settings where org_id = new.org_id;
    if coalesce(v_points, 0) > 0 then
      insert into public.point_entries
        (org_id, employee_id, period_month, points, source, attendance_id, created_by)
      values
        (new.org_id, new.employee_id, date_trunc('month', new.work_date)::date, v_points,
         'attendance', new.id, new.verified_by)
      on conflict (attendance_id) do nothing;
    end if;
  else
    delete from public.point_entries where attendance_id = new.id;
  end if;
  return new;
end $$;

create trigger attendance_sync_points
after insert or update of status on public.attendance
for each row execute function public.sync_points_from_attendance();

-- Approved task => points for its assignee in the month of approval.
-- The task's own points_value wins over the organization default.
create function public.sync_points_from_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_points integer;
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    select coalesce(new.points_value, s.default_task_points) into v_points
    from public.point_settings s where s.org_id = new.org_id;
    if new.assignee_id is not null and coalesce(v_points, 0) > 0 then
      insert into public.point_entries
        (org_id, employee_id, period_month, points, source, task_id)
      values
        (new.org_id, new.assignee_id, public.org_month(new.org_id, now()), v_points, 'task', new.id)
      on conflict (task_id) do nothing;
    end if;
  elsif old.status = 'approved' and new.status <> 'approved' then
    delete from public.point_entries where task_id = new.id;
  end if;
  return new;
end $$;

create trigger tasks_sync_points
after update of status on public.tasks
for each row execute function public.sync_points_from_task();

-- Propose bonuses for a finished month: one bonus step for every full
-- bonus_step_points above the monthly target. Decided bonuses are never touched;
-- pending ones are recalculated.
create function public.calculate_bonuses(p_month date) returns setof public.bonuses
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
  v_month date := date_trunc('month', p_month)::date;
  s public.point_settings;
begin
  if v_org is null or not public.is_admin() then
    raise exception 'Only admins can calculate bonuses' using errcode = '42501';
  end if;
  if v_month >= public.org_month(v_org, now()) then
    raise exception 'Month % has not ended yet', to_char(v_month, 'YYYY-MM') using errcode = '22023';
  end if;

  select * into s from public.point_settings where org_id = v_org;

  delete from public.bonuses
  where org_id = v_org and period_month = v_month and status = 'pending';

  insert into public.bonuses (org_id, employee_id, period_month, points_total, amount)
  select
    v_org, mp.employee_id, v_month, mp.total_points,
    floor((mp.total_points - s.monthly_target)::numeric / s.bonus_step_points) * s.bonus_step_amount
  from public.monthly_points mp
  where mp.org_id = v_org
    and mp.period_month = v_month
    and mp.total_points - s.monthly_target >= s.bonus_step_points
  on conflict (employee_id, period_month) do nothing;

  return query
    select * from public.bonuses
    where org_id = v_org and period_month = v_month
    order by amount desc;
end $$;
