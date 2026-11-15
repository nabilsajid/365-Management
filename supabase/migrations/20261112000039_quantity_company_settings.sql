-- 1. Equipment quantity: an item can be registered as several of a kind
--    ("4 × Godox SL60 light"). As many can be out at once as there are.
-- 2. Company details for invoices (address, phone, email, website).
-- 3. Settings: which automatic reminders a company wants, how many days
--    ahead shoots are flagged, and which optional sections show in the menu.

alter table public.equipment add column if not exists quantity integer not null default 1 check (quantity between 1 and 9999);

-- As many checkouts of an item can be out at once as its quantity.
drop index if exists public.equipment_checkouts_one_out;
create or replace function public.check_equipment_available() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quantity integer;
  v_out integer;
begin
  if new.status = 'out' and (tg_op = 'INSERT' or old.status is distinct from 'out') then
    select quantity into v_quantity from public.equipment where id = new.equipment_id for update;
    select count(*) into v_out from public.equipment_checkouts where equipment_id = new.equipment_id and status = 'out' and id <> new.id;
    if v_out >= coalesce(v_quantity, 1) then
      raise exception 'All % of this item are already out. Mark one returned first.', coalesce(v_quantity, 1) using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger equipment_checkouts_available before insert or update of status on public.equipment_checkouts
for each row execute function public.check_equipment_available();

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
    -- A single item goes to the person; several of a kind are "in use" once all are out.
    update public.equipment e set
      current_holder_id = case when e.quantity = 1 then new.holder_id else null end,
      status = case when e.quantity = 1
                    or (select count(*) from public.equipment_checkouts c where c.equipment_id = e.id and c.status = 'out') >= e.quantity
                    then 'in_use' else e.status end
    where e.id = new.equipment_id;
    if new.holder_id is distinct from auth.uid() then
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (new.org_id, new.holder_id, 'Equipment ready for you: ' || v_item,
              coalesce('Return by ' || new.due_back, 'No return date set'), '/logistics?tab=checkouts');
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'returned' and old.status = 'out' then
    update public.equipment e set current_holder_id = null, status = 'available'
    where e.id = new.equipment_id and (e.quantity > 1 or e.current_holder_id is not distinct from new.holder_id);
  elsif tg_op = 'UPDATE' and new.status = 'declined' and old.status = 'requested' and new.holder_id is distinct from auth.uid() then
    insert into public.notifications (org_id, profile_id, title, body, href)
    values (new.org_id, new.holder_id, 'Equipment request declined: ' || v_item, coalesce(new.note, ''), '/logistics?tab=checkouts');
  end if;
  return new;
end $$;

alter table public.organizations
  add column if not exists contact_address text check (contact_address is null or length(contact_address) <= 300),
  add column if not exists contact_phone text check (contact_phone is null or length(contact_phone) <= 40),
  add column if not exists contact_email text check (contact_email is null or length(contact_email) <= 120),
  add column if not exists website text check (website is null or length(website) <= 200),
  add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.notify_deadlines() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  o record;
  r record;
  v_today date;
  v_due boolean;
  v_missed boolean;
  v_shoot_days integer;
  v_equipment boolean;
begin
  for o in select id, timezone, settings from public.organizations loop
    v_today := (now() at time zone o.timezone)::date;
    -- Which alerts this company wants (Settings → Reminders). Missing means on; shoots two days ahead.
    v_due := coalesce((o.settings -> 'reminders' ->> 'due_tomorrow')::boolean, true);
    v_missed := coalesce((o.settings -> 'reminders' ->> 'missed')::boolean, true);
    v_shoot_days := coalesce((o.settings -> 'reminders' ->> 'shoot_days')::integer, 2);
    v_equipment := coalesce((o.settings -> 'reminders' ->> 'equipment_late')::boolean, true);

    -- Due tomorrow: remind the assignee.
    for r in
      select t.* from public.tasks t
      where v_due and t.org_id = o.id and t.due_date = v_today + 1 and t.assignee_id is not null
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
      where v_missed and t.org_id = o.id and t.due_date < v_today and t.status not in ('submitted', 'approved') and t.deadline_notified_at is null
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
      where v_missed and pr.org_id = o.id and pr.due_date < v_today and pr.status in ('onboarding', 'active') and pr.deadline_notified_at is null
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
      where v_shoot_days > 0 and pr.org_id = o.id and pr.shoot_date between v_today and v_today + v_shoot_days
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
      where v_shoot_days > 0 and t.org_id = o.id and t.kind = 'shoot' and t.due_date between v_today and v_today + v_shoot_days
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
      where v_equipment and c.org_id = o.id and c.status = 'out' and c.due_back < v_today and c.overdue_notified_at is null
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

create or replace function public.remind_overdue_invoices() returns integer
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
      and coalesce((o.settings -> 'reminders' ->> 'invoices')::boolean, true)
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
revoke all on function public.notify_deadlines() from public, authenticated;
