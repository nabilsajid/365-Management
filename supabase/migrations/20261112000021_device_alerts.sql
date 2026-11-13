-- Alerts on the device: each browser or installed app that asked for alerts
-- registers an address here, and a notification is pushed to it once.

alter table public.notifications add column pushed_at timestamptz;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

grant select, insert, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;
alter table public.push_subscriptions enable row level security;

-- People manage only their own devices.
create policy own_read on public.push_subscriptions for select to authenticated
  using (profile_id = auth.uid());
create policy own_insert on public.push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid() and org_id = public.current_org_id());
create policy own_delete on public.push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());
