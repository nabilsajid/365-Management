-- Several companies in one app. Each company only ever sees its own data (every
-- table is already kept apart by org_id). The owner of the app (platform owner)
-- can add companies and step into any of them as its admin, then step back.

create table public.platform_owners (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
create policy own_read on public.platform_owners for select to authenticated using (profile_id = auth.uid());
grant select on public.platform_owners to authenticated;
revoke insert, update, delete on public.platform_owners from authenticated, anon;

-- The app's owner: the 365 Frames admin account.
insert into public.platform_owners (profile_id)
select p.id from public.profiles p join auth.users u on u.id = p.id
where lower(u.email) = 'nabilsajid55@gmail.com' and p.access_role = 'admin'
on conflict do nothing;
-- If that address is not found and there is exactly one admin, that admin owns the app.
insert into public.platform_owners (profile_id)
select p.id from public.profiles p
where p.access_role = 'admin' and p.is_active
  and not exists (select 1 from public.platform_owners)
  and (select count(*) from public.profiles where access_role = 'admin' and is_active) = 1
on conflict do nothing;

-- Which company the owner is currently working in, when not their own.
create table public.company_views (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.company_views enable row level security;
create policy own_read on public.company_views for select to authenticated using (profile_id = auth.uid());
grant select on public.company_views to authenticated;
revoke insert, update, delete on public.company_views from authenticated, anon;

create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_owners o join public.profiles p on p.id = o.profile_id
    where o.profile_id = auth.uid() and p.is_active
  )
$$;

-- The company the owner stepped into, if any.
create or replace function public.viewed_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select v.org_id from public.company_views v
  where v.profile_id = auth.uid() and public.is_platform_owner()
$$;

-- Everything keyed on the company follows the one being viewed.
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.viewed_org_id(),
    (select org_id from public.profiles where id = auth.uid() and is_active)
  )
$$;

-- Inside another company the owner acts as its admin.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.viewed_org_id() is not null
    or (
      exists (select 1 from public.profiles where id = auth.uid() and is_active and access_role = 'admin')
      and not exists (select 1 from public.role_previews where profile_id = auth.uid())
    )
$$;

-- Everyone can always read their own profile, whichever company they are looking at.
create policy self_read on public.profiles for select to authenticated using (id = auth.uid());

-- Step into a company (owner only), or back to your own with null.
create or replace function public.view_company(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_home uuid;
begin
  if not public.is_platform_owner() then
    raise exception 'Only the owner of the app can switch companies.' using errcode = '42501';
  end if;
  select org_id into v_home from public.profiles where id = auth.uid();
  delete from public.role_previews where profile_id = auth.uid();
  if p_org is null or p_org = v_home then
    delete from public.company_views where profile_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'That company does not exist.' using errcode = 'P0002';
  end if;
  insert into public.company_views (profile_id, org_id) values (auth.uid(), p_org)
  on conflict (profile_id) do update set org_id = excluded.org_id, created_at = now();
end $$;
revoke all on function public.view_company(uuid) from public, anon;
grant execute on function public.view_company(uuid) to authenticated;
