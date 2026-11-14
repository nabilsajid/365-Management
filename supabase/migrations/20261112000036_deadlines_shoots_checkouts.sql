-- 1. Deadline alerts, run by the daily job:
--    * the day before a deliverable is due, its assignee is reminded;
--    * once it is past due and not submitted or approved, the assignee and the
--      admins are told (once);
--    * a project past its due date tells the admins and its team (once).
-- 2. Shoot reminders: two days before a shoot that is not confirmed yet, the
--    admins and the people on it are told (once).
-- 3. Equipment checkouts: who takes which item, for what, from when and until
--    when. Anyone can ask to take an item; admins and roles that edit equipment
--    approve, record it directly, and mark it returned. Late returns are flagged.
-- Changing a date clears its alerts, so a new date is reminded again.

alter table public.tasks
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists deadline_notified_at timestamptz,
  add column if not exists shoot_alerted_at timestamptz;
alter table public.projects
  add column if not exists deadline_notified_at timestamptz,
  add column if not exists shoot_alerted_at timestamptz;

create or replace function public.reset_date_alerts() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'tasks' and new.due_date is distinct from old.due_date then
    new.reminder_sent_at := null;
    new.deadline_notified_at := null;
    new.shoot_alerted_at := null;
  elsif tg_table_name = 'projects' then
    if new.due_date is distinct from old.due_date then new.deadline_notified_at := null; end if;
    if new.shoot_date is distinct from old.shoot_date then new.shoot_alerted_at := null; end if;
  end if;
  return new;
end $$;
create trigger tasks_reset_date_alerts before update of due_date on public.tasks
for each row execute function public.reset_date_alerts();
create trigger projects_reset_date_alerts before update of due_date, shoot_date on public.projects
for each row execute function public.reset_date_alerts();

-- 3. Equipment checkouts -----------------------------------------------------------------

create table public.equipment_checkouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete cascade,
  holder_id uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid references public.profiles (id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'out', 'returned', 'declined', 'cancelled')),
  purpose text check (purpose is null or length(purpose) <= 300),
  project_id uuid references public.projects (id) on delete set null,
  start_date date not null default current_date,
  due_back date,
  taken_at timestamptz,
  returned_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check (due_back is null or due_back >= start_date)
);
create index equipment_checkouts_org_idx on public.equipment_checkouts (org_id, status);
create index equipment_checkouts_item_idx on public.equipment_checkouts (equipment_id, created_at desc);
-- An item is out with one person at a time.
create unique index equipment_checkouts_one_out on public.equipment_checkouts (equipment_id) where status = 'out';

grant select, insert, update, delete on public.equipment_checkouts to authenticated;
alter table public.equipment_checkouts enable row level security;
create policy read_own_or_segment on public.equipment_checkouts for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('equipment') or holder_id = auth.uid() or requested_by = auth.uid()));
-- Anyone asks to take an item for themselves; it waits for approval.
create policy member_request on public.equipment_checkouts for insert to authenticated
  with check (
    org_id = public.current_org_id() and holder_id = auth.uid() and requested_by = auth.uid() and status = 'requested'
    and exists (select 1 from public.equipment e where e.id = equipment_checkouts.equipment_id and e.org_id = equipment_checkouts.org_id)
  );
create policy editor_all on public.equipment_checkouts for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('equipment'))
  with check (
    org_id = public.current_org_id() and public.has_edit_segment('equipment')
    and exists (select 1 from public.equipment e where e.id = equipment_checkouts.equipment_id and e.org_id = equipment_checkouts.org_id)
  );

-- Everyone can see the equipment list, to know what there is to ask for.
create policy member_read_all on public.equipment for select to authenticated
  using (org_id = public.current_org_id());

-- Keeps the equipment record in step with checkouts, and tells people.
create or replace function public.equipment_checkout_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item text;
  v_who text;
