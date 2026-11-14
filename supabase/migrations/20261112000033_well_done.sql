-- "Well done": when a deliverable is approved, the person assigned to it is told
-- (the app shows fireworks and a pop-up). When a project is completed, everyone
-- who worked on it is told: its team and everyone assigned a deliverable in it.

create or replace function public.notify_well_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'tasks' then
    if new.status = 'approved' and old.status is distinct from 'approved' and new.assignee_id is not null then
      insert into public.notifications (org_id, profile_id, title, body, href)
      values (new.org_id, new.assignee_id, 'Well done! Task completed', new.title, '/tasks/' || new.id);
    end if;
  elsif tg_table_name = 'projects' then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      insert into public.notifications (org_id, profile_id, title, body, href)
      select new.org_id, people.id, 'Well done! Project completed', new.name, '/projects/' || new.id
      from (
        select m.profile_id as id from public.project_members m where m.project_id = new.id
        union
        select t.assignee_id from public.tasks t where t.project_id = new.id and t.assignee_id is not null
      ) people
      join public.profiles p on p.id = people.id and p.is_active;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tasks_well_done on public.tasks;
create trigger tasks_well_done after update of status on public.tasks
for each row execute function public.notify_well_done();

drop trigger if exists projects_well_done on public.projects;
create trigger projects_well_done after update of status on public.projects
for each row execute function public.notify_well_done();
