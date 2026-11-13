-- Database smoke test. Runs inside a transaction and rolls everything back.
-- Run against a database that already has the migrations applied:
--   npm run test:db
begin;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000e1', 'editor@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'shooter@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'outsider@test.local');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Test Org'),
  ('00000000-0000-0000-0000-000000000002', 'Other Org');

insert into profiles (id, org_id, full_name, job_title, access_role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'Admin', 'Founder', 'admin'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001', 'Editor', 'Video Editor', 'employee'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000001', 'Shooter', 'Cinematographer', 'employee'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'Outsider', 'Admin', 'admin');

select pg_temp.check(
  (select monthly_target = 1500 and attendance_points = 100 and bonus_step_points = 1000 and bonus_step_amount = 1000
   from point_settings where org_id = '00000000-0000-0000-0000-000000000001'),
  'new organization gets default point settings');

-- Equipment purchase in cash flow creates inventory, even without a price.
insert into expenses (id, org_id, category, description, amount) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000001', 'equipment', 'Sony FX3', null),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-000000000001', 'equipment', 'Tripod', 8500),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-000000000001', 'general', 'Printer paper', 600);

select pg_temp.check(
  (select count(*) = 2 from equipment where org_id = '00000000-0000-0000-0000-000000000001'),
  'only equipment purchases create inventory records');
select pg_temp.check(
  (select purchase_price is null and name = 'Sony FX3' from equipment where source_expense_id = '00000000-0000-0000-0000-00000000c001'),
  'inventory record is created when the price is missing');

update expenses set amount = 350000 where id = '00000000-0000-0000-0000-00000000c001';
select pg_temp.check(
  (select purchase_price = 350000 from equipment where source_expense_id = '00000000-0000-0000-0000-00000000c001'),
  'price added later reaches the inventory record');

update expenses set category = 'equipment' where id = '00000000-0000-0000-0000-00000000c003';
update expenses set description = 'Printer paper A4' where id = '00000000-0000-0000-0000-00000000c003';
select pg_temp.check(
  (select count(*) = 1 from equipment where source_expense_id = '00000000-0000-0000-0000-00000000c003'),
  'marking an existing expense as equipment creates exactly one record');

do $$ begin
  insert into expenses (org_id, category, description, amount)
  values ('00000000-0000-0000-0000-000000000001', 'general', 'No amount', null);
  raise exception 'FAILED: non-equipment expense without amount was accepted';
exception when check_violation then raise notice 'ok - non-equipment expense needs an amount';
end $$;

do $$ begin
  insert into expenses (org_id, category, description, amount)
  values ('00000000-0000-0000-0000-000000000001', 'transport', 'Shoot travel', 400);
  raise exception 'FAILED: transport expense without trip was accepted';
exception when check_violation then raise notice 'ok - transport expense needs origin and destination';
end $$;

-- Equipment is never tied to a project, and shows its holder.
select pg_temp.check(
  not exists (select 1 from information_schema.columns where table_name = 'equipment' and column_name = 'project_id'),
  'equipment has no project link');
update equipment set current_holder_id = '00000000-0000-0000-0000-0000000000e2'
  where source_expense_id = '00000000-0000-0000-0000-00000000c002';
select pg_temp.check(
  (select holder_since is not null from equipment where source_expense_id = '00000000-0000-0000-0000-00000000c002'),
  'assigning a holder stamps holder_since');

