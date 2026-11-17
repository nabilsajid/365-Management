-- A hidden (archived) project is finished: its tasks no longer send due,
-- missed-deadline or shoot reminders. Everything inside it stays as it was.

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
      where v_due and t.org_id = o.id and t.due_date = v_today + 1 and t.assignee_id is not null and not exists (select 1 from public.projects hp where hp.id = t.project_id and hp.status = 'archived')
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
      where v_missed and t.org_id = o.id and t.due_date < v_today and t.status not in ('submitted', 'approved') and t.deadline_notified_at is null and not exists (select 1 from public.projects hp where hp.id = t.project_id and hp.status = 'archived')
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
      where v_shoot_days > 0 and t.org_id = o.id and t.kind = 'shoot' and t.due_date between v_today and v_today + v_shoot_days and not exists (select 1 from public.projects hp where hp.id = t.project_id and hp.status = 'archived')
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
revoke all on function public.notify_deadlines() from public, authenticated;
