-- Task points now follow the task at all times. Before, points were only
-- awarded at the moment a task's status changed to approved, so a task that was
-- created as approved, or given its points value after approval, earned nothing.
create or replace function public.sync_points_from_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_points integer;
begin
  select coalesce(new.points_value, s.default_task_points) into v_points
  from public.point_settings s where s.org_id = new.org_id;

  if new.status = 'approved' and new.assignee_id is not null and coalesce(v_points, 0) > 0 then
    -- First award goes to the current month; later corrections keep that month.
    insert into public.point_entries (org_id, employee_id, period_month, points, source, task_id)
    values (new.org_id, new.assignee_id, public.org_month(new.org_id, now()), v_points, 'task', new.id)
    on conflict (task_id) do update set points = excluded.points, employee_id = excluded.employee_id;
  else
    delete from public.point_entries where task_id = new.id;
  end if;
  return new;
end $$;

drop trigger tasks_sync_points on public.tasks;
create trigger tasks_sync_points
after insert or update of status, points_value, assignee_id on public.tasks
for each row execute function public.sync_points_from_task();

-- Award the points that approved tasks should already have.
update public.tasks set status = status where status = 'approved';
