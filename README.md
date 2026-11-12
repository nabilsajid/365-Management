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