-- Invoices, payments and balances.
insert into clients (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000001', 'Acme');
insert into accounts (id, org_id, name, opening_balance) values
  ('00000000-0000-0000-0000-00000000ac01', '00000000-0000-0000-0000-000000000001', 'Cash', 10000);
insert into invoices (id, org_id, client_id, invoice_number, amount) values
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000d001', 'INV-001', 50000);
insert into payments (org_id, invoice_id, account_id, amount) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-00000000ac01', 20000);
insert into expenses (org_id, category, description, amount, account_id, trip_origin, trip_destination) values
  ('00000000-0000-0000-0000-000000000001', 'transport', 'Client shoot', 1200, '00000000-0000-0000-0000-00000000ac01', 'Office', 'Gulshan');

select pg_temp.check(
  (select paid = 20000 and outstanding = 30000 from invoice_balances where invoice_id = '00000000-0000-0000-0000-0000000001b1'),
  'invoice outstanding = amount - payments');
select pg_temp.check(
  (select balance = 28800 from account_balances where account_id = '00000000-0000-0000-0000-00000000ac01'),
  'account balance = opening + payments - expenses');

-- Tasks, submissions, review and task points.
insert into projects (id, org_id, client_id, name) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000d001', 'Launch campaign');
insert into tasks (id, org_id, project_id, title, assignee_id, points_value) values
  ('00000000-0000-0000-0000-0000000071a1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f001', 'Video 1', '00000000-0000-0000-0000-0000000000e1', 300),
  ('00000000-0000-0000-0000-0000000071a2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f001', 'Video 2', '00000000-0000-0000-0000-0000000000e1', null);

do $$ begin
  insert into task_submissions (org_id, task_id, submitted_by, kind)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000071a1', '00000000-0000-0000-0000-0000000000e1', 'drive');
  raise exception 'FAILED: drive submission without a link was accepted';
exception when check_violation then raise notice 'ok - drive submission needs a link';
end $$;

insert into task_submissions (id, org_id, task_id, submitted_by, kind, url) values
  ('00000000-0000-0000-0000-0000000050b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000071a1', '00000000-0000-0000-0000-0000000000e1', 'drive', 'https://drive.google.com/file/d/x');
select pg_temp.check(
  (select status = 'submitted' from tasks where id = '00000000-0000-0000-0000-0000000071a1'),
  'submitting moves the task to submitted');

update task_submissions set review_status = 'changes_requested' where id = '00000000-0000-0000-0000-0000000050b1';
select pg_temp.check(
  (select status = 'changes_requested' from tasks where id = '00000000-0000-0000-0000-0000000071a1'),
  'requesting changes moves the task to changes_requested');
select pg_temp.check(
  not exists (select 1 from point_entries where task_id = '00000000-0000-0000-0000-0000000071a1'),
  'no points before approval');

update task_submissions set review_status = 'approved' where id = '00000000-0000-0000-0000-0000000050b1';
select pg_temp.check(
  (select points = 300 and source = 'task' and employee_id = '00000000-0000-0000-0000-0000000000e1'
          and period_month = org_month(org_id, now())
   from point_entries where task_id = '00000000-0000-0000-0000-0000000071a1'),
  'approval awards the task points to the assignee for the current month');

update tasks set status = 'approved' where id = '00000000-0000-0000-0000-0000000071a2';
select pg_temp.check(
  not exists (select 1 from point_entries where task_id = '00000000-0000-0000-0000-0000000071a2'),
  'no task points while the default is 0 and the task has no value');

update tasks set status = 'in_progress' where id = '00000000-0000-0000-0000-0000000071a1';
select pg_temp.check(
  not exists (select 1 from point_entries where task_id = '00000000-0000-0000-0000-0000000071a1'),
  'reverting an approval removes the task points');

-- Attendance points and the monthly reset.
insert into attendance (id, org_id, employee_id, work_date, status) values
  ('00000000-0000-0000-0000-00000000a701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-05', 'pending');
select pg_temp.check(
  not exists (select 1 from point_entries where attendance_id = '00000000-0000-0000-0000-00000000a701'),
  'unverified attendance earns nothing');
update attendance set status = 'verified' where id = '00000000-0000-0000-0000-00000000a701';
select pg_temp.check(
  (select points = 100 and period_month = '2026-10-01' from point_entries where attendance_id = '00000000-0000-0000-0000-00000000a701'),
  'verified attendance earns 100 points in that day''s month');
update attendance set status = 'rejected' where id = '00000000-0000-0000-0000-00000000a701';
select pg_temp.check(
  not exists (select 1 from point_entries where attendance_id = '00000000-0000-0000-0000-00000000a701'),
  'un-verifying removes the attendance points');
update attendance set status = 'verified' where id = '00000000-0000-0000-0000-00000000a701';

-- October: Editor ends on 2,500, Shooter on 3,500 after a 100 point deduction.
insert into point_entries (org_id, employee_id, period_month, points, source, reason) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-01', 2400, 'adjustment', 'October task total'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', '2026-10-01', 3600, 'adjustment', 'October task total'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', '2026-10-01', -100, 'violation', 'Returned camera late');

do $$ begin
  insert into point_entries (org_id, employee_id, period_month, points, source)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-01', -50, 'violation');
  raise exception 'FAILED: undocumented deduction was accepted';
exception when check_violation then raise notice 'ok - a deduction must be documented with a reason';
end $$;

select pg_temp.check(
  (select total_points = 2500 from monthly_points where employee_id = '00000000-0000-0000-0000-0000000000e1' and period_month = '2026-10-01'),
  'monthly total adds up');
select pg_temp.check(
  (select total_points = 3500 and deducted_points = -100 from monthly_points where employee_id = '00000000-0000-0000-0000-0000000000e2' and period_month = '2026-10-01'),
  'deductions are kept separately in the monthly record');
select pg_temp.check(
  not exists (select 1 from monthly_points where employee_id = '00000000-0000-0000-0000-0000000000e1' and period_month = '2026-11-01'),
  'the next month starts at zero');

-- Row level security and bonus calculation, as real signed-in users.
set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 0 from expenses), 'employee cannot see expenses');
select pg_temp.check((select count(*) = 0 from invoices), 'employee cannot see invoices');
select pg_temp.check((select count(*) = 2 from tasks), 'employee can see tasks');
select pg_temp.check((select count(*) = 3 from profiles), 'employee sees colleagues but not other organizations');
select pg_temp.check(
  (select count(*) = 1 from monthly_points where period_month = '2026-10-01'),
  'employee sees only their own points');

do $$ begin
  perform calculate_bonuses('2026-10-01');
  raise exception 'FAILED: employee calculated bonuses';
exception when insufficient_privilege then raise notice 'ok - employee cannot calculate bonuses';
end $$;

do $$ begin
  insert into attendance (org_id, employee_id, work_date, status)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-06', 'verified');
  raise exception 'FAILED: employee verified their own attendance';
exception when insufficient_privilege then raise notice 'ok - employee cannot verify their own attendance';
end $$;

