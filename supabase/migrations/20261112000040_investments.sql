-- Investments. Money an investor puts into the company goes into an account,
-- so the funds go up, and the company owes that investor the same amount.
-- Paying an investor back is an expense in the "investment" category with the
-- investor chosen: it leaves the account and lowers what is owed to them.

create table public.investors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) <= 40),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index investors_org_idx on public.investors (org_id);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investor_id uuid not null references public.investors (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  received_on date not null default current_date,
  note text check (note is null or length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index investments_investor_idx on public.investments (investor_id);
create index investments_account_idx on public.investments (account_id);

-- A repayment names its investor. (The new category value is compared as text,
-- because a value added to a type cannot be used in the same update.)
alter type public.expense_category add value if not exists 'investment';
alter table public.expenses add column if not exists investor_id uuid references public.investors (id) on delete restrict;
alter table public.expenses add constraint investor_only_on_investment check (investor_id is null or category::text = 'investment');
alter table public.expenses add constraint investment_needs_investor check (category::text <> 'investment' or investor_id is not null);
create index expenses_investor_idx on public.expenses (investor_id);

grant select, insert, update, delete on public.investors, public.investments to authenticated;
alter table public.investors enable row level security;
alter table public.investments enable row level security;
create policy admin_all on public.investors for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy admin_all on public.investments for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy segment_read on public.investors for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('cashflow'));
create policy segment_read on public.investments for select to authenticated
  using (org_id = public.current_org_id() and public.has_segment('cashflow'));

create trigger investors_log_delete after delete on public.investors for each row execute function public.log_delete();
create trigger investments_log_delete after delete on public.investments for each row execute function public.log_delete('investor_id', 'investors');
create trigger investors_bump_activity after insert or update or delete on public.investors for each row execute function public.bump_activity();
create trigger investments_bump_activity after insert or update or delete on public.investments for each row execute function public.bump_activity();

-- Investments received count toward the account's balance.
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.org_id,
  (
    a.opening_balance
    + coalesce((select sum(p.amount) from public.payments p where p.account_id = a.id), 0)
    + coalesce((select sum(i.amount) from public.investments i where i.account_id = a.id), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id), 0)
  )::numeric(14, 2) as balance
from public.accounts a;

-- What the company owes each investor: invested minus repaid.
create view public.investor_balances with (security_invoker = true) as
select
  v.id as investor_id,
  v.org_id,
  coalesce((select sum(i.amount) from public.investments i where i.investor_id = v.id), 0)::numeric(14, 2) as invested,
  coalesce((select sum(e.amount) from public.expenses e where e.investor_id = v.id), 0)::numeric(14, 2) as repaid,
  (coalesce((select sum(i.amount) from public.investments i where i.investor_id = v.id), 0)
   - coalesce((select sum(e.amount) from public.expenses e where e.investor_id = v.id), 0))::numeric(14, 2) as due
from public.investors v;
grant select on public.investor_balances to authenticated;
