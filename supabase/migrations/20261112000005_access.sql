-- Row level security. Admins can read and edit everything in their organization.
-- Employees can read operational data, see only their own attendance, points and
-- bonuses, and cannot see cash flow at all.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'projects', 'tasks', 'task_submissions',
    'accounts', 'invoices', 'payments', 'fixed_expenses', 'expenses', 'equipment',
    'point_settings', 'violation_types', 'attendance', 'point_entries', 'bonuses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (org_id = public.current_org_id() and public.is_admin())
         with check (org_id = public.current_org_id() and public.is_admin())', t);
  end loop;

  -- Operational data every member of the organization may read.
  foreach t in array array[
    'profiles', 'clients', 'projects', 'tasks', 'task_submissions',
    'equipment', 'point_settings', 'violation_types'
  ] loop
    execute format(
      'create policy member_read on public.%I for select to authenticated
         using (org_id = public.current_org_id())', t);
  end loop;

  -- Personal records: employees see only their own.
  foreach t in array array['attendance', 'point_entries', 'bonuses'] loop
    execute format(
      'create policy own_read on public.%I for select to authenticated
         using (org_id = public.current_org_id() and employee_id = auth.uid())', t);
  end loop;
end $$;

alter table public.organizations enable row level security;

create policy member_read on public.organizations for select to authenticated
  using (id = public.current_org_id());

create policy admin_update on public.organizations for update to authenticated
  using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

-- Employees submit work only for tasks assigned to them.
create policy assignee_submit on public.task_submissions for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and submitted_by = auth.uid()
    and review_status = 'pending'
    and reviewed_by is null
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.org_id = public.current_org_id() and t.assignee_id = auth.uid()
    )
  );

-- Employees mark their own attendance; only an admin can verify it.
create policy own_mark on public.attendance for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and employee_id = auth.uid()
    and status = 'pending'
    and verified_by is null
  );