insert into attendance (org_id, employee_id, work_date)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-06');

do $$ begin
  insert into task_submissions (org_id, task_id, submitted_by, kind, note)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000071a2', '00000000-0000-0000-0000-0000000000e1', 'text', 'Draft notes');
  raise notice 'ok - assignee can submit a text note';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
do $$ begin
  insert into task_submissions (org_id, task_id, submitted_by, kind, note)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000071a2', '00000000-0000-0000-0000-0000000000e2', 'text', 'Not mine');
  raise exception 'FAILED: non-assignee submitted work';
exception when insufficient_privilege then raise notice 'ok - only the assignee can submit';
end $$;
do $$
declare n integer;
begin
  update tasks set title = 'Hacked' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: employee edited tasks'; end if;
  raise notice 'ok - employee cannot edit tasks';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.check((select count(*) = 0 from tasks), 'another organization''s admin sees nothing');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) >= 4 from expenses), 'admin sees all expenses');
do $$
declare n integer;
begin
  update tasks set title = 'Video 2 (final)' where id = '00000000-0000-0000-0000-0000000071a2';
  get diagnostics n = row_count;
  update point_entries set points = 2400 where source = 'adjustment' and employee_id = '00000000-0000-0000-0000-0000000000e1';
  update equipment set notes = 'checked' where true;
  update point_settings set default_task_points = 0 where true;
  if n <> 1 then raise exception 'FAILED: admin could not edit a task'; end if;
  raise notice 'ok - admin can edit across modules';
end $$;

do $$ begin
  perform calculate_bonuses(org_month('00000000-0000-0000-0000-000000000001', now()));
  raise exception 'FAILED: bonuses calculated for an unfinished month';
exception when invalid_parameter_value then raise notice 'ok - bonuses wait until the month has ended';
end $$;

select pg_temp.check(
  (select count(*) = 2 from calculate_bonuses('2026-10-01')),
  'bonus proposals created for both employees');
select pg_temp.check(
  (select amount = 1000 and status = 'pending' from bonuses where employee_id = '00000000-0000-0000-0000-0000000000e1'),
  '2,500 points => 1,000 bonus, pending approval');
select pg_temp.check(
  (select amount = 2000 from bonuses where employee_id = '00000000-0000-0000-0000-0000000000e2'),
  '3,500 points => 2,000 bonus');

update bonuses set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where employee_id = '00000000-0000-0000-0000-0000000000e1';
insert into point_entries (org_id, employee_id, period_month, points, source, reason) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-01', 1000, 'adjustment', 'Late correction'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', '2026-10-01', -1200, 'violation', 'Late correction');
select count(*) from calculate_bonuses('2026-10-01');
select pg_temp.check(
  (select amount = 1000 and status = 'approved' from bonuses where employee_id = '00000000-0000-0000-0000-0000000000e1'),
  'an approved bonus is preserved on recalculation');
select pg_temp.check(
  not exists (select 1 from bonuses where employee_id = '00000000-0000-0000-0000-0000000000e2'),
  'a pending bonus is withdrawn when the employee no longer qualifies');

-- Roles as tags and per-segment visibility.
select pg_temp.check(
  (select count(*) = 11 from roles where org_id = '00000000-0000-0000-0000-000000000001'),
  'a new organization gets the eleven starting roles, Trainee included');

insert into roles (id, org_id, name, permissions) values
  ('00000000-0000-0000-0000-0000000070a1', '00000000-0000-0000-0000-000000000001', 'Bookkeeper', '{cashflow}');

do $$ begin
  insert into roles (org_id, name, permissions)
  values ('00000000-0000-0000-0000-000000000001', 'Bad', '{everything}');
  raise exception 'FAILED: unknown segment accepted';
exception when check_violation then raise notice 'ok - a role can only list known segments';
end $$;

select set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[
  '00000000-0000-0000-0000-0000000070a1',
  (select id from roles where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Human Resource')
]::uuid[]);
select pg_temp.check(
  (select job_title = 'Bookkeeper, Human Resource' and access_role = 'employee'
   from profiles where id = '00000000-0000-0000-0000-0000000000e2'),
  'a person can hold several roles and they show as their job title');

update roles set name = 'Accountant' where id = '00000000-0000-0000-0000-0000000070a1';
select pg_temp.check(
  (select job_title = 'Accountant, Human Resource' from profiles where id = '00000000-0000-0000-0000-0000000000e2'),
  'renaming a role updates everyone who holds it');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select count(*) >= 4 from expenses), 'a role with the cashflow segment sees expenses');
select pg_temp.check((select count(*) = 1 from invoices), 'a role with the cashflow segment sees invoices');
select pg_temp.check(
  (select count(distinct employee_id) = 2 from point_entries),
  'a role with the team_points segment sees everyone''s points');
select pg_temp.check((select count(*) > 0 from projects), 'without the projects segment, projects can still be seen');
select pg_temp.check(
  (select count(*) = 1 from equipment),
  'without the equipment segment, only equipment you hold is visible');
do $$
declare n integer;
begin
  update expenses set description = 'Hacked' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: a viewing role edited expenses'; end if;
  raise notice 'ok - segments give viewing rights only';
