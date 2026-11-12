-- Urgent broadcasts to admins, equipment condition tags, and a list of
-- equipment that urgently needs to be bought.

-- Condition of each piece of equipment. Empty means not assessed yet.
alter table public.equipment
  add column condition text check (condition in ('perfect', 'moderate', 'weak'));

-- Things the studio urgently needs to get (camera battery, tripod, ...).
-- Anyone can add one; people whose roles include the equipment segment see the
-- whole list and can mark items as acquired.
create table public.equipment_needs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_name text not null check (length(trim(item_name)) > 0),
  quantity integer not null default 1 check (quantity > 0),
  note text,
  status text not null default 'needed' check (status in ('needed', 'acquired')),
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index equipment_needs_org_idx on public.equipment_needs (org_id, status);

-- A short urgent message from anyone to the admins.
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 280),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index broadcasts_org_idx on public.broadcasts (org_id, status, created_at);

grant select, insert, update, delete on public.equipment_needs, public.broadcasts to authenticated;
revoke all on public.equipment_needs, public.broadcasts from anon;

alter table public.equipment_needs enable row level security;
alter table public.broadcasts enable row level security;

create policy admin_all on public.equipment_needs for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy member_add on public.equipment_needs for insert to authenticated
  with check (org_id = public.current_org_id() and requested_by = auth.uid() and status = 'needed');
create policy segment_read on public.equipment_needs for select to authenticated
  using (org_id = public.current_org_id() and (public.has_segment('equipment') or requested_by = auth.uid()));
create policy segment_update on public.equipment_needs for update to authenticated
  using (org_id = public.current_org_id() and public.has_segment('equipment'))
  with check (org_id = public.current_org_id() and public.has_segment('equipment'));
create policy segment_delete on public.equipment_needs for delete to authenticated
  using (org_id = public.current_org_id() and public.has_segment('equipment'));

create policy admin_all on public.broadcasts for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy member_send on public.broadcasts for insert to authenticated
  with check (
    org_id = public.current_org_id() and sender_id = auth.uid() and status = 'open' and resolved_by is null
  );
create policy own_read on public.broadcasts for select to authenticated
  using (org_id = public.current_org_id() and sender_id = auth.uid());
