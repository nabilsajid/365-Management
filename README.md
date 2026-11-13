# 365 Management

Internal web app for the studio: projects and clients, logistics and costs, cash flow and invoices, employees and rewards, and an admin dashboard.

Built with Next.js (App Router, TypeScript) and Supabase (Postgres, Auth, row level security).

## Setup

1. Install dependencies: `npm install`
2. Create a Supabase project, then apply the SQL files in `supabase/migrations/` in filename order. Either run `supabase db push` with the Supabase CLI, or paste each file into the SQL editor.
3. Copy `.env.example` to `.env.local` and fill it in.
4. Create the demo organization, its admin user and the demo employees in `scripts/demo-team.json`: `npm run seed:demo`
5. Start the app: `npm run dev`, then sign in at http://localhost:3000 with the demo user.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit and route tests (no database needed) |
| `npm run test:db` | Database checks for triggers, views and row level security (needs `psql` and `DATABASE_URL`) |
| `npm run seed:demo` | Create the single demo organization and admin user |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organized and how to extend it
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, views and the automatic behaviours in the database
- [docs/POINTS_AND_BONUSES.md](docs/POINTS_AND_BONUSES.md): the monthly points rules
- [docs/API.md](docs/API.md): API routes and who may call them

## Installing it as an app

The site can be installed like an app, with its own icon and window and no browser bars:

- **Android (Chrome):** open the site, tap the menu, then "Install app" or "Add to Home screen".
- **iPhone or iPad (Safari):** open the site, tap Share, then "Add to Home Screen".
- **Computer (Chrome or Edge):** click "Install app" in the top bar, or the install icon in the address bar.

The login page also has an "Install the app" button. The installed app and the website are the same live system, so they always show the same data.

It is the same site underneath, so it always shows live data and updates itself whenever a new version is deployed. It needs an internet connection; without one it shows an offline page. The pieces are `src/app/manifest.ts`, the icons in `public/icons`, `public/sw.js` and `public/offline.html`.

