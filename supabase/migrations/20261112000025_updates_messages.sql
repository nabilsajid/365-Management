-- Notices and broadcasts become one "Updates" section; admins can send a
-- personal message to one person; expenses record who approved them and
-- count against the main account when no account is chosen.

-- 1. Personal messages: a broadcast with a recipient --------------------------------

-- Empty recipient: a broadcast to the admins (as before).
-- A recipient: a personal message from an admin to that one person.
alter table public.broadcasts
  add column recipient_id uuid references public.profiles (id) on delete cascade;
create index broadcasts_recipient_idx on public.broadcasts (recipient_id, status);

-- Employees still only send to the admins.
drop policy member_send on public.broadcasts;
create policy member_send on public.broadcasts for insert to authenticated
  with check (
    org_id = public.current_org_id() and sender_id = auth.uid() and recipient_id is null
    and status = 'open' and resolved_by is null
  );
-- And read their own sent broadcasts, plus messages sent to them.
create policy recipient_read on public.broadcasts for select to authenticated
  using (org_id = public.current_org_id() and recipient_id = auth.uid());

-- The person a message was sent to marks it as done. Only that, and only theirs.
create function public.mark_message_done(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.broadcasts
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_id and recipient_id = auth.uid() and status = 'open';
  if not found then
    raise exception 'That message is not waiting for you' using errcode = '22023';
  end if;
end $$;
grant execute on function public.mark_message_done(uuid) to authenticated;

-- 2. Notifications point at the Updates section -------------------------------------

create or replace function public.notify_on_event() returns trigger
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
    select p.full_name into v_name from public.profiles p where p.id = new.sender_id;
    if new.recipient_id is null then
      perform public.notify_admins(new.org_id, 'New broadcast from ' || coalesce(v_name, 'someone'), new.message, '/updates?tab=broadcasts');
    elsif new.recipient_id is distinct from auth.uid() then
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (new.org_id, new.recipient_id, 'Message from ' || coalesce(v_name, 'an admin'), left(new.message, 200), '/updates?tab=messages');
    end if;
  elsif tg_table_name = 'projects' then
    if new.status = 'completed' and old.status is distinct from 'completed' and new.points_awarded_at is null then
      perform public.notify_admins(new.org_id, 'Project completed: give points to the team', new.name, '/projects/' || new.id || '#award');
      insert into public.notifications (org_id, profile_id, title, body, href)
      select new.org_id, p.id, 'Project completed: give points to the team', new.name, '/projects/' || new.id || '#award'
      from public.profiles p
      where p.id = auth.uid() and p.is_active and p.access_role = 'admin';
    end if;
  elsif tg_table_name = 'notices' then
    insert into public.notifications (org_id, profile_id, title, body, href)
    select new.org_id, p.id, case when new.is_urgent then 'Urgent update' else 'New update' end, new.title, '/updates'
    from public.profiles p
    where p.org_id = new.org_id and p.is_active and p.id is distinct from auth.uid();
  end if;
  return new;
end $$;

update public.notifications set href = '/updates' where href = '/notices';
update public.notifications set href = '/updates?tab=broadcasts' where href = '/broadcasts';

-- 3. Expenses: who approved them, and the main account by default --------------------

alter table public.expenses
  add column approved_by uuid references public.profiles (id) on delete set null;

-- "Paid from" is no longer asked. A new expense without an account is taken
-- from the company's main account (the first one created), so balances and
-- available funds stay right.
create function public.expenses_default_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is null then
    select a.id into new.account_id
    from public.accounts a
    where a.org_id = new.org_id
    order by a.created_at, a.id
    limit 1;
  end if;
  return new;
end $$;
create trigger expenses_default_account
before insert on public.expenses
for each row execute function public.expenses_default_account();
