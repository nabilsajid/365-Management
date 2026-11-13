// Row types for the tables and views in supabase/migrations.
// Hand-written for the foundation; they can be replaced later with
// `supabase gen types typescript` without changing the names used here.

export type AccessRole = 'admin' | 'employee';
export type ProjectStatus = 'onboarding' | 'active' | 'completed' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved';
export type SubmissionKind = 'drive' | 'dropbox' | 'text';
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested';
export type AccountKind = 'cash' | 'bank' | 'mobile_wallet';
export type InvoiceStatus = 'draft' | 'sent' | 'void';
export type ExpenseCategory = 'general' | 'equipment' | 'fixed' | 'transport';
export type EquipmentCondition = 'perfect' | 'moderate' | 'weak';
export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'retired';
export type FixedExpenseKind = 'rent' | 'utilities' | 'other';
export type AttendanceStatus = 'pending' | 'verified' | 'rejected';
export type PointSource = 'attendance' | 'task' | 'violation' | 'adjustment';
export type BonusStatus = 'pending' | 'approved' | 'rejected';

export interface Organization {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  job_title: string | null;
  access_role: AccessRole;
  is_active: boolean;
  created_at: string;
  /** Shown to everyone in the organization, with the name and roles. */
  nickname?: string | null;
  contact?: string | null;
  /** Set the first time a person fills in their profile; empty means they have not yet. */
  profile_completed_at?: string | null;
}

/** Private details: visible to the person themselves and to admins only. */
export interface ProfilePrivate {
  profile_id: string;
  org_id: string;
  address: string | null;
  secondary_contact: string | null;
  updated_at: string;
}

export interface Notice {
  id: string;
  org_id: string;
  title: string;
  body: string | null;
  is_urgent: boolean;
  /** Empty means the notice stays until an admin deletes it. */
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  permissions: string[];
  color: string;
  is_admin: boolean;
  created_at: string;
}

export interface ProfileRole {
  profile_id: string;
  role_id: string;
  org_id: string;
}

export interface Client {
  id: string;
  org_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  client_id: string | null;
  name: string;
  brief: string | null;
  file_links: FileLink[];
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  profile_id: string;
  org_id: string;
}

export interface FileLink {
  label: string;
  url: string;
}

export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  description: string | null;
  file_links: FileLink[];
  assignee_id: string | null;
  status: TaskStatus;
  points_value: number | null;
  due_date: string | null;
  position: number;
  created_at: string;
}

export interface TaskSubmission {
  id: string;
  org_id: string;
  task_id: string;
  submitted_by: string;
  kind: SubmissionKind;
  url: string | null;
  note: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  kind: AccountKind;
  opening_balance: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  org_id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  amount: number;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  org_id: string;
  invoice_id: string;
  account_id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  note: string | null;
  created_at: string;
}

export interface FixedExpense {
  id: string;
  org_id: string;
  name: string;
  kind: FixedExpenseKind;
  monthly_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  org_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number | null;
  expense_date: string;
  account_id: string | null;
  fixed_expense_id: string | null;
  trip_origin: string | null;
  trip_destination: string | null;
  traveler_id: string | null;
  project_id?: string | null;
  client_id?: string | null;
  purpose?: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Equipment {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  status: EquipmentStatus;
  current_holder_id: string | null;
  holder_since: string | null;
  source_expense_id: string | null;
  condition: EquipmentCondition | null;
  notes: string | null;
  created_at: string;
}

export interface EquipmentNeed {
  id: string;
  org_id: string;
  item_name: string;
  quantity: number;
  note: string | null;
  status: 'needed' | 'acquired';
  requested_by: string | null;
  created_at: string;
}

export interface Broadcast {
  id: string;
  org_id: string;
  sender_id: string;
  message: string;
  status: 'open' | 'resolved';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ChangeRequest {
  id: string;
  org_id: string;
  requested_by: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: Record<string, unknown> | null;
  summary: string;
  status: 'pending' | 'approved' | 'denied';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface PasswordRequest {
  id: string;
  org_id: string;
  profile_id: string;
  email: string;
  status: 'pending' | 'done' | 'dismissed';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PointSettings {
  org_id: string;
  monthly_target: number;
  attendance_points: number;
  default_task_points: number;
  bonus_step_points: number;
  bonus_step_amount: number;
}

export interface ViolationType {
  id: string;
  org_id: string;
  name: string;
  deduction_points: number;
  is_active: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  org_id: string;
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  verified_by: string | null;
  verified_at: string | null;
  note: string | null;
  created_at: string;
}

export interface PointEntry {
  id: string;
  org_id: string;
  employee_id: string;
  period_month: string;
  points: number;
  source: PointSource;
  attendance_id: string | null;
  task_id: string | null;
  violation_type_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Bonus {
  id: string;
  org_id: string;
  employee_id: string;
  period_month: string;
  points_total: number;
  amount: number;
  status: BonusStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

// Views
export interface MonthlyPoints {
  org_id: string;
  employee_id: string;
  period_month: string;
  total_points: number;
  earned_points: number;
  deducted_points: number;
}

export interface InvoiceBalance {
  invoice_id: string;
  org_id: string;
  amount: number;
  paid: number;
  outstanding: number;
}

export interface AccountBalance {
  account_id: string;
  org_id: string;
  balance: number;
}
