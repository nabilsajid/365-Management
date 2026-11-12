-- Modules 2 and 3: accounts, invoices, payments, expenses (the single record of
-- money going out), fixed monthly expenses, transport trips and equipment inventory.
create type public.account_kind as enum ('cash', 'bank', 'mobile_wallet');
create type public.invoice_status as enum ('draft', 'sent', 'void');
create type public.expense_category as enum ('general', 'equipment', 'fixed', 'transport');
create type public.equipment_status as enum ('available', 'in_use', 'maintenance', 'retired');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind public.account_kind not null default 'cash',
  opening_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index accounts_org_idx on public.accounts (org_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  invoice_number text not null,
  issue_date date not null default current_date,
  due_date date,
  amount numeric(14, 2) not null check (amount > 0),
  status public.invoice_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);
create index invoices_client_idx on public.invoices (client_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text,
  note text,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_account_idx on public.payments (account_id);

-- Recurring costs such as rent and utilities. A month's actual payment is an
-- expense row with category 'fixed' pointing back here.
create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('rent', 'utilities', 'other')),
  monthly_amount numeric(14, 2) not null check (monthly_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index fixed_expenses_org_idx on public.fixed_expenses (org_id);

-- amount may be missing only for equipment purchases (price not known yet).
-- Transport expenses are one row per trip and must say where the trip went.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category public.expense_category not null default 'general',
  description text not null,
  amount numeric(14, 2) check (amount >= 0),
  expense_date date not null default current_date,
  account_id uuid references public.accounts (id) on delete set null,
  fixed_expense_id uuid references public.fixed_expenses (id) on delete set null,
  trip_origin text,
  trip_destination text,
  traveler_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint expense_amount_required check (amount is not null or category = 'equipment'),
  constraint transport_needs_trip check (
    category <> 'transport' or (trip_origin is not null and trip_destination is not null)
  ),
  constraint fixed_link_only_on_fixed check (fixed_expense_id is null or category = 'fixed')
);
create index expenses_org_date_idx on public.expenses (org_id, expense_date);
create index expenses_account_idx on public.expenses (account_id);

-- Equipment is independent of projects. purchase_price is optional so existing
-- gear can be registered without knowing what it cost.
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text,
  serial_number text,
  purchase_price numeric(14, 2) check (purchase_price >= 0),
  purchase_date date,
  status public.equipment_status not null default 'available',
  current_holder_id uuid references public.profiles (id) on delete set null,
  holder_since timestamptz,
  source_expense_id uuid unique references public.expenses (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index equipment_org_idx on public.equipment (org_id);
create index equipment_holder_idx on public.equipment (current_holder_id);

create function public.stamp_equipment_holder() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.current_holder_id is distinct from old.current_holder_id then
    new.holder_since := case when new.current_holder_id is null then null else now() end;
  end if;
  return new;
end $$;

create trigger equipment_stamp_holder
before insert or update of current_holder_id on public.equipment
for each row execute function public.stamp_equipment_holder();

-- An expense marked as an equipment purchase creates its inventory record,
-- with or without a price. Later price corrections flow through while the
-- inventory price still matches what the expense said before.
create function public.sync_equipment_from_expense() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'equipment' then
    insert into public.equipment (org_id, name, purchase_price, purchase_date, source_expense_id)
    values (new.org_id, new.description, new.amount, new.expense_date, new.id)
    on conflict (source_expense_id) do nothing;

    if tg_op = 'UPDATE' and new.amount is distinct from old.amount then
      update public.equipment set purchase_price = new.amount
      where source_expense_id = new.id and purchase_price is not distinct from old.amount;
    end if;
  end if;
  return new;
end $$;

create trigger expenses_sync_equipment
after insert or update of category, amount on public.expenses
for each row execute function public.sync_equipment_from_expense();

create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.org_id,
  i.amount,
  coalesce(sum(p.amount), 0)::numeric(14, 2) as paid,
  (i.amount - coalesce(sum(p.amount), 0))::numeric(14, 2) as outstanding
from public.invoices i
left join public.payments p on p.invoice_id = i.id
group by i.id;

create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.org_id,
  (
    a.opening_balance
    + coalesce((select sum(p.amount) from public.payments p where p.account_id = a.id), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id), 0)
  )::numeric(14, 2) as balance
from public.accounts a;
