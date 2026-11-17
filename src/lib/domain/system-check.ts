// The database updates, in order, and one thing each adds that can be looked
// for. Used by the System check page to show which have been run.

export interface UpdateCheck {
  file: string;
  adds: string;
  table: string;
  column: string;
}

export const DATABASE_UPDATES: UpdateCheck[] = [
  { file: '20261112000001_core.sql', adds: 'Projects, clients and tasks', table: 'projects', column: 'id' },
  { file: '20261112000002_logistics.sql', adds: 'Equipment', table: 'equipment', column: 'id' },
  { file: '20261112000003_cashflow_logistics.sql', adds: 'Cash flow and costs', table: 'expenses', column: 'id' },
  { file: '20261112000004_rewards.sql', adds: 'Points and bonuses', table: 'point_entries', column: 'id' },
  { file: '20261112000005_access.sql', adds: 'Access rules', table: 'organizations', column: 'id' },
  { file: '20261112000006_roles.sql', adds: 'Roles as tags', table: 'roles', column: 'permissions' },
  { file: '20261112000007_broadcasts_logistics.sql', adds: 'Broadcasts and needed items', table: 'broadcasts', column: 'id' },
  { file: '20261112000008_project_team_links.sql', adds: 'Project teams and links', table: 'project_members', column: 'profile_id' },
  { file: '20261112000009_change_requests_role_colors.sql', adds: 'Approvals for changes', table: 'change_requests', column: 'id' },
  { file: '20261112000010_attendance_times.sql', adds: 'Entry and exit times', table: 'attendance', column: 'check_in' },
  { file: '20261112000012_password_requests.sql', adds: 'Forgotten-password requests', table: 'password_requests', column: 'id' },
  { file: '20261112000013_profiles_notices.sql', adds: 'Profiles and announcements', table: 'notices', column: 'id' },
  { file: '20261112000014_login_details.sql', adds: 'Login details', table: 'profile_credentials', column: 'profile_id' },
  { file: '20261112000015_trip_purpose.sql', adds: 'What a trip was for', table: 'expenses', column: 'purpose' },
  { file: '20261112000016_project_comments.sql', adds: 'Project comments', table: 'project_comments', column: 'id' },
  { file: '20261112000017_view_edit_access.sql', adds: 'View or edit access', table: 'roles', column: 'edit_permissions' },
  { file: '20261112000018_deliverable_types_shoot.sql', adds: 'Deliverable types and shoots', table: 'tasks', column: 'kind' },
  { file: '20261112000019_project_rules_notifications.sql', adds: 'Notifications', table: 'notifications', column: 'id' },
  { file: '20261112000020_delete_log_role_preview.sql', adds: 'Delete log and "view as a role"', table: 'delete_log', column: 'id' },
  { file: '20261112000021_device_alerts.sql', adds: 'Alerts on devices', table: 'push_subscriptions', column: 'id' },
  { file: '20261112000022_live_updates_alerts.sql', adds: 'Live updates and project points', table: 'org_activity', column: 'version' },
  { file: '20261112000024_appearance.sql', adds: 'Appearance', table: 'organizations', column: 'appearance' },
  { file: '20261112000025_updates_messages.sql', adds: 'Personal messages', table: 'broadcasts', column: 'recipient_id' },
  { file: '20261112000026_rules_leave_notifications.sql', adds: 'Rules, leave and notification settings', table: 'leave_requests', column: 'id' },
  { file: '20261112000027_task_comments.sql', adds: 'Comments on deliverables', table: 'task_comments', column: 'id' },
  { file: '20261112000028_files_review_invoices_recurring.sql', adds: 'Client review, invoice links and repeating projects', table: 'review_links', column: 'token' },
  { file: '20261112000029_invoice_options.sql', adds: 'Choosing what invoices show', table: 'organizations', column: 'invoice_options' },
  { file: '20261112000031_companies.sql', adds: 'Several companies', table: 'company_views', column: 'org_id' },
  { file: '20261112000034_monthly_clients.sql', adds: 'Monthly clients', table: 'project_months', column: 'month' },
  { file: '20261112000035_guide_welcome.sql', adds: 'Team guide welcome pop-up', table: 'profiles', column: 'guide_seen_at' },
  { file: '20261112000036_deadlines_shoots_checkouts.sql', adds: 'Deadline alerts, shoot reminders and equipment checkouts', table: 'equipment_checkouts', column: 'due_back' },
  { file: '20261112000037_delivery_targets.sql', adds: 'Monthly targets and delivery counts', table: 'project_targets', column: 'quantity' },
  { file: '20261112000038_fixed_deliverables_change_alerts.sql', adds: 'Fixed deliverables and change alerts', table: 'project_targets', column: 'label' },
  { file: '20261112000039_quantity_company_settings.sql', adds: 'Equipment quantity, company details and settings', table: 'equipment', column: 'quantity' },
  { file: '20261112000040_investments.sql', adds: 'Investors, investments and repayments', table: 'investors', column: 'name' },
  { file: '20261112000044_finished_logo_photos.sql', adds: 'Finish dates, company logo and profile photos', table: 'profile_photos', column: 'data' },
  { file: '20261112000046_portal_payroll_invoices_email.sql', adds: 'Client portal, payroll, monthly invoices and email alerts', table: 'payslips', column: 'base_salary' },
  { file: '20261112000047_invoice_lines_extras.sql', adds: 'Itemised invoices and extras invoices', table: 'invoices', column: 'lines' },
  { file: '20261112000048_signature_portal_invoices.sql', adds: 'Invoice signature and portal invoice switches', table: 'client_portals', column: 'show_invoices' },
  { file: '20261112000050_email_outbox.sql', adds: 'Emails wait for approval', table: 'email_outbox', column: 'subject' },
];

/** Files whose effect cannot be looked for from the app; they are listed as "cannot be checked". */
export const UNCHECKABLE = ['20261112000011_task_points_sync.sql', '20261112000023_quieter_live_updates.sql', '20261112000030_company_name.sql', '20261112000032_fresh_start.sql', '20261112000033_well_done.sql', '20261112000041_investor_delete.sql', '20261112000042_leave_hr.sql', '20261112000043_hidden_projects_quiet.sql', '20261112000045_delete_company.sql', '20261112000049_mail_settings.sql'];
