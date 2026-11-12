# Data model

All tables are in the `public` schema and carry `org_id`. The SQL is in `supabase/migrations/`.

## Core

| Table | Purpose |
| --- | --- |
| `organizations` | The company. Holds `timezone` (default `Asia/Dhaka`) and `currency` (default `BDT`). |
| `profiles` | One row per person, keyed by the Supabase Auth user id. `full_name`, `job_title` (visible job role, from the fixed list in `src/lib/domain/roles.ts`), `access_role` (`admin` for the Admin role, `employee` for every other role), `is_active`. |

## 1. Projects & Clients

| Table | Purpose |
| --- | --- |
| `clients` | Name and contact details. |
| `projects` | Belongs to a client. `brief`, `status` (`onboarding`, `active`, `completed`, `archived`), dates. |
| `tasks` | One per deliverable ("Video 1", "Video 2"). Own `description`, `file_links` (list of `{label, url}`), `assignee_id`, `status`, optional `points_value`, `due_date`. |
| `task_submissions` | Work handed in for a task. `kind` is `drive`, `dropbox` or `text`; links need a `url`, text needs a `note`. `review_status` is `pending`, `approved` or `changes_requested`, with reviewer and note. |

Automatic behaviour:

- A new submission sets the task to `submitted`.
- Reviewing a submission sets the task to `approved` or `changes_requested`.

Equipment is never assigned to projects or tasks. There is no link between them.

## 2. Logistics & Costs

| Table | Purpose |
| --- | --- |
| `equipment` | Inventory. `purchase_price` and `purchase_date` are optional. `current_holder_id` says who has it now, with `holder_since`. `source_expense_id` points to the cash-flow purchase that created it, if any. |
| `fixed_expenses` | Recurring monthly costs: `name`, `kind` (`rent`, `utilities`, `other`), `monthly_amount`, `is_active`. |

Transport expenses are rows in `expenses` with category `transport`, one per trip, with `trip_origin`, `trip_destination` and an optional `traveler_id`.

## 3. Cash Flow & Invoices

| Table or view | Purpose |
| --- | --- |
| `accounts` | Where money is held: `cash`, `bank` or `mobile_wallet`, with an `opening_balance`. |
| `invoices` | Billed to a client, optionally for a project. `status` is `draft`, `sent` or `void`. |
| `payments` | Money received against an invoice into an account. |
| `expenses` | The single record of money going out. `category` is `general`, `equipment`, `fixed` or `transport`. |
| `invoice_balances` (view) | Per invoice: `amount`, `paid`, `outstanding`. |
| `account_balances` (view) | Per account: opening balance + payments received − expenses paid. |

Rules on `expenses`:

- `amount` is required, except for an equipment purchase whose price is not known yet.
- A transport expense must have both ends of the trip.
- `fixed_expense_id` may only be set on a `fixed` expense.

Automatic behaviour:

- Inserting an expense with category `equipment`, or changing an existing expense to that category, creates one `equipment` row named after the expense description, with the expense amount as its price (empty if the amount is missing).
- If the expense amount is corrected later, the inventory price follows, unless someone has already edited the price on the inventory record.

## 4. Employees & Rewards

| Table or view | Purpose |
| --- | --- |
| `point_settings` | One row per organization, created automatically. See [POINTS_AND_BONUSES.md](POINTS_AND_BONUSES.md). |
| `violation_types` | Named responsibility violations with a configurable `deduction_points`. |
| `attendance` | One row per employee per day: `pending`, `verified` or `rejected`. |
| `point_entries` | The points ledger. Each entry has `period_month`, signed `points`, a `source` (`attendance`, `task`, `violation`, `adjustment`) and, for deductions and adjustments, a required `reason`. |
| `monthly_points` (view) | Per employee per month: `total_points`, `earned_points`, `deducted_points`. |
| `bonuses` | One per employee per month: `points_total`, `amount`, `status` (`pending`, `approved`, `rejected`), who decided and when. |

Automatic behaviour:

- Verifying an attendance day adds the attendance points for the month of that day. Changing it back removes them.
- Approving a task adds its points to the assignee for the month of approval. Reverting the approval removes them.
- `calculate_bonuses(month)` creates pending bonuses for a finished month.

## 5. Admin Dashboard

No tables of its own. `src/lib/services/dashboard.ts` reads from the other modules.

## Row level security

| Data | Employee | Admin |
| --- | --- | --- |
| Clients, projects, tasks, submissions, equipment | Read | Read and edit |
| Profiles, point settings, violation types | Read | Read and edit |
| Own attendance, point entries, bonuses | Read (own only) | Read and edit (everyone's) |
| Submissions on tasks assigned to them | Create | Read and edit |
| Own attendance for a day | Create as pending | Read and edit |
| Accounts, invoices, payments, expenses, fixed expenses | No access | Read and edit |
