-- 1. Client portal: one private link per client showing all their projects,
--    deliverables to approve, and invoices. Answers go into client_feedback.
-- 2. Payroll: a monthly salary per person and a payslip per person and month.
--    Paying a payslip records a salary expense. Only admins see salaries,
--    and each person sees their own payslips.
-- 3. Monthly fee on monthly clients; the daily job drafts each month's invoice.
-- 4. Email copies of urgent alerts: emailed_at marks the ones already sent.

-- 1 ------------------------------------------------------------------------------
create table public.client_portals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null unique references public.clients (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.client_portals to authenticated;
revoke all on public.client_portals from anon;
alter table public.client_portals enable row level security;
create policy editor_all on public.client_portals for all to authenticated
  using (org_id = public.current_org_id() and (public.is_admin() or public.has_edit_segment('projects')))
  with check (org_id = public.current_org_id() and (public.is_admin() or public.has_edit_segment('projects')));

alter table public.client_feedback alter column link_id drop not null;
alter table public.client_feedback add column if not exists portal_id uuid references public.client_portals (id) on delete cascade;
alter table public.client_feedback add constraint client_feedback_from_link_or_portal check (link_id is not null or portal_id is not null);

-- 2 ------------------------------------------------------------------------------
alter type public.expense_category add value if not exists 'salary';

create table public.salaries (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  monthly_amount numeric(14, 2) not null check (monthly_amount >= 0),
  updated_at timestamptz not null default now()
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  base_salary numeric(14, 2) not null default 0 check (base_salary >= 0),
  bonus numeric(14, 2) not null default 0 check (bonus >= 0),
  additions numeric(14, 2) not null default 0 check (additions >= 0),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0),
  days_present integer not null default 0,
  leave_days integer not null default 0,
  points integer not null default 0,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'paid')),
  paid_on date,
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, month)
);
create index payslips_org_month_idx on public.payslips (org_id, month);

grant select, insert, update, delete on public.salaries, public.payslips to authenticated;
alter table public.salaries enable row level security;
alter table public.payslips enable row level security;
create policy admin_all on public.salaries for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy admin_all on public.payslips for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy own_read on public.payslips for select to authenticated
  using (org_id = public.current_org_id() and profile_id = auth.uid() and status = 'paid');
create trigger payslips_log_delete after delete on public.payslips for each row execute function public.log_delete('profile_id', 'profiles');

-- 3 ------------------------------------------------------------------------------
alter table public.projects add column if not exists monthly_fee numeric(14, 2) check (monthly_fee is null or monthly_fee > 0);
alter table public.invoices add column if not exists project_month_id uuid unique references public.project_months (id) on delete set null;

-- Drafts this month's invoice for every monthly client with a fee, once per month.
-- The notes list the fixed deliverables. Admins are told so they can check and send it.
create or replace function public.draft_monthly_invoices() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
  v_lines text;
  v_invoice uuid;
begin
  for r in
    select p.id as project_id, p.org_id, p.name, p.client_id, p.monthly_fee, m.id as month_id, m.month
    from public.projects p
    join public.organizations o on o.id = p.org_id
    join public.project_months m on m.project_id = p.id
      and m.month = date_trunc('month', (now() at time zone o.timezone))::date
    where p.kind = 'monthly' and p.status in ('onboarding', 'active') and p.monthly_fee is not null and p.client_id is not null
      and not exists (select 1 from public.invoices i where i.project_month_id = m.id)
  loop
    select string_agg(
             case when t.quantity is null then t.label
                  else t.quantity || ' ' || t.kind || case when t.quantity > 1 then 's' else '' end || coalesce(' (' || t.label || ')', '') end,
             ', ' order by t.position)
      into v_lines
    from public.project_targets t where t.project_id = r.project_id;
    insert into public.invoices (org_id, client_id, project_id, project_month_id, invoice_number, issue_date, due_date, amount, status, notes)
    values (r.org_id, r.client_id, r.project_id, r.month_id,
            'INV-' || to_char(r.month, 'YYYY-MM') || '-' || upper(left(md5(r.project_id::text), 4)),
            r.month, r.month + 14, r.monthly_fee, 'draft',
            r.name || ', ' || to_char(r.month, 'FMMonth YYYY') || coalesce(': ' || v_lines, ''))
    returning id into v_invoice;
    perform public.notify_admins(r.org_id, 'Invoice drafted: ' || r.name, to_char(r.month, 'FMMonth YYYY') || ' · check it and mark it sent', '/cashflow?tab=income');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.draft_monthly_invoices() from public, authenticated;

-- 4 ------------------------------------------------------------------------------
alter table public.notifications add column if not exists emailed_at timestamptz;
