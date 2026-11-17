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

Transport expenses are rows in `expenses` with category `transport`, one per trip, with `trip_origin`, `trip_destination` and an optional `traveler_id`. What the trip was for is recorded as a `project_id`, a `client_id`, or a `purpose` typed in by hand.

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

## View access and editing access

`roles.permissions` lists the parts of the app a role can view; `roles.edit_permissions` lists the parts it can also edit (non-admin edits still wait for admin approval). Editing a part always includes viewing it; a trigger keeps the two lists consistent. `has_segment()` answers "can view" and `has_edit_segment()` answers "can edit". The Trainee role starts with neither.

## Deliverable types and the shoot

`tasks.kind` says what a deliverable is: `shoot`, `video`, `thumbnail`, `graphic` or `other`. A thumbnail's `for_task_id` points at the video it belongs to, so a project can show which videos still have none. `projects.shoot_status` is `none`, `waiting` (for the client to confirm) or `confirmed`, with `shoot_date` once known. A client's scope is simply the list of deliverables on the project; "Copy as new project" starts the next batch from the same list.

## Notifications

| Table | Purpose |
| --- | --- |
| `notifications` | One line per thing a person should know: `title`, `body`, `href`, `read_at`. Written only by database triggers (being added to a project, being given a deliverable). People read and mark their own. |

## Project comments

| Table | Purpose |
| --- | --- |
| `project_comments` | A comment on a project: `project_id`, `author_id`, `body`. Everyone in the organization can read and add comments; people delete their own and admins delete any. |

Since this update every member can read every project, its deliverables and its team. Changing them still needs an admin, or the projects role with admin approval.

## Login details

| Table | Purpose |
| --- | --- |
| `profile_credentials` | The password an admin gave a person, encrypted by the server before it is stored (`password_cipher`), so admins can look it up later. Admin-only: employees cannot read or write it. Never kept for admin accounts. Supabase Auth remains the place that checks passwords. |

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

## Client review, invoice links and repeating projects (update 28)

- `task_files` and the `deliverables` storage bucket — created by update 28 but not used: work is shared as Drive or Dropbox links only.
- `review_links` — one link per project for the client (`/review/<token>`). Only people who can edit projects see or change it.
- `client_feedback` — the client's "approve" or "ask for changes" on a deliverable. Written only by the server; admins and the assignee are notified.
- `invoices.share_token` — when set, the client can open `/invoice/<token>` and save it as a PDF. `invoices.reminded_at` — last overdue reminder (at most weekly).
- `projects.recurs_monthly` — copied on the 1st of each month by `create_recurring_projects()`; copies carry `recurring_source_id` and `recurring_month`.
- `/api/cron/daily` (Vercel cron, 01:00 UTC) runs `create_recurring_projects()` and `remind_overdue_invoices()`. If `CRON_SECRET` is set in Vercel, only Vercel can call it.

## Several companies (update 31)

- Every table was already kept apart by `org_id`; each company sees only its own rows.
- `platform_owners` — the app's owner (the 365 Frames admin). Only the owner sees the Companies page (the company tag in the sidebar).
- `company_views` — the company the owner has stepped into. While set, `current_org_id()` returns that company and `is_admin()` is true, so the owner works there as its admin. `view_company(null)` steps back.
- New companies are made on the Companies page with their first admin (`/api/companies`), using the service key.

## Monthly clients (update 34)

A project is either **one-time** (`projects.kind = 'one_time'`, as before) or a **monthly client** (`'monthly'`): one project that stays open for an ongoing client.

