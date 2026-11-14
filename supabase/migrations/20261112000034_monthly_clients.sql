-- Monthly clients. A project is either one-time (as before) or monthly: one
-- project for the client that stays open, with a monthly package (the standard
-- deliverables), a month inside it for each calendar month (opened on the 1st
-- with the package's deliverables), and extras added to a single month.
-- The team stays the same every month. Admins and roles that edit projects
-- change everything; everyone in the company can read it, as with projects.

alter table public.projects
  add column if not exists kind text not null default 'one_time' check (kind in ('one_time', 'monthly'));

-- The package: what is delivered every month.
create table public.project_package_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  kind text not null default 'other' check (kind in ('shoot', 'video', 'thumbnail', 'graphic', 'other')),
  assignee_id uuid references public.profiles (id) on delete set null,
  points_value integer check (points_value is null or points_value >= 0),
  -- Day of the month it is due (1-31; past the month's end means its last day).
  due_day integer check (due_day is null or due_day between 1 and 31),
  -- A thumbnail made for one of the package's videos.
  for_item_id uuid references public.project_package_items (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index project_package_items_project_idx on public.project_package_items (project_id, position);

-- One row per month of a monthly project.
create table public.project_months (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  note text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, month)
);
create index project_months_project_idx on public.project_months (project_id, month desc);

alter table public.tasks
  add column if not exists month_id uuid references public.project_months (id) on delete cascade,
  add column if not exists is_extra boolean not null default false,
  add column if not exists package_item_id uuid references public.project_package_items (id) on delete set null;
create index if not exists tasks_month_idx on public.tasks (month_id);

grant select, insert, update, delete on public.project_package_items, public.project_months to authenticated;
alter table public.project_package_items enable row level security;
alter table public.project_months enable row level security;
create policy member_read on public.project_package_items for select to authenticated using (org_id = public.current_org_id());
create policy member_read on public.project_months for select to authenticated using (org_id = public.current_org_id());
create policy editor_all on public.project_package_items for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (
    org_id = public.current_org_id() and public.has_edit_segment('projects')
    and exists (select 1 from public.projects p where p.id = project_package_items.project_id and p.org_id = project_package_items.org_id)
  );
create policy editor_all on public.project_months for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (
    org_id = public.current_org_id() and public.has_edit_segment('projects')
    and exists (select 1 from public.projects p where p.id = project_months.project_id and p.org_id = project_months.org_id)
  );

create trigger project_package_items_log_delete after delete on public.project_package_items for each row execute function public.log_delete('project_id', 'projects');
create trigger project_package_items_bump_activity after insert or update or delete on public.project_package_items for each row execute function public.bump_activity();
create trigger project_months_bump_activity after insert or update or delete on public.project_months for each row execute function public.bump_activity();

-- Opens a month of a monthly project (once): its row, and one deliverable per
-- package item, assigned and due as the package says. Returns the month's id.
create or replace function public.open_project_month(p_project uuid, p_month date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_project record;
  v_month date := date_trunc('month', p_month)::date;
  v_last integer := extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer;
  v_id uuid;
begin
  select p.id, p.org_id, p.kind into v_project from public.projects p where p.id = p_project;
  if v_project.id is null then
    raise exception 'That project does not exist.' using errcode = 'P0002';
  end if;
  -- Called by people: only within their company and with editing rights. The daily job runs as the server.
  if auth.uid() is not null and not (v_project.org_id = public.current_org_id() and public.has_edit_segment('projects')) then
    raise exception 'Only people who edit projects can open a month.' using errcode = '42501';
  end if;

  select id into v_id from public.project_months where project_id = p_project and month = v_month;
  if v_id is not null then return v_id; end if;

  insert into public.project_months (org_id, project_id, month) values (v_project.org_id, p_project, v_month)
  returning id into v_id;

  insert into public.tasks (org_id, project_id, month_id, package_item_id, title, description, kind, assignee_id, points_value, due_date, position)
  select v_project.org_id, p_project, v_id, i.id, i.title, i.description, i.kind, i.assignee_id, i.points_value,
         case when i.due_day is null then null else v_month + (least(i.due_day, v_last) - 1) end,
         i.position
  from public.project_package_items i
  where i.project_id = p_project;

  -- Thumbnails point at this month's copy of their video.
  update public.tasks t set for_task_id = v.id
  from public.project_package_items i, public.tasks v
  where t.month_id = v_id and t.package_item_id = i.id and i.for_item_id is not null
    and v.month_id = v_id and v.package_item_id = i.for_item_id;

  return v_id;
end $$;
revoke all on function public.open_project_month(uuid, date) from public, anon;
grant execute on function public.open_project_month(uuid, date) to authenticated;

-- The daily job: opens this month for every monthly project that is still running.
create or replace function public.create_recurring_projects() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
  v_month date;
begin
  for r in
    select p.id, o.timezone from public.projects p join public.organizations o on o.id = p.org_id
    where p.kind = 'monthly' and p.status in ('onboarding', 'active')
  loop
    v_month := date_trunc('month', now() at time zone r.timezone)::date;
    continue when exists (select 1 from public.project_months m where m.project_id = r.id and m.month = v_month);
    perform public.open_project_month(r.id, v_month);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.create_recurring_projects() from public, authenticated;

-- Closing a month congratulates everyone who worked on it.
create or replace function public.notify_month_closed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    select p.name into v_name from public.projects p where p.id = new.project_id;
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, people.id, 'Well done! Month completed', v_name || ' · ' || to_char(new.month, 'Mon YYYY'), '/projects/' || new.project_id
    from (
      select m.profile_id as id from public.project_members m where m.project_id = new.project_id
      union
      select t.assignee_id from public.tasks t where t.month_id = new.id and t.assignee_id is not null
    ) people
    join public.profiles p on p.id = people.id and p.is_active;
  end if;
  return new;
end $$;
create trigger project_months_well_done after update of status on public.project_months
for each row execute function public.notify_month_closed();

-- Projects that were set to repeat by copying become monthly projects: the
-- earlier copies become months of the original, with their deliverables.
update public.projects set kind = 'monthly' where recurs_monthly;
do $$
declare
  c record;
  v_month uuid;
begin
  for c in select * from public.projects where recurring_source_id is not null loop
    insert into public.project_months (org_id, project_id, month)
    values (c.org_id, c.recurring_source_id, coalesce(c.recurring_month, date_trunc('month', c.created_at)::date))
    on conflict (project_id, month) do update set note = public.project_months.note
    returning id into v_month;
    update public.tasks set project_id = c.recurring_source_id, month_id = v_month where project_id = c.id;
    delete from public.projects where id = c.id;
  end loop;
end $$;
-- A monthly project's own deliverables become its package and its first month.
do $$
declare
  p record;
  v_month uuid;
begin
  for p in select * from public.projects where kind = 'monthly' loop
    insert into public.project_package_items (org_id, project_id, title, description, kind, assignee_id, points_value, position)
    select t.org_id, t.project_id, t.title, t.description, t.kind, t.assignee_id, t.points_value, t.position
    from public.tasks t where t.project_id = p.id and t.month_id is null
      and not exists (select 1 from public.project_package_items i where i.project_id = p.id);
    if exists (select 1 from public.tasks t where t.project_id = p.id and t.month_id is null) then
      insert into public.project_months (org_id, project_id, month)
      values (p.org_id, p.id, date_trunc('month', p.created_at)::date)
      on conflict (project_id, month) do update set note = public.project_months.note
      returning id into v_month;
      update public.tasks set month_id = v_month where project_id = p.id and month_id is null;
    end if;
  end loop;
end $$;
