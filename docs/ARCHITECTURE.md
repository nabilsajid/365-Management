# Architecture

This document describes the foundation as built. New work should follow it, and update it when a convention changes.

## Scope

Five connected modules and nothing else:

1. **Projects & Clients**: client onboarding, project briefs, one task per deliverable, submissions, admin review
2. **Logistics & Costs**: equipment inventory and who holds it, fixed monthly expenses, transport expenses per trip
3. **Cash Flow & Invoices**: accounts, invoices, payments, expenses, balances and outstanding dues
4. **Employees & Rewards**: profiles with visible job roles, attendance, monthly points, deductions, bonuses
5. **Admin Dashboard**: combined financial and operational overview and pending approvals

## Stack

- Next.js App Router with TypeScript. Pages are server components that read from Supabase directly; all writes go through API routes.
- Supabase Postgres with row level security, and Supabase Auth (email and password).
- zod for request validation.
- Node's built-in test runner (through `tsx`) for tests.
- Tailwind CSS v4 for styling, with the design tokens in `src/app/globals.css`. Lucide for icons, Recharts for charts.

## Interface

- Design tokens (colours, radii, font) are defined once in the `@theme` block of `src/app/globals.css` and used as Tailwind utilities such as `bg-primary`, `text-muted` and `border-line`.
- `src/components/ui/` holds small shadcn-style building blocks written into the project: `Card`, `Badge`, `Progress`, `EmptyState`.
- `src/components/shell/` holds the application shell: the collapsible sidebar, the mobile drawer and the top bar (`app-shell.tsx`), and the navigation list (`nav.ts`). Add a page to the sidebar by adding it to `nav.ts`, with `segment` or `adminOnly` if not everyone may open it.
- The data pages (tables and forms from `ResourceManager`) are styled by the shared classes in the `@layer components` block of `globals.css`. They are due to move onto the `ui` components page by page.
- The dashboard's calculations are pure functions in `src/lib/domain/dashboard.ts`.

## Layout

```
docs/                     this documentation
supabase/migrations/      schema, triggers, views, row level security (applied in filename order)
scripts/                  seed-demo.ts, test-db.mjs
tests/unit/               unit and route tests (no database)
tests/db/smoke.sql        database checks, run inside a rolled-back transaction
src/
  middleware.ts           refreshes the session, redirects signed-out visitors to /login
  types/database.ts       row types for every table and view
  lib/
    domain/               pure business rules, no I/O (points, deliverables, submissions)
    validation.ts         zod schemas for every API input
    api/
      http.ts             JSON responses, body parsing, database error mapping
      crud.ts             generic collection and item handlers with the permission checks
      resources.ts        one configuration per table for those handlers
      context.ts          resolves the signed-in user and profile
    services/             multi-step operations (project onboarding, monthly summary, dashboard)
    supabase/             server, browser and service-role clients
    page.ts, format.ts    helpers for pages
  components/             ResourceManager (table with add, edit, delete), ApiForm, ActionButton, onboarding form
    ui/                   Card, Badge, Progress, EmptyState
    shell/                sidebar, top bar, navigation list
    dashboard/            cash flow chart
  app/
    (app)/                signed-in pages: dashboard, broadcasts, projects, tasks, my-tasks, logistics, cashflow, employees, approvals, requests, roles
    api/                  route handlers
    login/, auth/signout/
```

## Permissions

Access is decided by **roles**, which work as tags. An admin creates roles, chooses which segments each role can see, and gives a person any number of roles. A person sees the union of their roles' segments.

| Segment | What it opens |
| --- | --- |
| `projects` | All projects, clients, tasks and submissions |
| `equipment` | The whole equipment inventory |
| `costs` | Fixed monthly expenses and transport expenses |
| `cashflow` | Accounts, invoices, payments and all expenses |
| `team_points` | Everyone's attendance, points and deductions |
| `bonuses` | Everyone's bonuses |

- Without any segment a person still sees what is theirs: tasks assigned to them (and the project those belong to), equipment they hold, and their own attendance, points and bonuses. They can submit work for their tasks and mark their own attendance.
- A segment lets its holders **see** that part and **propose changes** to it. A proposed change is not applied: it is stored as a change request, and an admin approves it (the change is applied) or denies it (nothing happens). Only admins change data directly.
- A few things are open to everyone because they are requests, not edits: submitting work for your own task, marking your own attendance, sending a broadcast, and adding an item to the urgently-needed equipment list (which `equipment` roles then manage directly).
- A role flagged `is_admin` (the built-in "Admin" role) can see and edit everything. It cannot be deleted, and an admin cannot remove it from themselves.
- `profiles.access_role` and `profiles.job_title` are derived: the database keeps them in step with the roles a person holds (admin access if any role is an admin role; the role names joined as the visible title).

Permissions are enforced in three places, from the list in `src/lib/domain/roles.ts`:

