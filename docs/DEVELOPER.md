# UniDock (365 Management): developer guide

Start here. This guide explains how the app is built, how to run it, and how to change it safely. The other files in `docs/` go deeper:

| File | What it covers |
|---|---|
| `ARCHITECTURE.md` | Conventions, the interface system, CI and the daily job |
| `DATA_MODEL.md` | Tables and what each update added |
| `API.md` | The HTTP routes |
| `POINTS_AND_BONUSES.md` | How monthly points and bonuses are calculated |

## 1. What the app is

UniDock is a company workspace for small teams, first built for 365 Frames, a media production company. It covers:

- **Projects & Clients**: one-time projects and monthly clients (a monthly package, a month for each calendar month, and extras), deliverables (videos, thumbnails, graphics, shoots), submissions as Drive or Dropbox links, review, comments with @mentions, and client review links.
- **Logistics & Costs**: the equipment list and who holds it, needed items, fixed monthly costs, and travel costs per trip.
- **Cash Flow & Invoices**: accounts, invoices (printable and shareable), payments, expenses, balances, CSV exports and a monthly summary.
- **Employees & Rewards**: profiles, roles, attendance, monthly points, deductions, bonuses, leave and the points statement.
- **Admin**: dashboard, approvals, roles and access, settings, delete log, system check, and companies.

Several companies can use one deployment. Every row belongs to one company (`org_id`), and companies never see each other's data.

## 2. Stack

- **Next.js 15 App Router + React 19 + TypeScript.** Pages are server components that read Supabase directly. Every write goes through an API route in `src/app/api`.
- **Supabase**: Postgres with row level security (RLS) on every table, plus Supabase Auth (email and password).
- **zod** validates every request body (`src/lib/validation.ts`).
- **Tailwind CSS v4.** The design tokens are in `src/app/globals.css`. Icons come from Lucide, charts from Recharts.
- **Vercel** for hosting (region `sin1`), plus a daily job (`vercel.json`).
- **GitHub Actions** for checks, automatic database updates, and browser tests (optional).

## 3. Running it locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

Environment variables (set the same ones in Vercel → Settings → Environment Variables):

| Name | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Adding employees and companies, readable login details, device alerts, client review and invoice links, the daily job |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Device alerts (Web Push) |
| `CRON_SECRET` | Optional. Only Vercel may call `/api/cron/daily` |
| `DATABASE_URL` | Only for `npm run test:db` |

Never commit real values. **Do not run `npm run seed:demo` against the live project**: it creates demo data, and the live company was given a fresh start on 15 Nov 2026 (update 32).

## 4. Project layout

```
src/
  app/
    (app)/            signed-in pages (layout.tsx builds the shell, badges and live refresh)
    api/              every write, plus a few reads
    login/ auth/      sign-in and password reset
    review/[token]    client review page (public, no account)
    invoice/[token]   shared invoice (public, no account)
  components/         UI: resource-manager (tables + forms), shell/, ui/, feature components
  lib/
    api/              context.ts (who is signed in), crud.ts (generic create/update/delete with approvals), resources.ts, http.ts
    domain/           pure logic with unit tests (points, calendar, roles, csv, invoice options, …)
    services/         data helpers shared by pages and routes (search, projects, rewards)
    server/           server-only code (push, login details, encryption)
    content/          the team guide pinned to the notice board
    supabase/         browser, server and admin (service role) clients
public/               sw.js (offline + push), icons, logos, offline.html
supabase/migrations/  database updates, applied in order
tests/unit/           node:test unit tests     tests/db/  SQL smoke tests     tests/e2e/  Playwright
```

## 5. How access works

There are three layers, and all three must agree.

1. **Database (the real gate).** RLS policies use helper functions:
   - `current_org_id()`: the company of the signed-in person, or the company the owner has stepped into.
   - `is_admin()`: an active admin who isn't previewing a role, or the owner inside another company.
   - `has_segment(x)` and `has_edit_segment(x)`: true when one of the person's roles opens section `x` for viewing or editing.