- `project_package_items`: the monthly package, meaning what the client gets every month. Each line has a title, type, assignee, points, `due_day` (day of the month) and `for_item_id` (a thumbnail's video).
- `project_months`: one row per calendar month of a monthly project (`month` = its first day, `status` open/closed). `open_project_month(project, month)` creates the month once and copies every package line into `tasks`, assigned and due as the package says, with thumbnails paired to their video.
- `tasks.month_id`: the month a deliverable belongs to. `tasks.is_extra`: on top of the package, for that month only. `tasks.package_item_id`: the package line it came from.
- The daily job (`create_recurring_projects()`) now opens the current month for every monthly project that is onboarding or active. Closing a month (`status = 'closed'`) congratulates everyone who worked on it ("Well done! Month completed").
- Changing the package applies from the next month opened. Months already opened keep their own deliverables.
- `projects.recurs_monthly`, `recurring_source_id` and `recurring_month` (update 28) are no longer used. Update 34 turned repeating projects into monthly clients and merged their copies into months.

## Team guide welcome (update 35)

- `profiles.guide_seen_at`: when the person answered the one-time welcome pop-up. It appears right after someone fills in their profile for the first time and offers the team guide (Updates → Announcements, pinned). `mark_guide_seen()` sets it for the signed-in person. People whose profile was already complete were marked as having seen it.

## Deadlines, shoots and equipment checkouts (update 36)

- `notify_deadlines()` runs in the daily job (`/api/cron/daily`, 07:00 Dhaka). It sends:
  - **Due tomorrow:** to the assignee of an unfinished task (`tasks.reminder_sent_at`).
  - **Deadline missed:** to the assignee and the admins, once (`tasks.deadline_notified_at`).
  - **Project past its due date:** to the admins and the team, once (`projects.deadline_notified_at`).
  - **Shoot not confirmed:** two days before `projects.shoot_date` while the shoot isn't confirmed, or before a shoot deliverable's due date (`shoot_alerted_at`).
  - **Please return / Equipment overdue:** a checkout past `due_back` (`equipment_checkouts.overdue_notified_at`).
  - Changing a date clears its alert stamps, so the new date is reminded again.
- `equipment_checkouts`: who takes which item (`holder_id`), why (`purpose`, `project_id`), from `start_date` until `due_back`, with `taken_at` and `returned_at`.
  - `status` is one of requested, out, returned, declined or cancelled. Only one checkout per item can be `out` at a time.
  - Anyone can request an item for themselves; the taker is always the person asking. Only an admin can record a checkout for someone else, and an admin's checkout is handed over straight away. Admins and roles that edit equipment approve or decline requests (`/api/equipment-checkouts`).
  - The holder can cancel their own request or hand the item back (`my_checkout_action`).
  - Going out sets `equipment.current_holder_id` and status `in_use`; coming back returns it to storage.
- Everyone in the company can now read the equipment list, so they can ask for items.
- In the app, My Tasks shows a red count in the menu for one's own tasks that are overdue or due within two days (`src/lib/domain/deadlines.ts`).

## Monthly targets and delivery counts (update 37)

- Monthly clients now **track deliveries** instead of copying a package.
  - `project_targets`: an optional target per type and month (`kind`, `quantity`), e.g. 5 videos, 5 thumbnails, 3 social media posts.
  - Types without a target are only counted.
  - Each month's counter (`deliveryCounts` in `src/lib/domain/deliverables.ts`) counts that month's deliverables per type: delivered means approved, and it also tracks how many are in review.
- Months start empty. Work is added to a month as it comes, and existing package lines were turned into targets.
  - `project_package_items` remains in the database but is no longer used or shown.
- Two new deliverable types: `photo` and `post` (social media post).

## Fixed deliverables and change alerts (update 38)

- `project_targets` is now a list of a monthly client's **fixed deliverables**. Each line has:
  - a `kind`
  - an optional `quantity` ("5 videos")
  - an optional `label`, used for named services with no number ("Social media management") or to tell lines apart
  - a `position`

  Several lines can share a type; their numbers add up in the counter.
- A month's tasks are created on demand with `POST /api/tasks/bulk`:
  - `from_fixed: true` creates only what the month is still missing ("Video 1"…"Video 5", one task per named service).
  - With `kind`, `title` and `count`, it creates numbered copies.
  - Thumbnails are paired with the video of the same number.
- **Change alerts**:
  - `notify_task_changed()` tells a task's assignee when its title, notes, points, due date, type or links change.
  - `notify_project_changed()` tells the project's team when its name, brief, dates, shoot, links or client change.
  - The person making the change is never told.

## Quantity, company details and settings (update 39)

- `equipment.quantity` (default 1). As many checkouts can be `out` at once as there are (`check_equipment_available`).
  - A single item shows its holder.
  - Several of a kind turn `in_use` only once all are out.
- `organizations.contact_address`, `contact_phone`, `contact_email` and `website` are printed on invoices under the company name.
- `organizations.settings` (jsonb):
  - `reminders`: `due_tomorrow`, `missed`, `invoices`, `equipment_late`, `shoot_days`. Unset means on, and 2 days for shoots. `notify_deadlines` and `remind_overdue_invoices` respect them.
  - `hidden_sections`: optional menu sections switched off (`src/lib/domain/sections.ts`).

## Investments (update 40)

- `investors` (name, phone, notes).
- `investments` records money an investor put in: `investor_id`, `account_id`, `amount` and `received_on`. It counts in `account_balances`, so the funds go up.
- Paying an investor back is an expense with category `investment` and `investor_id` set. The database requires one exactly when the other is present.
- `investor_balances` gives `invested`, `repaid` and `due` per investor. Cash Flow shows the total as "Company due to investors".
- Cash flow readers can see all of it; changes go through approval like other cash flow entries.

## Leave by HR, months on record, hidden projects (update 42)

- Leave is decided by admins and **HR**: anyone whose role can edit Employees & Rewards (`team_points`).
  - HR is notified of new requests (`notify_leave`).
  - HR may update others' requests (`hr_decide` policy), never their own.
- The Leave page takes `?month=YYYY-MM`. It lists every request touching that month and approved days per person; the monthly summary has a "Days on leave" column.
- Employees → Points shows a six-month points table for everyone who sees team points. `point_entries.period_month` already keeps every month.
- Projects board: finished projects can be hidden (status `archived`), one by one or with "Hide all" (`POST /api/projects/hide-done`). They come back with "Show hidden" (`?hidden=1`), and stay in the list view and search.

## Hidden projects stay quiet (update 43)

- A hidden project (status `archived`, one-time or monthly) keeps everything inside it, but its tasks are left out of My Tasks, the calendar, the dashboard and the red My Tasks badge, and `notify_deadlines` sends no reminders for them.
- Projects → Board and List leave hidden projects out until "Show hidden" (`?hidden=1`).
- `POST /api/tasks/:id/start`: the assignee moves their own task from To do (or Changes requested) to In progress.

## Finish dates, logos, photos and features (update 44)

- `projects.finished_at` is set when a project becomes Completed or Hidden and cleared if it is reopened. The hidden projects list shows it as a month.
- `organizations.trade_license`.
- `org_logos` holds one small image per company. It is used in the menu and on invoices, and only admins can change it.
- `profile_photos` holds one cropped photo per person. Everyone in the company can read them; each person changes their own.
- Features (`settings.hidden_sections`) are `/calendar`, `/leave`, `/logistics` and `points`. `PATCH /api/org-features` switches one on or off; switching off can also delete its data (leave requests; equipment, checkouts and needed items; points, bonuses and attendance) after the admin types the feature's name.
- New companies are made in three steps (details and logo, features, first admin) through `POST /api/companies`; standard roles are created by the existing trigger.
- `ResourceManager` takes `quickActions`: one-click PATCH buttons per row. Approvals and the task page use them for Approve and Request changes.

- `delete_company(org)` (update 45): the owner deletes a customer company from Companies after typing its name. It clears records that block deletion first, then the company; the route then removes its people's logins. You can never delete your own company or the one that is open.

## Client portal, payroll, monthly invoices, urgent alerts, Excel (update 46)

- **Client portal**: `client_portals` holds one private token per client, made under Projects → Clients.
  - `/portal/<token>` shows the client's projects (monthly clients show their latest month), deliverables to approve or send back, and non-draft invoices (`/portal/<token>/invoice/<id>`).
  - Answers go to `client_feedback` with `portal_id`, through `POST /api/portal/<token>`.
- **Payroll** (admins):
  - `salaries` holds a monthly salary per person.
  - `payslips` holds one per person and month: salary, the approved bonus for the month, additions, deductions, and for reference days present, leave days and points.
  - `POST /api/payslips/generate` creates the month's drafts.
  - `PATCH /api/payslips/:id` with `account_id` pays a payslip: it records a `salary` expense and marks it paid.
  - Each person can read their own paid payslips. `/payslips/:id` is the printable payslip.
- **Monthly invoices**: `projects.monthly_fee`. `draft_monthly_invoices()` runs in the daily job and drafts one invoice per monthly client and month (`invoices.project_month_id` is unique), listing the fixed deliverables, and tells admins.
- **Urgent alerts** by email and WhatsApp:
  - Covers missed deadlines, projects past their due date, unconfirmed shoots, late equipment and overdue invoices.
  - `dispatchUrgentAlerts` runs in the daily job and marks `notifications.emailed_at`.
  - Needs `RESEND_API_KEY` and `ALERT_FROM_EMAIL`. WhatsApp also needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TEMPLATE`, and is sent to the profile's contact number.
  - Settings → Reminders can switch it off.
- **Excel**: `GET /api/report/export?month=YYYY-MM` (admins) returns an .xlsx with these sheets: Summary, Money in, Investments, Money out, Invoices, Payroll and Team. It is written by `src/lib/server/xlsx.ts`, with no library.
- **Photos**: `loadPhotos` and `<Avatar>` (`src/components/avatar.tsx`) show photos in team lists, project teams, comments and cards. The table column kind `person` reads `<key>_photo`.

## Itemised and extras invoices (update 47)

- `invoices.lines` (jsonb array of `{description, quantity, unit_price}`) is shown on the invoice as Qty / Rate / Amount. If the amount is later edited, the difference shows as an "Adjustment" line.
- The monthly fee invoice is drafted with one line for the package. `invoices_one_fee_per_month` allows one fee invoice per month.
- `invoices.is_extras` marks extras invoices. They come from `POST /api/invoices/extras`, prefilled by `extrasForMonth` (approved work beyond the fixed numbers, or everything delivered when nothing is fixed) at the prices in `projects.extra_rates`, which are remembered.

## Invoice design, signature, portal invoice switches (update 48)

- The invoice (`InvoiceSheet`, classes `.inv-*`) follows the company's own style: a wave header with the logo, a large INVOICE title, To / Date / Invoice no, a NO / DESCRIPTION table (adding QTY / RATE / AMOUNT when itemised), the total, payment method, signature, a thank-you line, and phone and mail pills.
- `invoice_options` now also holds texts (`client_line`, `payment_details`, `signature_name`, `signature_title`, `thank_you`, `phone`, `email`, `footer`) and the parts `payment`, `signature`, `thank_you` and `contacts`. Due date, status and company name start switched off.
- `org_signatures` holds the signature image (admins, `/api/org-signature`).
- The built-in 365 Frames logo is used only for the first company (`isFirstCompany`); other companies show their name until they upload a logo.
- `/projects/:id/invoice-preview?month=` shows a monthly client's fee invoice for a month: the saved draft if there is one, otherwise a preview.
- `client_portals.show_invoices` (off by default) and `show_drafts` decide whether the portal shows invoices and drafts. They are set from Projects → Clients (`PATCH /api/clients/:id/portal`).
