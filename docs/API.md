# API

All routes are under `/api`, need a signed-in user, and exchange JSON.

- Success: `{ "data": ... }`
- Failure: `{ "error": { "message": "...", "details": ... } }` with status 400 (invalid input), 401 (signed out), 403 (not allowed), 404, 409 (duplicate or still linked) or 500.

"Member" means any active employee. Unless noted, collection routes support `GET` (list) and `POST` (create), and item routes (`/[id]`) support `GET`, `PATCH` and `DELETE`.

## 1. Projects & Clients

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/clients`, `/clients/[id]` | Member | Admin | |
| `/projects` | Member | Admin | `POST` takes the project, its brief and `deliverables[]`, and creates one task per deliverable. Filters: `client_id`, `status`. |
| `/projects/[id]` | Member | Admin | |
| `/tasks`, `/tasks/[id]` | Member | Admin | Filters: `project_id`, `assignee_id`, `status`. Responses include the assignee's name and job role. |
| `/tasks/[id]/submissions` | Member | Assignee or admin | `POST` `{ kind: "drive" \| "dropbox" \| "text", url?, note? }` |
| `/submissions/[id]` | Member | Admin | `PATCH` `{ review_status, review_note? }` is the admin review. |

## 2. Logistics & Costs

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/equipment`, `/equipment/[id]` | Member | Admin | `purchase_price` is optional. Set `current_holder_id` to record who holds an item. Filters: `status`, `current_holder_id`. |
| `/fixed-expenses`, `/fixed-expenses/[id]` | Admin | Admin | |
| `/expenses?category=transport` | Admin | Admin | Transport trips are expenses with `trip_origin` and `trip_destination`. |

## 3. Cash Flow & Invoices

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/accounts`, `/accounts/[id]` | Admin | Admin | |
| `/invoices`, `/invoices/[id]` | Admin | Admin | Filters: `client_id`, `project_id`, `status`. |
| `/payments`, `/payments/[id]` | Admin | Admin | Filters: `invoice_id`, `account_id`. |
| `/expenses`, `/expenses/[id]` | Admin | Admin | `category: "equipment"` creates an inventory record; `amount` may be omitted for that category only. Filters: `category`, `account_id`, `fixed_expense_id`. |

## 4. Employees & Rewards

| Route | Read | Write | Notes |
| --- | --- | --- | --- |
| `/employees` | Member | Admin | `POST` `{ email, full_name, job_title }` invites a new person; `job_title` must be one of the roles in `src/lib/domain/roles.ts`, and access follows it. Needs the service-role key. |
| `/employees/[id]` | Member | Admin | `GET` and `PATCH` only. Deactivate with `is_active: false`. |
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

## 5. Admin Dashboard

| Route | Read | Notes |
| --- | --- | --- |
| `/dashboard` | Admin | Funds, outstanding dues, this month's expenses, fixed monthly costs, equipment value, project and task counts, pending approvals. |