1. **Database:** row level security in `20261112000006_roles.sql` uses `has_segment()`. This is the real boundary and also covers server components, which query Supabase as the signed-in user.
2. **API:** `authorize()` and `authorizeWrite()` in `src/lib/api/crud.ts`. Each resource declares `read` as `member`, `admin` or a list of segments, `write` (admin by default) and `propose` (the segments whose holders may suggest changes).
3. **Interface:** the sidebar (`src/components/shell/nav.ts`) and each page hide what the viewer's roles do not include. The dashboard is one page that draws different cards and sections per viewer.

The service-role key bypasses row level security. It is used only for inviting employees and for the demo seed.

## Change requests

When a non-admin with the right segment creates, edits or deletes something, the API validates the input as usual and then stores `{ method, path, body, summary }` in `change_requests` and answers `202` instead of touching the data (`proposeChange()` in `crud.ts`; hand-written routes use `requireWriter()`).

An admin decides each request on the Approvals page. Approving replays the stored request against the same API route as the admin (`src/app/api/change-requests/[id]/route.ts`), so it passes through exactly the same validation and rules as a change made by hand. Only the data routes listed in `src/lib/domain/changes.ts` can be replayed; roles, people, point rules and approvals themselves can never be changed this way. If the change can no longer be applied (for example the record was deleted meanwhile), the request stays pending and the admin sees why.

The requester follows their requests on the My Requests page. The sidebar shows a count beside Approvals (admins) or My Requests (everyone else).

## Theme and responsiveness

- Light and dark themes share one set of tokens in `src/app/globals.css`; `:root[data-theme='dark']` overrides their values. The toggle in the top bar sets `data-theme` on `<html>` and remembers the choice on the device; a small inline script in the root layout applies it before first paint. With nothing saved, the device setting is used.
- Use tokens (`bg-card`, `text-muted`, `border-line`, `bg-subtle`), never fixed colours, so both themes keep working.
- Hosting region: `vercel.json` runs the server functions in Singapore (`sin1`), the same region as the Supabase database. Every page makes several database calls, so hosting far from the database (Vercel's default is the US east coast) adds seconds. If the database ever moves, change this to match.
- The organization's name and timezone are read together with the signed-in profile (`primeOrg` in `src/lib/services/rewards.ts`), so pages do not make a separate call for them.
- Speed: `getApiContext` is wrapped in React's `cache`, so the layout and page share one lookup per request, and the user id comes from the verified session claims instead of a call to the auth server. Use `npm run build` and `npm start` to judge real speed; `npm run dev` compiles each page on first visit.
- `src/app/(app)/loading.tsx` shows a skeleton the moment a link is tapped. After a save, forms close immediately and the table dims while fresh rows load (`useTransition` in `ResourceManager`).
- The dashboard summary is a bento grid (`.bento`, `.tile` in `globals.css`). Tones (`tone-green`, `tone-yellow`, `tone-red`) wash a tile lightly with a colour; the points tile picks its tone with `pointsTone()` in `src/lib/domain/tone.ts`.
- Motion is kept short and marks things that matter: numbers count up once, a saved row flashes, approvals confirm with a tick, an approved task shows a completed banner, and the points tile glows the first time the monthly target is reached. All of it is switched off by the system's reduced-motion setting.
- Touch screens get larger hit areas and 16px inputs (`@media (pointer: coarse)`).

## Rules that live in the database

These must hold no matter how data is written, so they are triggers and constraints rather than application code. See [DATA_MODEL.md](DATA_MODEL.md).

- An expense marked as an equipment purchase creates an inventory record, with or without a price.
- Submitting and reviewing work moves the task's status.
- Verified attendance and approved tasks create point entries; undoing either removes them.
- Bonuses are calculated by `calculate_bonuses()` and start as pending.

The pure functions in `src/lib/domain/` mirror the points rules for display (projected bonus, distance to target).

## Conventions

- Every table has `org_id`. Every query filters by it, and the API always sets it from the signed-in profile, never from the request body.
- Money is `numeric(14,2)` in BDT. Dates are `date`; months are stored as the first day of the month.
- Month boundaries use the organization's timezone (`organizations.timezone`, default `Asia/Dhaka`).
- API responses are `{ "data": ... }` on success and `{ "error": { "message", "details" } }` on failure.

## Adding to a module

For a new table with plain create, read, update and delete:

1. Add a migration with the table, `org_id`, indexes, and row level security policies.
2. Add its row type to `src/types/database.ts` and its schemas to `src/lib/validation.ts`.
3. Add a config to `src/lib/api/resources.ts`.
4. Add `src/app/api/<name>/route.ts` and `src/app/api/<name>/[id]/route.ts` that export the handlers from `crud.collection(config)` and `crud.item(config)`.
5. Show it on a page with `ResourceManager`.
6. Add tests: a unit test for any new rule, and a check in `tests/db/smoke.sql` for any new trigger or policy.

Anything that takes more than one write goes in `src/lib/services/` with a hand-written route.

## Not built yet

Deliberately left out of the foundation: reporting and exports, file uploads (submissions are links or text), notifications, payroll, automatic generation of monthly fixed-expense entries, equipment custody history, and linking equipment to projects.
