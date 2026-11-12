-- Core: organizations, employee profiles, and helper functions used by every module.
create extension if not exists pgcrypto;

create type public.access_role as enum ('admin', 'employee');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Dhaka',
  currency text not null default 'BDT',
  created_at timestamptz not null default now()
);

-- One row per signed-in person. access_role controls permissions;
-- job_title is the visible job role shown next to the person's name.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  job_title text,
  access_role public.access_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (org_id);

-- Organization of the signed-in user (null when signed out).
create function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() and is_active
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and access_role = 'admin'
  )
$$;

-- First day of the month a timestamp falls in, in the organization's timezone.
-- Points are bucketed by this value, which is what makes them "reset" monthly.
create function public.org_month(p_org uuid, p_at timestamptz) returns date
language sql stable security definer set search_path = public as $$
  select date_trunc('month', p_at at time zone o.timezone)::date
  from public.organizations o where o.id = p_org
$$;
