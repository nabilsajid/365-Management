-- 1. Activity history: who added or changed invoices, payments, payslips,
--    projects and costs, and what changed. Admins read it in Settings.
-- 2. Weekly backups: a copy of the company's records kept for eight weeks, to
--    download as Excel from Settings → Backups.
-- 3. Notification preferences: three more kinds can be switched off.
-- 4. Recurring costs: a fixed cost can be recorded automatically each month.

-- 1. Activity history ---------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('added', 'changed', 'deleted')),
  label text,
  -- For changes: { column: [old, new] } of what changed.
  changes jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_org_idx on public.activity_log (org_id, created_at desc);
create index activity_log_row_idx on public.activity_log (row_id);
grant select on public.activity_log to authenticated;
alter table public.activity_log enable row level security;
create policy admin_read on public.activity_log for select to authenticated
  using (org_id = public.current_org_id() and public.is_admin());

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key in ('updated_at', 'last_activity_at', 'pushed_at', 'emailed_at') then continue; end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  end if;
  v_label := coalesce(v_row ->> 'invoice_number', v_row ->> 'name', v_row ->> 'description',
    case when tg_table_name = 'payslips' then 'Payslip ' || left(v_row ->> 'month', 7) end,
    case when tg_table_name = 'payments' then 'Payment ' || (v_row ->> 'amount') end);
  insert into public.activity_log (org_id, actor_id, table_name, row_id, action, label, changes)
  values ((v_row ->> 'org_id')::uuid, auth.uid(), tg_table_name, (v_row ->> 'id')::uuid,
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'deleted' end,
    left(v_label, 200), case when tg_op = 'UPDATE' then v_changes end);
  return null;
exception when others then
  -- History must never stop the change itself.
  return null;
end;
$$;

create trigger invoices_log_activity after insert or update or delete on public.invoices for each row execute function public.log_activity();
create trigger payments_log_activity after insert or update or delete on public.payments for each row execute function public.log_activity();
create trigger payslips_log_activity after insert or update or delete on public.payslips for each row execute function public.log_activity();
create trigger projects_log_activity after insert or update or delete on public.projects for each row execute function public.log_activity();
create trigger expenses_log_activity after insert or update or delete on public.expenses for each row execute function public.log_activity();
create trigger salaries_log_activity after insert or update or delete on public.salaries for each row execute function public.log_activity();

-- 2. Weekly backups -----------------------------------------------------------
create table public.backups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  data jsonb not null,
  rows integer not null default 0,
  created_at timestamptz not null default now()
);
create index backups_org_idx on public.backups (org_id, created_at desc);
grant select, delete on public.backups to authenticated;
alter table public.backups enable row level security;
create policy admin_all on public.backups for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

-- 3. Notification preferences -------------------------------------------------
-- More kinds a person can switch off: money, leave and equipment, beside
-- assignments, updates and approvals.
create or replace function public.set_my_notify_prefs(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'Settings must be an object' using errcode = '22023';
  end if;
  update public.profiles
  set notify_prefs = (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(p_prefs)
    where key in ('assignments', 'updates', 'approvals', 'money', 'leave', 'equipment') and jsonb_typeof(value) = 'boolean'
  )
  where id = auth.uid();
end $$;

-- 4. Recurring costs ----------------------------------------------------------
alter table public.fixed_expenses
  add column if not exists auto_record boolean not null default false,
  add column if not exists record_day integer not null default 1 check (record_day between 1 and 28),
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

-- Records each automatic fixed cost once a month, on its day, as a cost in Cash Flow.
create or replace function public.record_fixed_expenses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_today date;
  v_month date;
begin
  for r in
    select f.*, o.timezone from public.fixed_expenses f join public.organizations o on o.id = f.org_id
    where f.is_active and f.auto_record and f.monthly_amount > 0
  loop
    v_today := (now() at time zone r.timezone)::date;
    v_month := date_trunc('month', v_today)::date;
    if extract(day from v_today) < r.record_day then continue; end if;
    if exists (
      select 1 from public.expenses e
      where e.fixed_expense_id = r.id and e.expense_date >= v_month and e.expense_date < (v_month + interval '1 month')::date
    ) then continue; end if;
    insert into public.expenses (org_id, category, description, amount, expense_date, account_id, fixed_expense_id)
    values (r.org_id, 'fixed', r.name || ' · ' || to_char(v_month, 'FMMonth YYYY'), r.monthly_amount,
      v_month + (r.record_day - 1), r.account_id, r.id);
    perform public.notify_admins(r.org_id, 'Recorded: ' || r.name, to_char(r.monthly_amount, 'FM999G999G990D00') || ' for ' || to_char(v_month, 'FMMonth YYYY'), '/cashflow');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.record_fixed_expenses() from public, anon, authenticated;
