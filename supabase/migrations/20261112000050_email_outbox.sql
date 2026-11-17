-- No email leaves without approval. Every email (daily alerts, salary and
-- payment emails) is first saved here as a draft. Approvers (admins, and anyone
-- whose role has "emails") are told, can read and change the subject and
-- message, then send it or not. Only approved emails are sent.

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  to_profile_id uuid references public.profiles (id) on delete cascade,
  to_email text not null check (length(to_email) between 3 and 200),
  kind text not null default 'alert' check (kind in ('alert', 'salary', 'other')),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 20000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'rejected', 'failed')),
  error text,
  related_href text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_outbox_org_status_idx on public.email_outbox (org_id, status, created_at desc);

alter table public.email_outbox enable row level security;
grant select, update on public.email_outbox to authenticated;
-- Approvers read and decide. New drafts are only made by the server.
create policy approver_read on public.email_outbox for select to authenticated
  using (org_id = public.current_org_id() and (public.is_admin() or public.has_segment('emails')));
create policy approver_update on public.email_outbox for update to authenticated
  using (org_id = public.current_org_id() and (public.is_admin() or public.has_segment('emails')) and status in ('pending', 'failed'))
  with check (org_id = public.current_org_id() and (public.is_admin() or public.has_segment('emails')));

-- Tells admins and email approvers that drafts are waiting.
create or replace function public.notify_email_approvers(p_org uuid, p_count integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (org_id, profile_id, title, body, href)
  select distinct p_org, p.id,
         case when p_count = 1 then 'An email is waiting for approval' else p_count || ' emails are waiting for approval' end,
         'Check them and send or skip.', '/emails'
  from public.profiles p
  left join public.profile_roles pr on pr.profile_id = p.id
  left join public.roles r on r.id = pr.role_id
  where p.org_id = p_org and p.is_active and (p.access_role = 'admin' or 'emails' = any (r.permissions));
end $$;
revoke all on function public.notify_email_approvers(uuid, integer) from public, authenticated;

-- "Approve emails" is a new option on roles.
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles drop constraint if exists roles_edit_permissions_check;
alter table public.roles add constraint roles_permissions_check
  check (permissions <@ array['projects', 'equipment', 'costs', 'cashflow', 'team_points', 'bonuses', 'emails']);
alter table public.roles add constraint roles_edit_permissions_check
  check (edit_permissions <@ array['projects', 'equipment', 'costs', 'cashflow', 'team_points', 'bonuses', 'emails']);
