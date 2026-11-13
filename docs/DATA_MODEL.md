# Data model

All tables are in the `public` schema and carry `org_id`. The SQL is in `supabase/migrations/`.

## Core

| Table | Purpose |
| --- | --- |
| `organizations` | The company. Holds `timezone` (default `Asia/Dhaka`) and `currency` (default `BDT`). |
| `profiles` | One row per person, keyed by the Supabase Auth user id. `full_name`, `is_active`, and two derived columns kept in step with the person's roles: `job_title` (their role names) and `access_role` (`admin` or `employee`). |
| `roles` | Roles an admin defines: `name`, `description`, `color` (label colour from a fixed palette), `permissions` (list of segments), `is_admin`. Each organization starts with ten. |
| `change_requests` | A change proposed by a non-admin: `method`, `path`, `body`, `summary`, `status` (`pending`, `approved`, `denied`), who decided and when. The requester sees their own; admins see all. |
| `profile_roles` | Which roles a person holds. A person can hold several. |

## 1. Projects & Clients

| Table | Purpose |
| --- | --- |
| `clients` | Name and contact details. |
| `projects` | `name`, `brief`, `file_links` (list of `{label, url}`), `status` (`onboarding`, `active`, `completed`, `archived`), dates. `client_id` is optional: a project can be internal. |
| `project_members` | Employees assigned to a project. They can see the project and its deliverables even without the `projects` segment. |
| `tasks` | One per deliverable ("Video 1", "Video 2"). Own `description`, `file_links` (list of `{label, url}`), `assignee_id`, `status`, optional `points_value`, `due_date`. |
| `task_submissions` | Work handed in for a task. `kind` is `drive`, `dropbox` or `text`; links need a `url`, text needs a `note`. `review_status` is `pending`, `approved` or `changes_requested`, with reviewer and note. |

Automatic behaviour:

- A new submission sets the task to `submitted`.
- Reviewing a submission sets the task to `approved` or `changes_requested`.

Equipment is never assigned to projects or tasks. There is no link between them.

## 2. Logistics & Costs

| Table | Purpose |
| --- | --- |
| `equipment` | Inventory. `purchase_price` and `purchase_date` are optional. `current_holder_id` says who has it now, with `holder_since`. `source_expense_id` points to the cash-flow purchase that created it, if any. `condition` is `perfect`, `moderate`, `weak` or empty (not checked yet). |
| `equipment_needs` | Things the studio urgently needs to get: `item_name`, `quantity`, `note`, `status` (`needed` or `acquired`), `requested_by`. |
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
| `attendance` | One row per employee per day: `check_in` and `check_out` times, and `status` (`pending`, `verified` or `rejected`). People marking their own day must give both times. |
| `point_entries` | The points ledger. Each entry has `period_month`, signed `points`, a `source` (`attendance`, `task`, `violation`, `adjustment`) and, for deductions and adjustments, a required `reason`. |
| `monthly_points` (view) | Per employee per month: `total_points`, `earned_points`, `deducted_points`. |
| `bonuses` | One per employee per month: `points_total`, `amount`, `status` (`pending`, `approved`, `rejected`), who decided and when. |

Automatic behaviour:

- Verifying an attendance day adds the attendance points for the month of that day. Changing it back removes them.
- Approving a task adds its points to the assignee for the month of approval. Reverting the approval removes them.
- `calculate_bonuses(month)` creates pending bonuses for a finished month.

## Broadcasts

| Table | Purpose |
| --- | --- |
| `broadcasts` | A short urgent message (up to 280 characters) from anyone to the admins. `status` is `open` or `resolved`, with who resolved it and when. |

## Profiles and the notice board

| Table | Purpose |
| --- | --- |
| `profiles` (added columns) | `nickname`, `contact` and `profile_completed_at`. Everyone in the organization can see a colleague's name, roles and contact number. `profile_completed_at` is empty until the person fills in their profile at their first sign-in. |
| `profile_private` | One row per person with `address` and `secondary_contact`. Only the person themselves and admins can read it; only admins can write it directly. |
| `notices` | A notice from an admin to everyone: `title`, `body`, `is_urgent` and `expires_at`. An empty `expires_at` means "until deleted". Row level security stops showing a notice to the team the moment it expires; admins still see it until they delete it. |

A person changes their own profile through the function `update_my_profile`, which touches only the name, nickname, contact, address and secondary contact, so it cannot be used to change roles or access.

## Password requests

| Table | Purpose |
| --- | --- |
| `password_requests` | A forgotten-password request from the login page: who, their email, `status` (`pending`, `done`, `dismissed`). Only admins can read it; signed-out visitors have no access, and the server records requests on their behalf. Passwords themselves are never stored here. |

## 5. Admin Dashboard

No tables of its own. `src/lib/services/dashboard.ts` reads from the other modules.

## Row level security

Admins can read and edit everything. For everyone else, reading depends on the segments of the roles they hold (`has_segment()`). They cannot edit those tables in the database: their edits are stored in `change_requests` and applied by an admin's approval.

| Data | Always visible to you | Visible with segment |
| --- | --- | --- |
| Tasks, submissions | Tasks assigned to you and their submissions, plus all tasks of projects you are assigned to | `projects`: all |
| Projects | Projects you are assigned to or have a task in | `projects`: all |
| Clients | None | `projects` or `cashflow` |
| Equipment | Items you hold | `equipment`: all |
| Fixed expenses | None | `costs` or `cashflow` |
| Expenses | None | `cashflow`: all; `costs`: transport only |
| Accounts, invoices, payments | None | `cashflow` |
| Attendance, point entries | Your own | `team_points`: everyone's |
| Bonuses | Your own | `bonuses`: everyone's |
| Needed equipment | Items you asked for | `equipment`: all, and may edit or mark acquired |
| Broadcasts | The ones you sent | Admins only: all |
| Profiles, roles, point settings, violation types | All | n/a |

`set_profile_roles(profile, roles[])` replaces a person's roles in one step (admins only).