end $$;
do $$ begin
  perform set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[]::uuid[]);
  raise exception 'FAILED: employee changed roles';
exception when insufficient_privilege then raise notice 'ok - only admins assign roles';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 2 from tasks), 'an assignee still sees their own tasks');
select pg_temp.check((select count(*) = 1 from projects), 'an assignee sees the project their tasks belong to');
select pg_temp.check((select count(*) = 0 from clients), 'an assignee without the projects segment cannot list clients');
select pg_temp.check((select count(*) = 0 from equipment), 'someone holding nothing sees no equipment');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[
  (select id from roles where org_id = '00000000-0000-0000-0000-000000000001' and is_admin)
]::uuid[]);
select pg_temp.check(
  (select access_role = 'admin' and job_title = 'Admin' from profiles where id = '00000000-0000-0000-0000-0000000000e2'),
  'the Admin role gives admin access, and old roles are replaced');
do $$
declare n integer;
begin
  delete from roles where is_admin;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: the Admin role was deleted'; end if;
  raise notice 'ok - the Admin role cannot be deleted';
end $$;
delete from roles where id = '00000000-0000-0000-0000-0000000070a1';
select set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[]::uuid[]);
select pg_temp.check(
  (select access_role = 'employee' and job_title is null from profiles where id = '00000000-0000-0000-0000-0000000000e2'),
  'removing the Admin role removes admin access');

-- Broadcasts, equipment condition and urgently needed equipment.
update equipment set condition = 'moderate' where source_expense_id = '00000000-0000-0000-0000-00000000c002';
do $$ begin
  update equipment set condition = 'broken' where source_expense_id = '00000000-0000-0000-0000-00000000c002';
  raise exception 'FAILED: unknown condition accepted';
exception when check_violation then raise notice 'ok - equipment condition is perfect, moderate or weak';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into broadcasts (org_id, sender_id, message)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Editing PC will not start');
do $$ begin
  insert into broadcasts (org_id, sender_id, message)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'Pretending to be someone else');
  raise exception 'FAILED: broadcast sent as another person';
exception when insufficient_privilege then raise notice 'ok - a broadcast is always sent as yourself';
end $$;
do $$ begin
  insert into broadcasts (org_id, sender_id, message)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', repeat('x', 281));
  raise exception 'FAILED: over-long broadcast accepted';
exception when check_violation then raise notice 'ok - a broadcast is at most 280 characters';
end $$;
insert into equipment_needs (org_id, item_name, quantity, requested_by)
values ('00000000-0000-0000-0000-000000000001', 'Camera battery', 2, '00000000-0000-0000-0000-0000000000e1');
do $$
declare n integer;
begin
  update equipment_needs set status = 'acquired' where true;
  get diagnostics n = row_count;
  update broadcasts set status = 'resolved' where true;
  if n <> 0 then raise exception 'FAILED: someone without the equipment segment marked a need acquired'; end if;
  raise notice 'ok - only equipment roles and admins can mark a needed item acquired';
end $$;
select pg_temp.check((select count(*) = 1 and bool_and(status = 'open') from broadcasts), 'the sender sees their own broadcast and cannot resolve it');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select count(*) = 0 from broadcasts), 'other employees cannot read someone else''s broadcast');
select pg_temp.check((select count(*) = 0 from equipment_needs), 'needed items are hidden without the equipment segment');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) = 1 from broadcasts), 'admins receive every broadcast');
update broadcasts set status = 'resolved', resolved_by = auth.uid(), resolved_at = now() where true;
update roles set permissions = '{equipment}' where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Logistics Manager';
select set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[
  (select id from roles where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Logistics Manager')
]::uuid[]);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
do $$
declare n integer;
begin
  update equipment_needs set status = 'acquired' where true;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAILED: an equipment role could not mark a need acquired'; end if;
  raise notice 'ok - an equipment role sees needed items and can mark them acquired';
end $$;

-- Projects without a client, with their own links and team.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into projects (id, org_id, name, file_links) values
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-000000000001', 'Internal reel',
   '[{"label": "Brief", "url": "https://docs.google.com/document/d/1"}]');
insert into tasks (org_id, project_id, title) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f002', 'Cut 1');
select pg_temp.check(
  (select client_id is null and jsonb_array_length(file_links) = 1 from projects where id = '00000000-0000-0000-0000-00000000f002'),
  'a project can be created without a client and with its own links');
select set_profile_roles('00000000-0000-0000-0000-0000000000e2', array[]::uuid[]);
select set_project_members('00000000-0000-0000-0000-00000000f002', array['00000000-0000-0000-0000-0000000000e2']::uuid[]);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check(
  (select count(*) = 1 from projects where name = 'Internal reel'),
  'someone assigned to a project sees that project');
select pg_temp.check((select count(*) = 1 from project_members where profile_id = auth.uid()), 'and that they are on its team');
do $$ begin
  perform set_project_members('00000000-0000-0000-0000-00000000f002', array[]::uuid[]);
  raise exception 'FAILED: employee changed a project team';
exception when insufficient_privilege then raise notice 'ok - only admins assign people to projects';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select set_project_members('00000000-0000-0000-0000-00000000f002', array[]::uuid[]);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select count(*) = 0 from project_members where profile_id = auth.uid()), 'removing someone from a project takes them off its team');

