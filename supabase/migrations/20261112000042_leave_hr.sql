-- Leave is decided by admins and HR: people who can edit Employees & Rewards
-- ("team_points"). Both are told when someone asks for leave; nobody decides
-- their own request unless they are an admin.

create policy hr_decide on public.leave_requests for update to authenticated
  using (org_id = public.current_org_id() and public.has_edit_segment('team_points') and employee_id <> auth.uid())
  with check (org_id = public.current_org_id() and public.has_edit_segment('team_points') and employee_id <> auth.uid());

create or replace function public.notify_leave() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_when text := to_char(new.start_date, 'DD Mon') || case when new.end_date > new.start_date then ' to ' || to_char(new.end_date, 'DD Mon') else '' end;
begin
  if tg_op = 'INSERT' then
    select p.full_name into v_name from public.profiles p where p.id = new.employee_id;
    perform public.notify_admins(new.org_id, 'Leave requested by ' || coalesce(v_name, 'someone'), v_when, '/leave');
    -- HR: active non-admins who can edit Employees & Rewards, except the person asking.
    insert into public.notifications (org_id, profile_id, title, body, href)
    select distinct new.org_id, p.id, 'Leave requested by ' || coalesce(v_name, 'someone'), v_when, '/leave'
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    join public.roles r on r.id = pr.role_id
    where p.org_id = new.org_id and p.is_active and p.access_role <> 'admin' and p.id <> new.employee_id
      and 'team_points' = any (r.edit_permissions);
  elsif new.status is distinct from old.status and new.status in ('approved', 'denied') and new.employee_id is distinct from auth.uid() then
    insert into public.notifications (org_id, profile_id, title, body, href)
    values (new.org_id, new.employee_id, 'Your leave was ' || new.status, v_when, '/leave');
  end if;
  return new;
end $$;
