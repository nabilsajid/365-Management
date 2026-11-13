-- Forgotten passwords. Someone who cannot sign in asks from the login page;
-- the request shows on the admin's Approvals page, where the admin sets a new
-- password for them or dismisses the request.
--
-- People who are signed out have no access to this table at all. The server
-- records a request on their behalf, and only for an email that belongs to an
-- active person.
create table public.password_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_requests_org_idx on public.password_requests (org_id, status, created_at);

grant select, insert, update, delete on public.password_requests to authenticated;
revoke all on public.password_requests from anon;
alter table public.password_requests enable row level security;

create policy admin_all on public.password_requests for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
