# API

All routes are under `/api`, need a signed-in user, and exchange JSON.

- Success: `{ "data": ... }`
- Failure: `{ "error": { "message": "...", "details": ... } }` with status 400 (invalid input), 401 (signed out), 403 (not allowed), 404, 409 (duplicate or still linked) or 500.

"Member" means any signed-in person. A segment name (such as `cashflow`) means admins plus anyone whose roles include that segment; see [ARCHITECTURE.md](ARCHITECTURE.md#permissions). Member routes still return only the rows the caller may see. Unless noted, collection routes support `GET` (list) and `POST` (create), and item routes (`/[id]`) support `GET`, `PATCH` and `DELETE`.

## 1. Projects & Clients

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/clients`, `/clients/[id]` | `projects` or `cashflow` | Admin | |
| `/projects` | Member | Admin | `POST` `{ name, client_name?, brief?, start_date?, due_date?, file_links[]?, member_ids[]?, deliverables[]? }`. Only `name` is required. `client_name` is looked up by name and created if new. Filters: `client_id`, `status`. |
| `/projects/[id]` | Member | Admin | `PATCH` takes the same fields except `deliverables`; `member_ids` replaces the team. |
| `/tasks`, `/tasks/[id]` | Member | Admin | Filters: `project_id`, `assignee_id`, `status`. Responses include the assignee's name and job role. |
| `/tasks/[id]/submissions` | Member | Assignee or admin | `POST` `{ kind: "drive" \| "dropbox" \| "text", url?, note? }` |
| `/submissions/[id]` | Member | Admin | `PATCH` `{ review_status, review_note? }` is the admin review. |

## 2. Logistics & Costs

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/equipment`, `/equipment/[id]` | Member | Admin | `purchase_price` is optional. Set `current_holder_id` to record who holds an item. Filters: `status`, `current_holder_id`. |
| `/fixed-expenses`, `/fixed-expenses/[id]` | `costs` or `cashflow` | Admin | |
| `/expenses?category=transport` | `costs` or `cashflow` | Admin | Transport trips are expenses with `trip_origin` and `trip_destination`, and what the trip was for: `project_id`, `client_id` or a free-text `purpose`. |

## 3. Cash Flow & Invoices

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/accounts`, `/accounts/[id]` | `cashflow` | Admin | |
| `/invoices`, `/invoices/[id]` | `cashflow` | Admin | Filters: `client_id`, `project_id`, `status`. |
| `/payments`, `/payments/[id]` | `cashflow` | Admin | Filters: `invoice_id`, `account_id`. |
| `/expenses`, `/expenses/[id]` | `cashflow` or `costs` | Admin | `category: "equipment"` creates an inventory record; `amount` may be omitted for that category only. Filters: `category`, `account_id`, `fixed_expense_id`. |

## 4. Employees & Rewards

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/roles`, `/roles/[id]` | Member | Admin | `{ name, description?, color?, permissions[] }`. The Admin role cannot be deleted. |
| `/employees` | Member | Admin | `POST` `{ email, full_name, role_ids[], password? }` creates the person's account straight away (no email is sent); an empty password has the server choose one. Needs the service-role key. |
| `/employees/[id]` | Member | Admin | `PATCH` `{ full_name?, email?, nickname?, contact?, secondary_contact?, address?, role_ids?, is_active? }`; `role_ids` replaces the person's roles and `is_active: false` suspends them. `DELETE` removes the account and the person's own records for good. |
| `/attendance` | Own (admin: all) | Member | `POST` `{ work_date }` marks your own day as pending. Admins may pass `employee_id` and `status`. |
| `/attendance/[id]` | Own (admin: all) | Admin | `PATCH` `{ status: "verified" }` verifies the day and awards the points. |
| `/points` | Own (admin: all) | Admin | Point entries. `POST` records a violation or adjustment: `{ source, employee_id, reason, violation_type_id?, points?, month? }`. Filters: `employee_id`, `period_month`, `source`. |
| `/points/[id]` | Own (admin: all) | Admin | |
| `/points/summary?month=YYYY-MM` | Own (admin: all) | n/a | Totals, distance to target and projected bonus per employee. |
| `/violation-types`, `/violation-types/[id]` | Member | Admin | |
| `/point-settings` | Member | Admin | `GET` and `PATCH` on the organization's single settings row. |
| `/bonuses` | Own (admin: all) | n/a | `GET` only. Filters: `employee_id`, `period_month`, `status`. |
| `/bonuses/calculate` | n/a | Admin | `POST` `{ month: "YYYY-MM" }` for a finished month. |
| `/bonuses/[id]` | Own (admin: all) | Admin | `PATCH` `{ status: "approved" \| "rejected" \| "pending" }` |

## Change requests

For every route whose Write column says Admin, a non-admin whose roles include that part of the app gets `202 { "data": { "pending": true, "summary": "..." } }`: the change was stored for approval, not applied. The exceptions are roles, employees, point rules, submissions review, bonus calculation and broadcasts, which only admins can change.

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/change-requests?status=pending` | Own (admin: all) | n/a | |
| `/change-requests/[id]` | n/a | Admin | `POST` `{ decision: "approve" \| "deny", note? }`. Approving applies the change. |

## Forgotten passwords

| Route | Who | Notes |
| --- | --- | --- |
| `POST /password-requests` | Anyone, signed out | `{ email }`. Always answers `202`, whether or not the email belongs to an account. Records one pending request per active person; for an admin account it sends a Supabase verification email with a reset link to `/auth/reset` instead. Needs the service-role key. |
| `POST /password-requests/[id]` | Admin | `{ action: "set", password }` sets a new password for the person, or `{ action: "dismiss" }`. |
| `GET /employees/passwords` | Admin | `{ ready, passwords }`: every password on record, by person id. `ready` is false until the login details table exists. |
| `POST /employees/passwords` | Admin | Gives every active employee without a password on record a new, different one and records it. People who already have one are left alone. |
| `GET /employees/[id]/password` | Admin | `{ password }`: the password on record for that person, or `null` when none was set through the app. |
| `POST /employees/[id]/password` | Admin | `{ password }` sets a new password for that person (6 to 72 characters) and closes any pending request from them. Needs the service-role key. |
| `POST /password-reset` | Anyone with a valid emailed link | `{ access_token, password }`. The last step of an admin's reset email; the token is checked with Supabase Auth and only works for admin accounts. |

## Profiles and the notice board

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/profile` | Own | Member | `GET` returns your profile with your private details. `PATCH` `{ full_name, nickname?, contact, address?, secondary_contact? }` fills in or changes your own profile; the first save also marks the profile as completed. |
| `/profile/[id]` | — | Admin | `PATCH` with the same fields corrects anyone's profile, private details included. |
| `/notices` | Member (not expired; admin: all) | Admin | `POST` `{ title, body?, is_urgent?, duration }`; `duration` is `3d`, `1w`, `15d`, `1m` or `forever`. |
| `/notices/[id]` | Member | Admin | `PATCH` `{ title?, body?, is_urgent?, duration? }` (a new duration counts from now); `DELETE` removes the notice. |

## Broadcasts and needed equipment

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/broadcasts` | Own (admin: all) | Member | `POST` `{ message }` sends a broadcast to the admins (up to 280 characters). |
| `/broadcasts/[id]` | Own (admin: all) | Admin | `PATCH` `{ status: "resolved" \| "open" }` |
| `/equipment-needs` | Own (`equipment`: all) | Member | `POST` `{ item_name, quantity?, note? }` |
| `/equipment-needs/[id]` | Own (`equipment`: all) | `equipment` | `PATCH` `{ item_name?, quantity?, note?, status? }`; `status` is `needed` or `acquired`. |

## 5. Admin Dashboard

| Route | Read | Notes |
| --- | --- | --- |
| `/dashboard` | Member | Returns only what the caller's roles allow, plus their own task, points and equipment counts. |
