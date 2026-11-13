-- What a trip was for: an existing project, an existing client, or a purpose
-- typed in by hand (a new meeting, anything not on the lists).
alter table public.expenses
  add column project_id uuid references public.projects (id) on delete set null,
  add column client_id uuid references public.clients (id) on delete set null,
  add column purpose text;
create index expenses_project_idx on public.expenses (project_id);
