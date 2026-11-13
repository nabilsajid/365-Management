-- Personal profiles and the notice board.

-- Everyone in the organization can see a colleague's name, roles and contact
-- number, so the nickname and contact live on the profile itself.
alter table public.profiles
  add column nickname text,
  add column contact text,
  add column profile_completed_at timestamptz;

-- Address and secondary contact are private: only the person and admins see them.
create table public.profile_private (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  address text,
  secondary_contact text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profile_private to authenticated;
revoke all on public.profile_private from anon;
alter table public.profile_private enable row level security;

create policy admin_all on public.profile_private for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy own_read on public.profile_private for select to authenticated
  using (org_id = public.current_org_id() and profile_id = auth.uid());

-- A person fills in or changes their own profile through this function, which
-- touches only these fields. It cannot change roles, access or anyone else.
create function public.update_my_profile(
  p_full_name text,
  p_nickname text,
  p_contact text,
  p_address text,
  p_secondary_contact text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Your full name is required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_contact, ''))) = 0 then
    raise exception 'Your contact number is required' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      nickname = nullif(trim(coalesce(p_nickname, '')), ''),
      contact = trim(p_contact),
      profile_completed_at = coalesce(profile_completed_at, now())
  where id = auth.uid();

  insert into public.profile_private (profile_id, org_id, address, secondary_contact)
  values (auth.uid(), v_org, nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_secondary_contact, '')), ''))
  on conflict (profile_id) do update
    set address = excluded.address, secondary_contact = excluded.secondary_contact, updated_at = now();
end $$;

-- Notice board. A notice with no expiry stays until an admin deletes it.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text,
  is_urgent boolean not null default false,
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notices_org_idx on public.notices (org_id, expires_at);

grant select, insert, update, delete on public.notices to authenticated;
revoke all on public.notices from anon;
alter table public.notices enable row level security;

create policy admin_all on public.notices for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
-- Everyone sees a notice until it expires; after that it simply stops showing.
create policy member_read on public.notices for select to authenticated
  using (org_id = public.current_org_id() and (expires_at is null or expires_at > now()));