begin
  select e.name into v_item from public.equipment e where e.id = new.equipment_id;
  select p.full_name into v_who from public.profiles p where p.id = new.holder_id;

  if tg_op = 'INSERT' and new.status = 'requested' then
    perform public.notify_admins(new.org_id, 'Equipment request: ' || v_item,
      coalesce(v_who, 'Someone') || coalesce(' · until ' || new.due_back, '') || coalesce(' · ' || new.purpose, ''), '/logistics?tab=checkouts');
  end if;

  if new.status = 'out' and (tg_op = 'INSERT' or old.status is distinct from 'out') then
    update public.equipment set current_holder_id = new.holder_id, status = 'in_use' where id = new.equipment_id;
    if new.holder_id is distinct from auth.uid() then
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (new.org_id, new.holder_id, 'Equipment ready for you: ' || v_item,
              coalesce('Return by ' || new.due_back, 'No return date set'), '/logistics?tab=checkouts');
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'returned' and old.status = 'out' then
    update public.equipment set current_holder_id = null, status = 'available'
    where id = new.equipment_id and current_holder_id is not distinct from new.holder_id;
  elsif tg_op = 'UPDATE' and new.status = 'declined' and old.status = 'requested' and new.holder_id is distinct from auth.uid() then
    insert into public.notifications (org_id, profile_id, title, body, href)
    values (new.org_id, new.holder_id, 'Equipment request declined: ' || v_item, coalesce(new.note, ''), '/logistics?tab=checkouts');
  end if;
  return new;
end $$;
create trigger equipment_checkouts_changed after insert or update of status on public.equipment_checkouts
for each row execute function public.equipment_checkout_changed();
create trigger equipment_checkouts_log_delete after delete on public.equipment_checkouts for each row execute function public.log_delete('equipment_id', 'equipment');
create trigger equipment_checkouts_bump_activity after insert or update or delete on public.equipment_checkouts for each row execute function public.bump_activity();

