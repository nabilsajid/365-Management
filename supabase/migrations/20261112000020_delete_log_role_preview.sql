-- Two admin tools: a log of what was deleted in the last 3 days, and a way for
-- an admin to look at the app as another role.

-- 1. Delete log ---------------------------------------------------------------

create table public.delete_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null,
  record_id text,
  label text,
  data jsonb not null,
  deleted_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index delete_log_org_idx on public.delete_log (org_id, deleted_at desc);

grant select, delete on public.delete_log to authenticated;
revoke all on public.delete_log from anon;
alter table public.delete_log enable row level security;

-- Admins see the last 3 days and can clear the log.
create policy admin_read on public.delete_log for select to authenticated
  using (org_id = public.current_org_id() and public.is_admin() and deleted_at > now() - interval '3 days');
create policy admin_clear on public.delete_log for delete to authenticated
  using (org_id = public.current_org_id() and public.is_admin());

-- Records what was deleted and by whom. Rows removed only because their parent
-- was deleted (a project's deliverables, say) are not listed one by one.
create function public.log_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(old);
  v_org uuid := nullif(v_row ->> 'org_id', '')::uuid;
  v_who uuid := auth.uid();
  v_gone boolean := false;
begin
  if v_org is null then return old; end if;
  if not exists (select 1 from public.organizations where id = v_org) then return old; end if;
  -- The trigger names the record's parent (column, table). If the parent has
  -- just been deleted, this row went with it and is not listed separately.
  if tg_nargs = 2 and (v_row ->> tg_argv[0]) is not null then
    execute format('select not exists (select 1 from public.%I where id = $1)', tg_argv[1])
      into v_gone using (v_row ->> tg_argv[0])::uuid;
    if v_gone then return old; end if;
  end if;
  if v_who is not null and not exists (select 1 from public.profiles where id = v_who) then v_who := null; end if;

  delete from public.delete_log where deleted_at < now() - interval '3 days';
  insert into public.delete_log (org_id, table_name, record_id, label, data, deleted_by)
  values (
    v_org,
    tg_table_name,
    v_row ->> 'id',
    left(coalesce(v_row ->> 'name', v_row ->> 'title', v_row ->> 'item_name', v_row ->> 'full_name',
                  v_row ->> 'invoice_number', v_row ->> 'description', v_row ->> 'message',
                  v_row ->> 'reason', v_row ->> 'body', v_row ->> 'work_date'), 120),
    v_row,
    v_who
  );
  return old;
end $$;

do $$
declare
  t text;
  -- table, then (for records that belong to another) the column and table of the parent
  parents constant jsonb := '{
    "tasks": ["project_id", "projects"],
    "task_submissions": ["task_id", "tasks"],
    "project_comments": ["project_id", "projects"],
    "payments": ["invoice_id", "invoices"],
    "attendance": ["employee_id", "profiles"],
    "point_entries": ["employee_id", "profiles"],
    "bonuses": ["employee_id", "profiles"]
  }';
begin
  foreach t in array array[
    'profiles', 'clients', 'projects', 'tasks', 'task_submissions', 'accounts', 'invoices', 'payments',
    'fixed_expenses', 'expenses', 'equipment', 'equipment_needs', 'violation_types', 'attendance',
    'point_entries', 'bonuses', 'roles', 'broadcasts', 'notices', 'project_comments'
  ] loop
    if parents ? t then
      execute format(
        'create trigger %I after delete on public.%I for each row execute function public.log_delete(%L, %L)',
        t || '_log_delete', t, parents -> t ->> 0, parents -> t ->> 1);
    else
      execute format('create trigger %I after delete on public.%I for each row execute function public.log_delete()', t || '_log_delete', t);
    end if;
  end loop;
end $$;

-- 2. Viewing the app as another role ---------------------------------------------

-- While an admin has a row here, the database treats them as holding only that
-- role: they see and can do exactly what the role allows, nothing more.
create table public.role_previews (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  started_at timestamptz not null default now()
);
grant select on public.role_previews to authenticated;
revoke all on public.role_previews from anon;
alter table public.role_previews enable row level security;
create policy own_read on public.role_previews for select to authenticated
  using (profile_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and access_role = 'admin'
  ) and not exists (select 1 from public.role_previews where profile_id = auth.uid())
$$;

create or replace function public.has_segment(p_segment text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.role_previews v join public.roles r on r.id = v.role_id
      where v.profile_id = auth.uid() and p_segment = any (r.permissions)
    )
    or (
      not exists (select 1 from public.role_previews where profile_id = auth.uid())
      and exists (
        select 1
        from public.profile_roles pr
        join public.roles r on r.id = pr.role_id
        join public.profiles p on p.id = pr.profile_id
        where pr.profile_id = auth.uid() and p.is_active and p_segment = any (r.permissions)
      )
    )
$$;

create or replace function public.has_edit_segment(p_segment text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.role_previews v join public.roles r on r.id = v.role_id
      where v.profile_id = auth.uid() and p_segment = any (r.edit_permissions)
    )
    or (
      not exists (select 1 from public.role_previews where profile_id = auth.uid())
      and exists (
        select 1
        from public.profile_roles pr
        join public.roles r on r.id = pr.role_id
        join public.profiles p on p.id = pr.profile_id
        where pr.profile_id = auth.uid() and p.is_active and p_segment = any (r.edit_permissions)
      )
    )
$$;

-- Only a real admin can start a preview, and only of a role that is not Admin.
create function public.start_role_preview(p_role uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active and access_role = 'admin') then
    raise exception 'Only an admin can view the app as another role' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.roles r join public.profiles p on p.org_id = r.org_id
    where r.id = p_role and p.id = auth.uid() and not r.is_admin
  ) then
    raise exception 'Choose a role other than Admin' using errcode = '22023';
  end if;
  insert into public.role_previews (profile_id, role_id) values (auth.uid(), p_role)
  on conflict (profile_id) do update set role_id = excluded.role_id, started_at = now();
end $$;

-- Always available, so an admin can never get stuck in a preview.
create function public.stop_role_preview() returns void
language sql security definer set search_path = public as $$
  delete from public.role_previews where profile_id = auth.uid()
$$;

grant execute on function public.start_role_preview(uuid), public.stop_role_preview() to authenticated;
