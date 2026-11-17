-- 1. A signature image for invoices, one per company (like the logo).
-- 2. Client portals hide invoices until an admin or project editor turns them
--    on; drafts can be shown too, separately.

create table public.org_signatures (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  data text not null check (data like 'data:image/%' and length(data) <= 300000),
  updated_at timestamptz not null default now()
);
alter table public.org_signatures enable row level security;
grant select, insert, update, delete on public.org_signatures to authenticated;
create policy member_read on public.org_signatures for select to authenticated using (org_id = public.current_org_id());
create policy admin_all on public.org_signatures for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

alter table public.client_portals
  add column if not exists show_invoices boolean not null default false,
  add column if not exists show_drafts boolean not null default false;
