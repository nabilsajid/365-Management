-- Organizing projects whose scope differs from client to client.
--
-- Each deliverable has a type, a thumbnail can be tied to its video, and a
-- project records whether its shoot is still waiting for the client.

alter table public.tasks
  add column kind text not null default 'other'
    check (kind in ('shoot', 'video', 'thumbnail', 'graphic', 'other')),
  add column for_task_id uuid references public.tasks (id) on delete set null;
create index tasks_for_task_idx on public.tasks (for_task_id);

alter table public.projects
  add column shoot_status text not null default 'none'
    check (shoot_status in ('none', 'waiting', 'confirmed')),
  add column shoot_date date;
