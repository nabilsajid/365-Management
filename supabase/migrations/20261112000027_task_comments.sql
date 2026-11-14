-- Comments on tasks, with @mentions.

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

grant select, insert, delete on public.task_comments to authenticated;
revoke all on public.task_comments from anon;
alter table public.task_comments enable row level security;

create policy member_read on public.task_comments for select to authenticated
  using (org_id = public.current_org_id());
create policy member_insert on public.task_comments for insert to authenticated
  with check (org_id = public.current_org_id() and author_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_comments.task_id and t.org_id = task_comments.org_id));
create policy own_or_admin_delete on public.task_comments for delete to authenticated
  using (org_id = public.current_org_id() and (author_id = auth.uid() or public.is_admin()));

-- Tells the people mentioned with @Name (first name or nickname), and the
-- person the task is assigned to, that there is a new comment.
create function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_task record;
  v_author text;
begin
  select t.id, t.title, t.assignee_id into v_task from public.tasks t where t.id = new.task_id;
  select p.full_name into v_author from public.profiles p where p.id = new.author_id;

  insert into public.notifications (org_id, profile_id, title, body, href)
  select distinct new.org_id, p.id,
    case when mentioned then coalesce(v_author, 'Someone') || ' mentioned you' else 'New comment from ' || coalesce(v_author, 'someone') end,
    v_task.title || ': ' || left(new.body, 150),
    '/tasks/' || new.task_id
  from (
    select p.id, true as mentioned
    from public.profiles p
    where p.org_id = new.org_id and p.is_active
      and exists (
        select 1 from regexp_matches(new.body, '@([[:alnum:]_.-]+)', 'g') as m(token)
        where lower(m.token[1]) = lower(split_part(p.full_name, ' ', 1))
           or lower(m.token[1]) = lower(coalesce(p.nickname, ''))
      )
    union all
    select v_task.assignee_id, false where v_task.assignee_id is not null
  ) as targets(id, mentioned)
  join public.profiles p on p.id = targets.id
  where targets.id is distinct from new.author_id
    -- Someone both mentioned and assigned gets one notification, the mention.
    and (targets.mentioned or not exists (
      select 1 from regexp_matches(new.body, '@([[:alnum:]_.-]+)', 'g') as m(token)
      where lower(m.token[1]) = lower(split_part(p.full_name, ' ', 1)) or lower(m.token[1]) = lower(coalesce(p.nickname, ''))
    ));
  return new;
end $$;
create trigger task_comments_notify after insert on public.task_comments for each row execute function public.notify_task_comment();
create trigger task_comments_log_delete after delete on public.task_comments for each row execute function public.log_delete('task_id', 'tasks');
create trigger task_comments_bump_activity after insert or update or delete on public.task_comments for each row execute function public.bump_activity();
