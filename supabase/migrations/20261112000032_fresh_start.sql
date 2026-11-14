-- Fresh start (asked for on 15 Nov 2026): removes all test and demo records so the
-- company starts clean. Kept: employees (accounts, profiles, logins, roles), clients
-- and the money accounts (their names; every entry is removed). Company settings go
-- back to the defaults. Cannot be undone.

delete from public.client_feedback;
delete from public.review_links;
delete from public.task_comments;
delete from public.task_files;
delete from public.task_submissions;
delete from public.point_entries;
delete from public.bonuses;
delete from public.attendance;
delete from public.leave_requests;
delete from public.violation_types;
delete from public.payments;
delete from public.invoices;
delete from public.expenses;
delete from public.fixed_expenses;
delete from public.equipment_needs;
delete from public.equipment;
delete from public.project_comments;
delete from public.project_members;
update public.tasks set for_task_id = null where for_task_id is not null;
delete from public.tasks;
delete from public.projects;
delete from public.notices;
delete from public.broadcasts;
delete from public.change_requests;
delete from public.password_requests;
delete from public.role_previews;
delete from public.company_views;
-- Last, so nothing deleted above stays in the log or the alerts.
delete from public.notifications;
delete from public.delete_log;

-- Settings back to the defaults.
delete from public.point_settings;
insert into public.point_settings (org_id) select id from public.organizations;
update public.organizations
set appearance = '{}'::jsonb, invoice_options = '{}'::jsonb, auto_approve_limit = 0, delete_log_days = 30;
