-- 1. Leave types: casual, sick, unpaid or other. Casual and sick days come out
--    of a yearly allowance (set by admins); unpaid days are taken off the payslip.
-- 2. Salary advances: money given to an employee ahead of salary, taken back
--    from their next payslips in instalments until it is repaid.

alter table public.leave_requests add column if not exists kind text not null default 'casual'
  check (kind in ('casual', 'sick', 'unpaid', 'other'));
alter table public.payslips
  add column if not exists unpaid_leave_days integer not null default 0,
  add column if not exists advance_repaid numeric(14, 2) not null default 0 check (advance_repaid >= 0);

create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  -- How much is taken back from each payslip until it is repaid.
  per_month numeric(14, 2) not null check (per_month > 0),
  given_on date not null default current_date,
  account_id uuid references public.accounts (id) on delete set null,
  expense_id uuid references public.expenses (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index salary_advances_profile_idx on public.salary_advances (profile_id);
-- Which payslip took how much back from which advance.
create table public.advance_repayments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  advance_id uuid not null references public.salary_advances (id) on delete cascade,
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  unique (advance_id, payslip_id)
);

grant select, insert, update, delete on public.salary_advances, public.advance_repayments to authenticated;
alter table public.salary_advances enable row level security;
alter table public.advance_repayments enable row level security;
create policy admin_all on public.salary_advances for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy own_read on public.salary_advances for select to authenticated
  using (org_id = public.current_org_id() and profile_id = auth.uid());
create policy admin_all on public.advance_repayments for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create trigger salary_advances_log_delete after delete on public.salary_advances for each row execute function public.log_delete('profile_id', 'profiles');

-- What is still owed on each advance.
create view public.advance_balances with (security_invoker = true) as
select a.id as advance_id, a.org_id, a.profile_id, a.amount, a.per_month,
       coalesce((select sum(r.amount) from public.advance_repayments r where r.advance_id = a.id), 0)::numeric(14, 2) as repaid,
       (a.amount - coalesce((select sum(r.amount) from public.advance_repayments r where r.advance_id = a.id), 0))::numeric(14, 2) as left_to_repay
from public.salary_advances a;
grant select on public.advance_balances to authenticated;
