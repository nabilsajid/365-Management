-- What appears on invoices (the logo, client details, dates and so on), chosen by
-- an admin. Missing keys mean "shown". An optional footer, such as payment details.
alter table public.organizations
  add column if not exists invoice_options jsonb not null default '{}'::jsonb;
