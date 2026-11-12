-- Change requests: when someone who is not an admin edits a section their role
-- can see, the change is stored here instead of being applied. An admin then
-- approves it (the change is applied) or denies it (nothing happens).
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  method text not null check (method in ('POST', 'PATCH', 'DELETE')),
  path text not null check (path like '/api/%'),
  body jsonb,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index change_requests_org_idx on public.change_requests (org_id, status, created_at);

grant select, insert, update, delete on public.change_requests to authenticated;
revoke all on public.change_requests from anon;
alter table public.change_requests enable row level security;

create policy admin_all on public.change_requests for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());
create policy member_add on public.change_requests for insert to authenticated
  with check (
    org_id = public.current_org_id() and requested_by = auth.uid() and status = 'pending' and decided_by is null
  );
create policy own_read on public.change_requests for select to authenticated
  using (org_id = public.current_org_id() and requested_by = auth.uid());

-- A colour for each role's label.
alter table public.roles
  add column color text not null default 'slate'
  check (color in ('red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'slate'));

-- Give existing roles different colours.
with numbered as (
  select id, row_number() over (partition by org_id order by is_admin desc, name) as n from public.roles
)
update public.roles r
set color = (array['red', 'blue', 'cyan', 'green', 'amber', 'purple', 'pink', 'teal', 'orange', 'indigo', 'lime', 'slate'])[((numbered.n - 1) % 12) + 1]
from numbered
where numbered.id = r.id;

-- New organizations start with coloured roles too.
create or replace function public.create_default_roles(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.roles (org_id, name, permissions, is_admin, color) values
    (p_org, 'Admin', '{}', true, 'red'),
    (p_org, 'Graphic Designer', '{}', false, 'cyan'),
    (p_org, 'Senior Graphic Designer', '{}', false, 'blue'),
    (p_org, 'Video Editor', '{}', false, 'purple'),
    (p_org, 'Senior Visualizer', '{}', false, 'indigo'),
    (p_org, 'Project Manager', '{projects}', false, 'amber'),
    (p_org, 'Finance Manager', '{cashflow,costs,bonuses}', false, 'green'),
    (p_org, 'Human Resource', '{team_points,bonuses}', false, 'pink'),
    (p_org, 'Logistics Manager', '{equipment,costs}', false, 'teal'),
    (p_org, 'Operations Manager', '{projects,equipment,costs}', false, 'orange')
  on conflict (org_id, name) do nothing
$$;
