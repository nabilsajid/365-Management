-- 1. When a project was finished: set when it becomes Completed or Hidden,
--    cleared if it is reopened. Shown as a month on the hidden projects list.
-- 2. Company details: trade licence number and a logo.
-- 3. Profile photos. Both images are small pictures stored as data, kept in
--    their own tables so ordinary lists of people stay light.

alter table public.projects add column if not exists finished_at timestamptz;
update public.projects set finished_at = now() where status in ('completed', 'archived') and finished_at is null;

create or replace function public.project_finished_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status in ('completed', 'archived') then
    if new.finished_at is null or (tg_op = 'UPDATE' and old.status not in ('completed', 'archived')) then
      new.finished_at := now();
    end if;
  else
    new.finished_at := null;
  end if;
  return new;
end $$;
create trigger projects_finished_at before insert or update of status on public.projects
for each row execute function public.project_finished_at();

alter table public.organizations add column if not exists trade_license text check (trade_license is null or length(trade_license) <= 80);

create table public.org_logos (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  data text not null check (data like 'data:image/%' and length(data) <= 400000),
  updated_at timestamptz not null default now()
);
alter table public.org_logos enable row level security;
grant select, insert, update, delete on public.org_logos to authenticated;
create policy member_read on public.org_logos for select to authenticated using (org_id = public.current_org_id());
create policy admin_all on public.org_logos for all to authenticated
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

create table public.profile_photos (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  data text not null check (data like 'data:image/%' and length(data) <= 300000),
  updated_at timestamptz not null default now()
);
create index profile_photos_org_idx on public.profile_photos (org_id);
alter table public.profile_photos enable row level security;
grant select, insert, update, delete on public.profile_photos to authenticated;
-- Everyone in the company sees the photos; each person changes only their own (admins anyone's).
create policy member_read on public.profile_photos for select to authenticated using (org_id = public.current_org_id());
create policy own_write on public.profile_photos for all to authenticated
  using (org_id = public.current_org_id() and (profile_id = auth.uid() or public.is_admin()))
  with check (org_id = public.current_org_id() and (profile_id = auth.uid() or public.is_admin()));
