-- 1. Fixed deliverables for monthly clients: each line is a type with an
--    optional number ("5 videos") or a named service with no number
--    ("Social media management"). Several lines can share a type.
-- 2. People are told when something they work on changes: the assignee of a
--    task when its title, notes, points, due date, type or links change, and a
--    project's team when its details change. Never the person making the change.

alter table public.project_targets drop constraint if exists project_targets_project_id_kind_key;
alter table public.project_targets alter column quantity drop not null;
alter table public.project_targets
  add column if not exists label text check (label is null or length(trim(label)) between 1 and 80),
  add column if not exists position integer not null default 0;
alter table public.project_targets add constraint project_targets_has_amount_or_name check (quantity is not null or label is not null);
create trigger project_targets_log_delete after delete on public.project_targets for each row execute function public.log_delete('project_id', 'projects');

create or replace function public.notify_task_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := array[]::text[];
begin
  if new.assignee_id is null or new.assignee_id is not distinct from auth.uid()
     or new.assignee_id is distinct from old.assignee_id then
    return new; -- a new assignee is told by the assignment alert instead
  end if;
  if new.title is distinct from old.title then v_changed := array_append(v_changed, 'title'); end if;
  if new.description is distinct from old.description then v_changed := array_append(v_changed, 'notes'); end if;
  if new.points_value is distinct from old.points_value then v_changed := array_append(v_changed, 'points'); end if;
  if new.due_date is distinct from old.due_date then v_changed := array_append(v_changed, 'due date'); end if;
  if new.kind is distinct from old.kind then v_changed := array_append(v_changed, 'type'); end if;
  if new.file_links is distinct from old.file_links then v_changed := array_append(v_changed, 'links'); end if;
  if cardinality(v_changed) = 0 then return new; end if;
  insert into public.notifications (org_id, profile_id, title, body, href)
  values (new.org_id, new.assignee_id, 'Task updated: ' || new.title,
          'Changed: ' || array_to_string(v_changed, ', ') ||
          case when new.due_date is distinct from old.due_date and new.due_date is not null then ' · now due ' || to_char(new.due_date, 'DD Mon') else '' end,
          '/tasks/' || new.id);
  return new;
end $$;
drop trigger if exists tasks_changed_notify on public.tasks;
create trigger tasks_changed_notify after update of title, description, points_value, due_date, kind, file_links on public.tasks
for each row execute function public.notify_task_changed();

create or replace function public.notify_project_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := array[]::text[];
begin
  if new.name is distinct from old.name then v_changed := array_append(v_changed, 'name'); end if;
  if new.brief is distinct from old.brief then v_changed := array_append(v_changed, 'brief'); end if;
  if new.due_date is distinct from old.due_date then v_changed := array_append(v_changed, 'due date'); end if;
  if new.start_date is distinct from old.start_date then v_changed := array_append(v_changed, 'start date'); end if;
  if new.shoot_status is distinct from old.shoot_status or new.shoot_date is distinct from old.shoot_date then v_changed := array_append(v_changed, 'shoot'); end if;
  if new.file_links is distinct from old.file_links then v_changed := array_append(v_changed, 'links'); end if;
  if new.client_id is distinct from old.client_id then v_changed := array_append(v_changed, 'client'); end if;
  if cardinality(v_changed) = 0 then return new; end if;
  insert into public.notifications (org_id, profile_id, title, body, href)
  select new.org_id, m.profile_id, 'Project updated: ' || new.name, 'Changed: ' || array_to_string(v_changed, ', '), '/projects/' || new.id
  from public.project_members m join public.profiles p on p.id = m.profile_id
  where m.project_id = new.id and p.is_active and m.profile_id is distinct from auth.uid();
  return new;
end $$;
drop trigger if exists projects_changed_notify on public.projects;
create trigger projects_changed_notify after update of name, brief, due_date, start_date, shoot_status, shoot_date, file_links, client_id on public.projects
for each row execute function public.notify_project_changed();