2. **API.** `requireContext('member' | 'admin' | ['segment'])` and `requireWriter([...])` in `src/lib/api/context.ts`. A write by someone who can't apply it directly becomes a **change request** for an admin (`proposeChange`), unless the resource's `directWhen` says otherwise. One example of `directWhen`: costs under the company's approval limit are applied straight away.
3. **Interface.** `getPageContext()` gives every page `can(segment)`, `canEdit(segment)`, `isAdmin`, `owner` and `companyView`. The sidebar (`src/components/shell/nav.ts`) shows items by `segment`, `adminOnly` and `nonAdminOnly`.

**Sections** (`src/lib/domain/roles.ts`):

| Key | What it opens |
|---|---|
| `projects` | Every project, not only your own |
| `equipment` | The equipment list |
| `costs` | Fixed and transport costs |
| `cashflow` | Cash flow and invoices |
| `team_points` | Everyone's attendance and points |
| `bonuses` | Everyone's bonuses |

**Roles are tags.** A person can hold several roles, and their access is the union of them. Each role lists the sections it can view (`permissions`) and the sections it can edit (`edit_permissions`). Default roles for a new company:

| Role | Sections |
|---|---|
| Admin | Everything (`is_admin`) |
| Project Manager | projects |
| Finance Manager | cashflow, costs, bonuses |
| Human Resource | team_points, bonuses |
| Logistics Manager | equipment, costs |
| Operations Manager | projects, equipment, costs |
| Graphic Designer, Senior Graphic Designer, Video Editor, Senior Visualizer | None (their own work only) |
| Trainee | None, and view only |

Everyone can always see and act on their own things: assigned tasks, their own attendance, points and leave, travel costs, broadcasts and messages.

**View as a role** (admins, Roles & Access) writes `role_previews`. While it's set, the database and the app treat the admin as a holder of that role only.

**Companies.**
- `platform_owners` holds the app's owner.
- `company_views` holds the company the owner has stepped into. `view_company(org)` sets it, and `view_company(null)` clears it.
- New companies, each with its first admin, are created by `/api/companies` using the service key. New companies get the default roles and point rules through triggers on `organizations`.

## 6. Database updates (migrations)

- Add a file `supabase/migrations/2026MMDD0000NN_name.sql`, numbered after the last one.
- **Pushing to `main` applies it to the live database automatically** (`.github/workflows/db-update.yml`, using the `SUPABASE_DB_URL` secret, which is the Session pooler connection string). Check the run under GitHub → Actions → Database update.
- Run **Database update** by hand to preview: it's a dry run by default.
- Write updates that are safe for existing data: use `if not exists`, give defaults for new columns, and backfill where needed. The app must keep working before an update has run. Pages check for a column or table (`'col' in row`, or an error on the query) and hide the feature until it exists.
- Add a probe for each update to `src/lib/domain/system-check.ts`, so Settings → System check shows it. Put updates that only change data in `UNCHECKABLE`.
- New tables need: `alter table … enable row level security`, policies, `grant select … to authenticated` where reading is allowed, and the `log_delete` and `bump_activity` triggers if the table should appear in the delete log or refresh pages live.
- Update `src/types/database.ts` and `docs/DATA_MODEL.md`.

## 7. Adding a feature (the usual path)

1. **Database:** a migration with RLS (section 6).
2. **Validation:** a zod schema in `src/lib/validation.ts`.
3. **API:**
   - For plain create, update and delete with approvals, add a `ResourceConfig` in `src/lib/api/resources.ts` and route it with `crud.collection(...)` and `crud.item(...)`.
   - Otherwise write a route that calls `requireContext` or `requireWriter`.
4. **Page:** a server component under `src/app/(app)/…` using `getPageContext()`. Use `ResourceManager` for tables with add and edit, `ApiForm` for forms and `ActionButton` for one-click actions. Show feedback with `toast()`.
5. **Sidebar:** add the page in `src/components/shell/nav.ts`, and update `tests/unit/roles.test.ts`, which pins the menu per role.
6. **Pure logic** goes in `src/lib/domain/*.ts`, with a unit test.
7. **Docs:** update `docs/` and, if people use the feature, the team guide (`src/lib/content/team-guide.ts`).

## 8. Notifications, live updates, device alerts, offline