-- Change requests and role colours.
select pg_temp.check(
  (select count(distinct color) >= 9 from roles where org_id = '00000000-0000-0000-0000-000000000001'),
  'roles have different colours');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
insert into change_requests (id, org_id, requested_by, method, path, body, summary) values
  ('00000000-0000-0000-0000-0000000c4a01', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2',
   'POST', '/api/equipment', '{"name": "Light stand"}', 'Add equipment "Light stand"');
do $$ begin
  insert into change_requests (org_id, requested_by, method, path, summary, status)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'POST', '/api/equipment', 'Self approved', 'approved');
  raise exception 'FAILED: a change request was created already approved';
exception when insufficient_privilege then raise notice 'ok - a change request always starts as pending';
end $$;
do $$ begin
  insert into change_requests (org_id, requested_by, method, path, summary)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'POST', 'https://evil.example/x', 'Bad path');
  raise exception 'FAILED: a change request with an outside path was accepted';
exception when check_violation then raise notice 'ok - a change request can only target the app''s own API';
end $$;
do $$
declare n integer;
begin
  update change_requests set status = 'approved' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: requester approved their own change'; end if;
  raise notice 'ok - the requester cannot approve their own change';
end $$;
select pg_temp.check((select count(*) = 1 from change_requests), 'the requester sees their own change request');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 0 from change_requests), 'other employees cannot see it');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update change_requests set status = 'denied', decided_by = auth.uid(), decided_at = now() where id = '00000000-0000-0000-0000-0000000c4a01';
select pg_temp.check((select status = 'denied' from change_requests where id = '00000000-0000-0000-0000-0000000c4a01'), 'an admin can decide a change request');

-- Attendance entry and exit times.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into attendance (org_id, employee_id, work_date, check_in, check_out)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-07', '10:00', '18:30');
select pg_temp.check(
  (select check_in = '10:00' and check_out = '18:30' and status = 'pending' from attendance where work_date = '2026-10-07'),
  'an employee marks attendance with entry and exit time');
do $$ begin
  insert into attendance (org_id, employee_id, work_date, check_in, check_out)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '2026-10-08', '18:00', '09:00');
  raise exception 'FAILED: exit before entry accepted';
exception when check_violation then raise notice 'ok - the exit time must be after the entry time';
end $$;

-- Task points follow the task whenever it changes.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into tasks (id, org_id, project_id, title, assignee_id, status, points_value) values
  ('00000000-0000-0000-0000-0000000071b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f002', 'Born approved',
   '00000000-0000-0000-0000-0000000000e1', 'approved', 67),
  ('00000000-0000-0000-0000-0000000071b2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f002', 'Points added later',
   '00000000-0000-0000-0000-0000000000e1', 'approved', null);
select pg_temp.check(
  (select points = 67 from point_entries where task_id = '00000000-0000-0000-0000-0000000071b1'),
  'a task created as approved earns its points');
select pg_temp.check(
  not exists (select 1 from point_entries where task_id = '00000000-0000-0000-0000-0000000071b2'),
  'an approved task with no points value earns nothing yet');
update tasks set points_value = 120 where id = '00000000-0000-0000-0000-0000000071b2';
select pg_temp.check(
  (select points = 120 and employee_id = '00000000-0000-0000-0000-0000000000e1' from point_entries where task_id = '00000000-0000-0000-0000-0000000071b2'),
  'giving an approved task a points value awards the points');
update tasks set points_value = 150 where id = '00000000-0000-0000-0000-0000000071b2';
select pg_temp.check(
  (select count(*) = 1 and max(points) = 150 from point_entries where task_id = '00000000-0000-0000-0000-0000000071b2'),
  'changing the points value updates the award instead of adding another');
update tasks set assignee_id = '00000000-0000-0000-0000-0000000000e2' where id = '00000000-0000-0000-0000-0000000071b2';
select pg_temp.check(
  (select employee_id = '00000000-0000-0000-0000-0000000000e2' from point_entries where task_id = '00000000-0000-0000-0000-0000000071b2'),
  'reassigning an approved task moves its points');
update tasks set assignee_id = null where id = '00000000-0000-0000-0000-0000000071b2';
select pg_temp.check(
  not exists (select 1 from point_entries where task_id = '00000000-0000-0000-0000-0000000071b2'),
  'an unassigned task holds no points');

-- Password requests are for admins only.
reset role;
insert into password_requests (id, org_id, profile_id, email) values
  ('00000000-0000-0000-0000-00000000fa55', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'editor@test.local');
set local role authenticated;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 0 from password_requests), 'an employee cannot see password requests, not even their own');
do $$ begin
  insert into password_requests (org_id, profile_id, email)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'editor@test.local');
  raise exception 'FAILED: an employee created a password request directly';
exception when insufficient_privilege then raise notice 'ok - only the server can record a password request';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.check((select count(*) = 0 from password_requests), 'another organization''s admin cannot see them');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) = 1 from password_requests), 'the organization''s admin sees password requests');
update password_requests set status = 'done', resolved_by = auth.uid(), resolved_at = now() where true;
select pg_temp.check((select status = 'done' from password_requests where id = '00000000-0000-0000-0000-00000000fa55'), 'and can mark one as dealt with');

