-- The email account a company's alerts are sent from (for example a Gmail with
-- an app password). Set by an admin in Settings → Reminders. Nobody can read it
-- back through the app: there is no read access at all, only the server (with the
-- service key) uses it, and the password is stored encrypted.

create table public.org_mail_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail', 'outlook', 'custom')),
  host text not null check (length(host) between 3 and 200),
  port integer not null check (port in (465, 587)),
  username text not null check (length(username) between 3 and 200),
  from_name text check (from_name is null or length(from_name) <= 80),
  password_encrypted text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.org_mail_settings enable row level security;
revoke all on public.org_mail_settings from anon, authenticated;
