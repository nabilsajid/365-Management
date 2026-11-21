-- 1. A company that switched off Points & rewards records no points at all
--    (approved work used to add them quietly in the background).
-- 2. A monthly client's invoice for a month can be drafted at any time, for
--    example when a fee is set in the middle of the month.

create or replace function public.skip_points_when_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.organizations o
    where o.id = new.org_id
      and (coalesce(o.settings -> 'hidden_sections', '[]'::jsonb) ? 'points' or coalesce(o.settings -> 'hidden_sections', '[]'::jsonb) ? '/employees')
  ) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists point_entries_skip_when_off on public.point_entries;
create trigger point_entries_skip_when_off before insert on public.point_entries
for each row execute function public.skip_points_when_off();

-- Drafts one month's fee invoice for a monthly client (once), and returns it.
create or replace function public.draft_month_invoice(p_month uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_lines text;
  v_label text;
  v_invoice uuid;
begin
  select p.id as project_id, p.org_id, p.name, p.client_id, p.monthly_fee, m.id as month_id, m.month
    into r
  from public.project_months m join public.projects p on p.id = m.project_id
  where m.id = p_month;
  if r is null then raise exception 'Month not found' using errcode = 'P0002'; end if;
  if r.org_id <> public.current_org_id() or not (public.is_admin() or public.has_edit_segment('cashflow')) then
    raise exception 'Only an admin or someone who edits Cash Flow can make invoices' using errcode = '42501';
  end if;
  if r.client_id is null then raise exception 'Give this project a client first' using errcode = '23514'; end if;
  if r.monthly_fee is null then raise exception 'Set a monthly fee for this client first' using errcode = '23514'; end if;
  select id into v_invoice from public.invoices where project_month_id = p_month and not is_extras;
  if v_invoice is not null then return v_invoice; end if;

  select string_agg(
           case when t.quantity is null then t.label
                else t.quantity || ' ' || t.kind || case when t.quantity > 1 then 's' else '' end || coalesce(' (' || t.label || ')', '') end,
           ', ' order by t.position)
    into v_lines
  from public.project_targets t where t.project_id = r.project_id;
  v_label := 'Monthly package, ' || to_char(r.month, 'FMMonth YYYY') || coalesce(': ' || v_lines, '');
  insert into public.invoices (org_id, client_id, project_id, project_month_id, invoice_number, issue_date, due_date, amount, status, lines)
  values (r.org_id, r.client_id, r.project_id, r.month_id,
          'INV-' || to_char(r.month, 'YYYY-MM') || '-' || upper(left(md5(r.project_id::text), 4)),
          current_date, current_date + 14, r.monthly_fee, 'draft',
          jsonb_build_array(jsonb_build_object('description', v_label, 'quantity', 1, 'unit_price', r.monthly_fee)))
  returning id into v_invoice;
  return v_invoice;
end $$;
revoke all on function public.draft_month_invoice(uuid) from public, anon;
grant execute on function public.draft_month_invoice(uuid) to authenticated;