-- The person who asked can cancel a request that is still waiting, or hand back an item they hold.
create or replace function public.my_checkout_action(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.equipment_checkouts;
begin
  select * into v_row from public.equipment_checkouts where id = p_id and org_id = public.current_org_id();
  if v_row.id is null or v_row.holder_id is distinct from auth.uid() then
    raise exception 'That is not your checkout.' using errcode = '42501';
  end if;
  if p_action = 'cancel' and v_row.status = 'requested' then
    update public.equipment_checkouts set status = 'cancelled' where id = p_id;
  elsif p_action = 'return' and v_row.status = 'out' then
    update public.equipment_checkouts set status = 'returned', returned_at = now() where id = p_id;
    perform public.notify_admins(v_row.org_id, 'Equipment returned',
      (select e.name from public.equipment e where e.id = v_row.equipment_id) || ' · ' ||
      (select p.full_name from public.profiles p where p.id = v_row.holder_id), '/logistics?tab=checkouts');
  else
    raise exception 'That cannot be done now.' using errcode = '22023';
  end if;
end $$;
revoke all on function public.my_checkout_action(uuid, text) from public, anon;
grant execute on function public.my_checkout_action(uuid, text) to authenticated;

-- 1 + 2. The daily alerts -------------------------------------------------------------------

create or replace function public.notify_deadlines() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  o record;
  r record;
  v_today date;
begin
  for o in select id, timezone from public.organizations loop
    v_today := (now() at time zone o.timezone)::date;

    -- Due tomorrow: remind the assignee.
    for r in
      select t.* from public.tasks t
      where t.org_id = o.id and t.due_date = v_today + 1 and t.assignee_id is not null
        and t.status not in ('submitted', 'approved') and t.reminder_sent_at is null
    loop
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (o.id, r.assignee_id, 'Due tomorrow: ' || r.title, 'Deadline ' || to_char(r.due_date, 'DD Mon'), '/tasks/' || r.id);
      update public.tasks set reminder_sent_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;

    -- Missed: tell the assignee and the admins, once.
    for r in
      select t.*, p.full_name as assignee_name from public.tasks t left join public.profiles p on p.id = t.assignee_id
      where t.org_id = o.id and t.due_date < v_today and t.status not in ('submitted', 'approved') and t.deadline_notified_at is null
    loop
      if r.assignee_id is not null then
        insert into public.notifications (org_id, profile_id, title, body, href)
        values (o.id, r.assignee_id, 'Deadline missed: ' || r.title, 'It was due ' || to_char(r.due_date, 'DD Mon') || '. Submit it as soon as you can.', '/tasks/' || r.id);
      end if;
      perform public.notify_admins(o.id, 'Deadline missed: ' || r.title,
        coalesce(r.assignee_name, 'Unassigned') || ' · due ' || to_char(r.due_date, 'DD Mon'), '/tasks/' || r.id);
      update public.tasks set deadline_notified_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;

    -- Projects past their due date: the admins and the team, once.
    for r in
      select pr.* from public.projects pr
      where pr.org_id = o.id and pr.due_date < v_today and pr.status in ('onboarding', 'active') and pr.deadline_notified_at is null
    loop
      perform public.notify_admins(o.id, 'Project past its due date: ' || r.name, 'It was due ' || to_char(r.due_date, 'DD Mon'), '/projects/' || r.id);
      insert into public.notifications (org_id, profile_id, title, body, href)
      select o.id, m.profile_id, 'Project past its due date: ' || r.name, 'It was due ' || to_char(r.due_date, 'DD Mon'), '/projects/' || r.id
      from public.project_members m join public.profiles p on p.id = m.profile_id
      where m.project_id = r.id and p.is_active and p.access_role <> 'admin';
      update public.projects set deadline_notified_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;

    -- A shoot within two days that is not confirmed: the admins and the team.
    for r in
      select pr.* from public.projects pr
      where pr.org_id = o.id and pr.shoot_date between v_today and v_today + 2
        and coalesce(pr.shoot_status, 'none') <> 'confirmed' and pr.shoot_alerted_at is null
    loop
      perform public.notify_admins(o.id, 'Shoot not confirmed: ' || r.name,
        'Planned for ' || to_char(r.shoot_date, 'Dy DD Mon') || '. Confirm it with the client.', '/projects/' || r.id);
      insert into public.notifications (org_id, profile_id, title, body, href)
      select o.id, m.profile_id, 'Shoot not confirmed: ' || r.name, 'Planned for ' || to_char(r.shoot_date, 'Dy DD Mon'), '/projects/' || r.id
      from public.project_members m join public.profiles p on p.id = m.profile_id
      where m.project_id = r.id and p.is_active and p.access_role <> 'admin';
      update public.projects set shoot_alerted_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;
    -- A shoot deliverable due within two days whose project's shoot is not confirmed.
    for r in
      select t.*, pr.name as project_name from public.tasks t join public.projects pr on pr.id = t.project_id
      where t.org_id = o.id and t.kind = 'shoot' and t.due_date between v_today and v_today + 2
        and t.status not in ('submitted', 'approved') and coalesce(pr.shoot_status, 'none') <> 'confirmed'
        and t.shoot_alerted_at is null and pr.shoot_alerted_at is null
    loop
      perform public.notify_admins(o.id, 'Shoot not confirmed: ' || r.title,
        r.project_name || ' · ' || to_char(r.due_date, 'Dy DD Mon'), '/projects/' || r.project_id);
      if r.assignee_id is not null then
        insert into public.notifications (org_id, profile_id, title, body, href)
        values (o.id, r.assignee_id, 'Shoot not confirmed: ' || r.title, r.project_name || ' · ' || to_char(r.due_date, 'Dy DD Mon'), '/tasks/' || r.id);
      end if;
      update public.tasks set shoot_alerted_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;

    -- Equipment not back on time: the holder and the admins, once.
    for r in
      select c.*, e.name as item, p.full_name as holder_name from public.equipment_checkouts c
      join public.equipment e on e.id = c.equipment_id join public.profiles p on p.id = c.holder_id
      where c.org_id = o.id and c.status = 'out' and c.due_back < v_today and c.overdue_notified_at is null
    loop
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (o.id, r.holder_id, 'Please return: ' || r.item, 'It was due back ' || to_char(r.due_back, 'DD Mon'), '/logistics?tab=checkouts');
      perform public.notify_admins(o.id, 'Equipment overdue: ' || r.item, r.holder_name || ' · due back ' || to_char(r.due_back, 'DD Mon'), '/logistics?tab=checkouts');
      update public.equipment_checkouts set overdue_notified_at = now() where id = r.id;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;
revoke all on function public.notify_deadlines() from public, authenticated;