reset role;
set local role anon;
do $$ begin
  perform count(*) from password_requests;
  raise exception 'FAILED: a signed-out visitor read password requests';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors have no access to password requests';
end $$;

-- Personal profiles.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select update_my_profile('  Editor Ahmed ', 'Eddy', '01700000001', 'House 5, Road 2, Dhaka', '01800000002');
select pg_temp.check(
  (select full_name = 'Editor Ahmed' and nickname = 'Eddy' and contact = '01700000001' and profile_completed_at is not null
          and access_role = 'employee'
   from profiles where id = '00000000-0000-0000-0000-0000000000e1'),
  'a person fills in their own profile, and nothing else about them changes');
select pg_temp.check(
  (select address = 'House 5, Road 2, Dhaka' and secondary_contact = '01800000002' from profile_private where profile_id = auth.uid()),
  'and sees their own address and secondary contact');
do $$ begin
  perform update_my_profile('', null, '017', null, null);
  raise exception 'FAILED: profile saved without a name';
exception when invalid_parameter_value then raise notice 'ok - a profile needs a full name and a contact number';
end $$;
do $$
declare n integer;
begin
  update profiles set access_role = 'admin', contact = 'hacked' where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: an employee edited their profile row directly'; end if;
  raise notice 'ok - an employee cannot edit their profile row directly';
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check(
  (select contact = '01700000001' from profiles where id = '00000000-0000-0000-0000-0000000000e1'),
  'colleagues can see a person''s name and contact number');
select pg_temp.check((select count(*) = 0 from profile_private), 'but not their address or secondary contact');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) = 1 from profile_private), 'an admin can see everyone''s private details');
update profile_private set address = 'Corrected by admin' where profile_id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check(
  (select address = 'Corrected by admin' from profile_private where profile_id = '00000000-0000-0000-0000-0000000000e1'),
  'and edit them');

-- Notice board.
insert into notices (org_id, title, expires_at) values
  ('00000000-0000-0000-0000-000000000001', 'Office closed Friday', now() + interval '3 days'),
  ('00000000-0000-0000-0000-000000000001', 'Old notice', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000001', 'House rules', null);
select pg_temp.check((select count(*) = 3 from notices), 'an admin still sees expired notices');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check(
  (select count(*) = 2 and bool_and(title <> 'Old notice') from notices),
  'everyone sees a notice until it expires, and permanent ones until deleted');
do $$ begin
  insert into notices (org_id, title) values ('00000000-0000-0000-0000-000000000001', 'From an employee');
  raise exception 'FAILED: an employee posted a notice';
exception when insufficient_privilege then raise notice 'ok - only admins post notices';
end $$;

-- Login details: admins only.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into profile_credentials (profile_id, org_id, password_cipher)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000001', 'v1.sealed');
select pg_temp.check((select count(*) = 1 from profile_credentials), 'an admin can keep and read login details');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 0 from profile_credentials), 'an employee cannot read login details, not even their own');
do $$ begin
  insert into profile_credentials (profile_id, org_id, password_cipher)
  values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000001', 'x');
  raise exception 'FAILED: an employee wrote login details';
exception when insufficient_privilege then raise notice 'ok - an employee cannot write login details';
end $$;

-- A trip records what it was for.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into expenses (org_id, category, description, amount, trip_origin, trip_destination, purpose)
values ('00000000-0000-0000-0000-000000000001', 'transport', 'Client shoot', 500, 'Office', 'Gulshan', 'New client meeting');
select pg_temp.check(
  (select count(*) = 1 from expenses where purpose = 'New client meeting' and project_id is null and client_id is null),
  'a trip can carry a purpose typed in by hand');

