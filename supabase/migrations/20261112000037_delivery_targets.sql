-- Monthly clients track deliveries instead of copying a package: an optional
-- target per type ("5 videos, 5 thumbnails, 3 social media posts a month"), and
-- the app counts what was actually delivered each month. Clients without fixed
-- numbers simply have no targets and only see the counts. Months no longer
-- start with pre-made deliverables; work is added as it comes.
-- Two more deliverable types: photos and social media posts.

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check
  check (kind in ('shoot', 'video', 'thumbnail', 'photo', 'post', 'graphic', 'other'));
alter table public.project_package_items drop constraint if exists project_package_items_kind_check;
alter table public.project_package_items add constraint project_package_items_kind_check
  check (kind in ('shoot', 'video', 'thumbnail', 'photo', 'post', 'graphic', 'other'));

create table public.project_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('shoot', 'video', 'thumbnail', 'photo', 'post', 'graphic', 'other')),
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  unique (project_id, kind)
);
create index project_targets_project_idx on public.project_targets (project_id);
grant select, insert, update, delete on public.project_targets to authenticated;
alter table public.project_targets enable row level security;
create policy member_read on public.project_targets for select to authenticated using (org_id = public.current_org_id());
create policy editor_all on public.project_targets for all to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('projects'))
  with check (
    org_id = public.current_org_id() and public.has_edit_segment('projects')
    and exists (select 1 from public.projects p where p.id = project_targets.project_id and p.org_id = project_targets.org_id)
  );
create trigger project_targets_bump_activity after insert or update or delete on public.project_targets
for each row execute function public.bump_activity();

-- Packages set up so far become targets (how many of each type), and stop copying deliverables.
insert into public.project_targets (org_id, project_id, kind, quantity)
select org_id, project_id, kind, count(*) from public.project_package_items group by org_id, project_id, kind
on conflict (project_id, kind) do nothing;
delete from public.project_package_items;
