-- Company rules an admin can set, per-person notification settings, leave
-- requests, and a one-time tidy of older expenses.

-- 1. Company rules ---------------------------------------------------------------------

alter table public.organizations
  -- How many days the delete log keeps entries.
  add column delete_log_days integer not null default 30 check (delete_log_days between 1 and 365),
  -- Costs up to this amount, recorded by someone allowed to edit costs or cash
  -- flow, apply without waiting for approval. 0 means everything waits.
  add column auto_approve_limit numeric(14, 2) not null default 0 check (auto_approve_limit >= 0);

-- The delete log follows the company's chosen period.
drop policy admin_read on public.delete_log;
create policy admin_read on public.delete_log for select to authenticated
  using (
    org_id = public.current_org_id() and public.is_admin()
    and deleted_at > now() - make_interval(days => (select o.delete_log_days from public.organizations o where o.id = delete_log.org_id))
  );

create or replace function public.log_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(old);
  v_org uuid := nullif(v_row ->> 'org_id', '')::uuid;
  v_who uuid := auth.uid();
  v_gone boolean := false;
  v_days integer;
begin
  if v_org is null then return old; end if;
  select o.delete_log_days into v_days from public.organizations o where o.id = v_org;
  if v_days is null then return old; end if;
  if tg_nargs = 2 and (v_row ->> tg_argv[0]) is not null then
    execute format('select not exists (select 1 from public.%I where id = $1)', tg_argv[1])
      into v_gone using (v_row ->> tg_argv[0])::uuid;
    if v_gone then return old; end if;
  end if;
  if v_who is not null and not exists (select 1 from public.profiles where id = v_who) then v_who := null; end if;

  delete from public.delete_log where org_id = v_org and deleted_at < now() - make_interval(days => v_days);
  insert into public.delete_log (org_id, table_name, record_id, label, data, deleted_by)
  values (
    v_org,
    tg_table_name,
    v_row ->> 'id',
    left(coalesce(v_row ->> 'name', v_row ->> 'title', v_row ->> 'item_name', v_row ->> 'full_name',
                  v_row ->> 'invoice_number', v_row ->> 'description', v_row ->> 'message',
                  v_row ->> 'reason', v_row ->> 'body', v_row ->> 'work_date'), 120),
    v_row,
    v_who
  );
  return old;
end $$;

-- Small costs apply directly for people allowed to edit costs or cash flow.
-- Equipment purchases always wait, because they also add to the inventory.
create policy small_cost_insert on public.expenses for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (public.has_edit_segment('costs') or public.has_edit_segment('cashflow'))
    and category <> 'equipment'
    and amount is not null and amount > 0
    and amount <= (select o.auto_approve_limit from public.organizations o where o.id = expenses.org_id)
    and (traveler_id is null or traveler_id = auth.uid())
    and approved_by is null
  );

-- 2. Notification settings -----------------------------------------------------------------

-- Which kinds of notification a person wants: assignments, updates, approvals.
-- A missing key means yes.
alter table public.profiles add column notify_prefs jsonb not null default '{}'::jsonb;

create function public.set_my_notify_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;
  update public.profiles
  set notify_prefs = (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(p_prefs)
    where key in ('assignments', 'updates', 'approvals') and jsonb_typeof(value) = 'boolean'
  )
  where id = auth.uid();
end $$;
grant execute on function public.set_my_notify_prefs(jsonb) to authenticated;

-- 3. Leave requests ---------------------------------------------------------------------------

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 90)
);
create index leave_requests_org_idx on public.leave_requests (org_id, start_date);

grant select, insert, update, delete on public.leave_requests to authenticated;
revoke all on public.leave_requests from anon;
alter table public.leave_requests enable row level security;

create policy admin_all on public.leave_requests for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
-- Anyone asks for their own leave; it starts out waiting.
create policy own_insert on public.leave_requests for insert to authenticated
  with check (org_id = public.current_org_id() and employee_id = auth.uid() and status = 'pending' and decided_by is null);
-- People withdraw their own request while it is still waiting.
create policy own_withdraw on public.leave_requests for delete to authenticated
  using (org_id = public.current_org_id() and employee_id = auth.uid() and status = 'pending');
-- Everyone sees approved leave (for the calendar) and their own requests;
-- people who manage team points also see what is waiting.
create policy member_read on public.leave_requests for select to authenticated
  using (
    org_id = public.current_org_id()
    and (status = 'approved' or employee_id = auth.uid() or public.has_segment('team_points'))
  );

create function public.notify_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    select p.full_name into v_name from public.profiles p where p.id = new.employee_id;
    perform public.notify_admins(new.org_id, 'Leave requested by ' || coalesce(v_name, 'someone'),
      to_char(new.start_date, 'DD Mon') || case when new.end_date > new.start_date then ' to ' || to_char(new.end_date, 'DD Mon') else '' end,
      '/approvals');
  elsif new.status is distinct from old.status and new.status in ('approved', 'denied') and new.employee_id is distinct from auth.uid() then
    insert into public.notifications (org_id, profile_id, title, body, href)
    values (new.org_id, new.employee_id, 'Your leave was ' || new.status,
      to_char(new.start_date, 'DD Mon') || case when new.end_date > new.start_date then ' to ' || to_char(new.end_date, 'DD Mon') else '' end,
      '/leave');
  end if;
  return new;
end $$;
create trigger leave_requests_notify
after insert or update of status on public.leave_requests
for each row execute function public.notify_leave();

create trigger leave_requests_log_delete after delete on public.leave_requests for each row execute function public.log_delete('employee_id', 'profiles');
create trigger leave_requests_bump_activity after insert or update or delete on public.leave_requests for each row execute function public.bump_activity();

-- 4. One-time tidy of older expenses ---------------------------------------------------------

-- Expenses saved before "Paid from" was removed, without an account, did not
-- count against any account. They now come out of the main account like new ones.
update public.expenses e
set account_id = (
  select a.id from public.accounts a where a.org_id = e.org_id order by a.created_at, a.id limit 1
)
where e.account_id is null;