-- Everyone can open any project and comment on it.
reset role;
select set_config('test.projects', (select count(*)::text from projects), true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check(
  (select count(*)::text from projects) = current_setting('test.projects'),
  'every employee can see every project');
insert into project_comments (org_id, project_id, author_id, body)
select org_id, id, auth.uid(), 'Looks good' from projects limit 1;
select pg_temp.check((select count(*) = 1 from project_comments), 'an employee can comment on any project');
do $$ begin
  insert into project_comments (org_id, project_id, author_id, body)
  select org_id, id, '00000000-0000-0000-0000-0000000000a1', 'As someone else' from projects limit 1;
  raise exception 'FAILED: a comment was posted under another name';
exception when insufficient_privilege then raise notice 'ok - nobody can comment under another name';
end $$;
do $$
declare n integer;
begin
  update projects set name = 'Hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: an employee without the projects role changed a project'; end if;
  raise notice 'ok - seeing projects does not allow changing them';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
delete from project_comments;
select pg_temp.check((select count(*) = 1 from project_comments), 'a comment cannot be deleted by another employee');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from project_comments;
select pg_temp.check((select count(*) = 0 from project_comments), 'an admin can delete any comment');

-- View access and editing access are separate.
reset role;
select pg_temp.check(
  (select count(*) = 1 from roles where org_id = '00000000-0000-0000-0000-000000000001' and name = 'Trainee' and cardinality(permissions) = 0 and cardinality(edit_permissions) = 0),
  'there is a Trainee role that edits nothing');
insert into roles (id, org_id, name, permissions, edit_permissions) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-000000000001', 'Stock viewer', '{equipment}', '{}'),
  ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-000000000001', 'Stock keeper', '{}', '{equipment}');
select pg_temp.check(
  (select permissions = array['equipment'] from roles where name = 'Stock keeper'),
  'a role that can edit a part can also view it');
insert into equipment_needs (org_id, item_name, requested_by) values
  ('00000000-0000-0000-0000-000000000001', 'Tripod', '00000000-0000-0000-0000-0000000000a1');
delete from profile_roles where profile_id = '00000000-0000-0000-0000-0000000000e2';
insert into profile_roles (profile_id, role_id, org_id) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check((select count(*) >= 1 from equipment_needs where item_name = 'Tripod'), 'a view-only role sees the part');
do $$
declare n integer;
begin
  update equipment_needs set status = 'acquired' where item_name = 'Tripod';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAILED: a view-only role changed a record'; end if;
  raise notice 'ok - a view-only role cannot change it';
end $$;
reset role;
update profile_roles set role_id = '00000000-0000-0000-0000-00000000aa02' where profile_id = '00000000-0000-0000-0000-0000000000e2';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
update equipment_needs set status = 'acquired' where item_name = 'Tripod';
select pg_temp.check((select count(*) = 1 from equipment_needs where item_name = 'Tripod' and status = 'acquired'), 'a role with editing access can');

-- Deliverable types, thumbnails tied to videos, and the shoot status.
reset role;
insert into projects (id, org_id, name, shoot_status) values
  ('00000000-0000-0000-0000-00000000f0aa', '00000000-0000-0000-0000-000000000001', 'November content', 'waiting');
insert into tasks (id, org_id, project_id, title, kind) values
  ('00000000-0000-0000-0000-00000000f0b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f0aa', 'Video 1', 'video');
insert into tasks (org_id, project_id, title, kind, for_task_id) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f0aa', 'Thumbnail 1', 'thumbnail', '00000000-0000-0000-0000-00000000f0b1');
select pg_temp.check(
  (select count(*) = 1 from tasks where kind = 'thumbnail' and for_task_id = '00000000-0000-0000-0000-00000000f0b1'),
  'a thumbnail is tied to its video');
select pg_temp.check((select kind = 'other' from tasks where title <> 'Video 1' and kind <> 'thumbnail' limit 1), 'older deliverables count as other');
do $$ begin
  update tasks set kind = 'podcast' where title = 'Video 1';
  raise exception 'FAILED: an unknown deliverable type was accepted';
exception when check_violation then raise notice 'ok - a deliverable type must be one of the known ones';
end $$;
update projects set shoot_status = 'confirmed', shoot_date = '2026-11-20' where id = '00000000-0000-0000-0000-00000000f0aa';
delete from tasks where id = '00000000-0000-0000-0000-00000000f0b1';
select pg_temp.check(
  (select count(*) = 1 from tasks where title = 'Thumbnail 1' and for_task_id is null),
  'deleting a video keeps its thumbnail, untied');

-- Project roles work directly; points and deleting stay with admins; assignments notify.
reset role;
insert into roles (id, org_id, name, permissions, edit_permissions) values
  ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-000000000001', 'Producer', '{projects}', '{projects}');
delete from profile_roles where profile_id = '00000000-0000-0000-0000-0000000000e2';
insert into profile_roles (profile_id, role_id, org_id) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-000000000001');
delete from notifications;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
insert into projects (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000f0cc', '00000000-0000-0000-0000-000000000001', 'Made by a producer');
select pg_temp.check((select count(*) = 1 from projects where name = 'Made by a producer'), 'a project role creates a project without approval');
select set_project_members('00000000-0000-0000-0000-00000000f0cc', array['00000000-0000-0000-0000-0000000000a1']::uuid[]);
insert into tasks (id, org_id, project_id, title, assignee_id) values
  ('00000000-0000-0000-0000-00000000f0c1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f0cc', 'Edit reel', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.check(
  (select count(*) = 1 from tasks where id = '00000000-0000-0000-0000-00000000f0c1'),
  'and gives a deliverable to someone, on the team or not');
do $$ begin
  update tasks set status = 'approved' where id = '00000000-0000-0000-0000-00000000f0c1';
  raise exception 'FAILED: a project role approved a deliverable';
exception when insufficient_privilege then raise notice 'ok - only an admin approves a deliverable';
end $$;
do $$ begin
  update tasks set points_value = 900 where id = '00000000-0000-0000-0000-00000000f0c1';
  raise exception 'FAILED: a project role set points';
exception when insufficient_privilege then raise notice 'ok - only an admin sets points';
end $$;
delete from projects where id = '00000000-0000-0000-0000-00000000f0cc';
select pg_temp.check((select count(*) = 1 from projects where id = '00000000-0000-0000-0000-00000000f0cc'), 'a project role cannot delete a project');
select pg_temp.check((select count(*) = 0 from notifications), 'nobody reads someone else''s notifications');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check(
  (select count(*) = 2 and bool_and(read_at is null) from notifications),
  'being put on a project and being given a task each send a notification');
update notifications set read_at = now();
select pg_temp.check((select count(*) = 0 from notifications where read_at is null), 'and they can be marked as read');
update tasks set status = 'approved', points_value = 300 where id = '00000000-0000-0000-0000-00000000f0c1';
delete from projects where id = '00000000-0000-0000-0000-00000000f0cc';
select pg_temp.check((select count(*) = 0 from projects where id = '00000000-0000-0000-0000-00000000f0cc'), 'an admin deletes any project');

-- Delete log.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from delete_log;
insert into projects (id, org_id, name) values ('00000000-0000-0000-0000-00000000f0dd', '00000000-0000-0000-0000-000000000001', 'To be removed');
insert into tasks (org_id, project_id, title) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f0dd', 'Child one'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000f0dd', 'Child two');
delete from projects where id = '00000000-0000-0000-0000-00000000f0dd';
select pg_temp.check(
  (select count(*) = 1 and bool_and(table_name = 'projects' and label = 'To be removed' and deleted_by = auth.uid()) from delete_log),
  'a delete is logged once, with what it was and who did it');
reset role;
update delete_log set deleted_at = now() - interval '4 days';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) = 0 from delete_log), 'the log shows only the last 3 days');
insert into notices (org_id, title) values ('00000000-0000-0000-0000-000000000001', 'Short lived');
delete from notices where title = 'Short lived';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check((select count(*) = 0 from delete_log), 'employees cannot read the delete log');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) = 1 from delete_log), 'older entries are cleared out as new ones arrive');
delete from delete_log;
select pg_temp.check((select count(*) = 0 from delete_log), 'an admin can clear the log');

