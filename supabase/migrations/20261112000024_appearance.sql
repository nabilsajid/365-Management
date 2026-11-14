-- How the app looks for everyone in the company, chosen by an admin:
-- accent colour, corner style and the background glow.
-- Empty means the built-in look. Admins already have update rights on their
-- own organization; nothing else changes.
alter table public.organizations
  add column appearance jsonb not null default '{}'::jsonb;
