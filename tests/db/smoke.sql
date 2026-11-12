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

reset role;
rollback;