-- Viewing the app as another role.
do $$ begin
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
  perform start_role_preview((select id from roles where name = 'Trainee' and org_id = '00000000-0000-0000-0000-000000000001'));
  raise exception 'FAILED: an employee started a role preview';
exception when insufficient_privilege then raise notice 'ok - only an admin can view the app as another role';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform start_role_preview((select id from roles where is_admin and org_id = '00000000-0000-0000-0000-000000000001'));
  raise exception 'FAILED: previewing the Admin role was accepted';
exception when invalid_parameter_value then raise notice 'ok - the Admin role itself cannot be previewed';
end $$;
select start_role_preview((select id from roles where name = 'Trainee' and org_id = '00000000-0000-0000-0000-000000000001'));
select pg_temp.check(not is_admin() and not has_segment('cashflow'), 'while viewing as a Trainee an admin is treated as one');
select pg_temp.check((select count(*) = 0 from expenses) and (select count(*) = 0 from profile_private where profile_id <> auth.uid()), 'and sees only what a Trainee sees');
select start_role_preview((select id from roles where name = 'Finance Manager' and org_id = '00000000-0000-0000-0000-000000000001'));
select pg_temp.check(has_segment('cashflow') and not has_segment('equipment') and (select count(*) > 0 from expenses), 'switching role switches what is visible');
select stop_role_preview();
select pg_temp.check(is_admin() and (select count(*) > 0 from expenses), 'leaving the preview restores full access');

-- More notifications, and the live-update counter.
reset role;
delete from notifications;
select set_config('test.version', (select version::text from org_activity where org_id = '00000000-0000-0000-0000-000000000001'), true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into broadcasts (org_id, sender_id, message) values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'Need a battery now');
insert into change_requests (org_id, requested_by, method, path, body, summary)
values ('00000000-0000-0000-0000-000000000001', auth.uid(), 'POST', '/api/expenses', '{}', 'Add expense "taxi"');
select pg_temp.check(
  (select version::text from org_activity) <> current_setting('test.version'),
  'any change moves the live-update counter, which members can read');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check(
  (select count(*) = 2 from notifications where title in ('New broadcast', 'A change is waiting for your approval')),
  'admins are notified of broadcasts and of changes waiting for approval');
insert into notices (org_id, title, is_urgent) values ('00000000-0000-0000-0000-000000000001', 'Fire drill at 3', true);
insert into projects (id, org_id, name, status) values ('00000000-0000-0000-0000-00000000f0ee', '00000000-0000-0000-0000-000000000001', 'Wrap film', 'active');
update projects set status = 'completed' where id = '00000000-0000-0000-0000-00000000f0ee';
select pg_temp.check(
  (select count(*) = 1 from notifications where title like 'Project completed%' and href = '/projects/00000000-0000-0000-0000-00000000f0ee#award'),
  'finishing a project asks the admin to give points');
select pg_temp.check((select count(*) = 0 from notifications where title = 'Urgent notice'), 'the person who posts a notice is not notified of it');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check(
  (select count(*) = 1 from notifications where title = 'Urgent notice' and body = 'Fire drill at 3'),
  'a notice notifies everyone else, employees included');
select pg_temp.check((select count(*) = 0 from notifications where title = 'New broadcast'), 'employees are not notified of broadcasts');

-- Deleting a person removes their account and their own records, and nothing blocks it.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.check(
  (select count(*) = 0 from profiles where id = '00000000-0000-0000-0000-0000000000e1'),
  'an employee can be deleted together with their records');

reset role;
rollback;
