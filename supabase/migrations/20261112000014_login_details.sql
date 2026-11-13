-- Login details for the admin's employee overview.
--
-- Supabase Auth keeps passwords one-way encrypted, so nobody can read them
-- back. To let admins look up the password they gave someone, the app keeps
-- its own copy here, encrypted by the server before it is stored. Only admins
-- can read or write this table; employees have no access at all.
create table public.profile_credentials (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  password_cipher text not null,
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profile_credentials to authenticated;
revoke all on public.profile_credentials from anon;
alter table public.profile_credentials enable row level security;

create policy admin_all on public.profile_credentials for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