- **Notifications.** Database triggers write `notifications` (`notify_admins`, `notify_on_event`, and others). Each notification's `href` decides its kind (`src/lib/domain/notification-kind.ts`), and people choose which kinds they get.
- **Live updates.** `bump_activity` increments `org_activity.version` for a company. `LiveRefresh` listens through Supabase Realtime and refreshes the page.
- **Device alerts.** `src/lib/server/push.ts` sends Web Push without a message body (VAPID, signed by hand). The phone wakes up and asks `/api/notifications` what's new (`public/sw.js`). `dispatchPushes()` runs after each page render and in the daily job.
- **Offline.** `public/sw.js` caches pages and app files. `src/lib/offline-queue.ts` stores adds made offline and sends them when back online. Public pages (`/review/`, `/invoice/`) and `/api` are never cached.

## 9. Monthly clients

- A project has `kind` set to `one_time` or `monthly`.
- A monthly client has:
  - a package: `project_package_items`
  - months: `project_months`, opened by `open_project_month`
  - deliverables tied to a month: `tasks.month_id`, with `tasks.is_extra` for extras
- The project page (`src/app/(app)/projects/[id]/page.tsx`) shows one month at a time: `?month=<month id>`, defaulting to the current month. Under it are `MonthBar`, the month's deliverables by type, Extras and the Monthly package.
- Routes:
  - `POST /api/package-items` and `PATCH`/`DELETE /api/package-items/:id`
  - `POST /api/projects/:id/months` with `{ month: 'current' | 'next' | 'YYYY-MM' }`
  - `PATCH /api/project-months/:id` (close, reopen, note), and `DELETE` for admins only
- Creating a monthly project (`createProjectWithDeliverables` with `kind: 'monthly'`) saves the deliverables as the package and opens the current month.

## 10. Scheduled job

Vercel calls `/api/cron/daily` at 01:00 UTC (07:00 in Dhaka). It runs:
- `create_recurring_projects()`: opens the current month of every running monthly client, with its package's deliverables (`open_project_month`), once per month
- `remind_overdue_invoices()`: reminds admins about each overdue invoice, at most once a week
- `dispatchPushes()`

## 11. Tests and checks

```bash
npm run typecheck
npm test            # unit tests (tests/unit)
npm run test:db     # needs DATABASE_URL: runs tests/db/smoke.sql in a transaction that is rolled back
npm run test:e2e    # Playwright against E2E_BASE_URL (optional)
```

- On every push, GitHub runs typecheck, unit tests, a production build, and the database tests. For the database tests it applies all migrations to a fresh PostgreSQL, using `tests/db/supabase-stub.sql` for the parts Supabase normally provides.
- Merge to `main` only when those checks and the Vercel preview are green.
- The browser tests stay off until `E2E_BASE_URL`, `E2E_EMAIL` and `E2E_PASSWORD` point at a staging copy.

## 12. Deploying

- Work on a branch and push it. Vercel builds a preview, and GitHub runs the checks.
- When both are green, fast-forward `main`. Vercel deploys production, and the database update workflow applies any new migration.
- Rolling back the code: redeploy an earlier deployment in Vercel. Database updates are not rolled back automatically. Write a new migration that undoes the change.

## 13. Things to know

- **Login details.** Employee passwords are stored encrypted (`profile_credentials`, AES-GCM keyed from the service role key) so admins can read them back. Admin passwords are never stored. If the service role key changes, the stored passwords can no longer be read.
- **No file uploads.** Deliverables are shared as Drive or Dropbox links. The `task_files` table and the `deliverables` storage bucket exist from update 28 but are unused.
- **The owner account** is set in `platform_owners`. To add another owner, insert a row there with the SQL editor.
- **Branding:**
  - The sidebar shows the UniDock logo (`src/components/unidock-logo.tsx`) and the company's name.
  - The app icons (black and white U–D monogram) are `public/icons/ud-*.png`, `src/app/icon.png` and `src/app/apple-icon.png`.
  - The splash screen and sign-in page still use the 365 Frames logo.
  - Invoices use `public/logo-dark.png`.
- **Time zone.** Dates are shown in the company's time zone (`organizations.timezone`). Use `localDate` and `localDateTime` from the page context, never the server's clock.
