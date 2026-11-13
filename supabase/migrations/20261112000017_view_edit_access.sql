-- View access and editing access are now separate for each part of the app,
-- and there is a Trainee role.
--
-- roles.permissions      the parts a role can VIEW
-- roles.edit_permissions the parts a role can also EDIT (through admin approval)

alter table public.roles
  add column edit_permissions text[] not null default '{}'
    check (edit_permissions <@ array['projects', 'equipment', 'costs', 'cashflow', 'team_points', 'bonuses']);

-- Until now seeing a part also meant editing it, so existing roles keep that.
update public.roles set edit_permissions = permissions where not is_admin;

-- Editing a part always includes viewing it.
create function public.roles_edit_implies_view() returns trigger
language plpgsql as $$
begin
  new.permissions := array(select distinct unnest(new.permissions || new.edit_permissions) order by 1);
  return new;
end $$;
create trigger roles_edit_implies_view
before insert or update of permissions, edit_permissions on public.roles
for each row execute function public.roles_edit_implies_view();

create function public.has_edit_segment(p_segment text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where pr.profile_id = auth.uid() and p.is_active and p_segment = any (r.edit_permissions)
  )
$$;
grant execute on function public.has_edit_segment(text) to authenticated;

-- The needed-items list is the one place a role changes records directly.
drop policy segment_update on public.equipment_needs;
create policy segment_update on public.equipment_needs for update to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('equipment'))
  with check (org_id = public.current_org_id() and public.has_edit_segment('equipment'));
drop policy segment_delete on public.equipment_needs;
create policy segment_delete on public.equipment_needs for delete to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('equipment'));

-- A Trainee sees projects and their own tasks, points and equipment, and edits nothing.
insert into public.roles (org_id, name, description, permissions, edit_permissions, is_admin, color)
select o.id, 'Trainee', 'Learning the ropes: view only.', '{}', '{}', false, 'lime'
from public.organizations o
on conflict (org_id, name) do nothing;

-- New organizations get the same roles, with editing access and a Trainee.
create or replace function public.create_default_roles(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.roles (org_id, name, permissions, edit_permissions, is_admin, color) values
    (p_org, 'Admin', '{}', '{}', true, 'red'),
    (p_org, 'Graphic Designer', '{}', '{}', false, 'cyan'),
    (p_org, 'Senior Graphic Designer', '{}', '{}', false, 'blue'),
    (p_org, 'Video Editor', '{}', '{}', false, 'purple'),
    (p_org, 'Senior Visualizer', '{}', '{}', false, 'indigo'),
    (p_org, 'Project Manager', '{projects}', '{projects}', false, 'amber'),
    (p_org, 'Finance Manager', '{cashflow,costs,bonuses}', '{cashflow,costs,bonuses}', false, 'green'),
    (p_org, 'Human Resource', '{team_points,bonuses}', '{team_points,bonuses}', false, 'pink'),
    (p_org, 'Logistics Manager', '{equipment,costs}', '{equipment,costs}', false, 'teal'),
    (p_org, 'Operations Manager', '{projects,equipment,costs}', '{projects,equipment,costs}', false, 'orange'),
    (p_org, 'Trainee', '{}', '{}', false, 'lime')
  on conflict (org_id, name) do nothing
$$;
