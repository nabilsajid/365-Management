-- Itemised invoices: an invoice can list lines (what, how many, price each).
-- The monthly fee invoice gets one line for the package; an "extras" invoice
-- lists what was delivered beyond it. A monthly client remembers its prices for extras.

alter table public.invoices
  add column if not exists lines jsonb check (lines is null or jsonb_typeof(lines) = 'array'),
  add column if not exists is_extras boolean not null default false;
-- Only the fixed-fee invoice is tied one-to-one to a month; extras invoices name the month too.
alter table public.invoices drop constraint if exists invoices_project_month_id_key;
create unique index if not exists invoices_one_fee_per_month on public.invoices (project_month_id) where not is_extras;
alter table public.projects add column if not exists extra_rates jsonb not null default '{}'::jsonb;

create or replace function public.draft_monthly_invoices() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
  v_lines text;
  v_label text;
begin
  for r in
    select p.id as project_id, p.org_id, p.name, p.client_id, p.monthly_fee, m.id as month_id, m.month
    from public.projects p
    join public.organizations o on o.id = p.org_id
    join public.project_months m on m.project_id = p.id
      and m.month = date_trunc('month', (now() at time zone o.timezone))::date
    where p.kind = 'monthly' and p.status in ('onboarding', 'active') and p.monthly_fee is not null and p.client_id is not null
      and not exists (select 1 from public.invoices i where i.project_month_id = m.id and not i.is_extras)
  loop
    select string_agg(
             case when t.quantity is null then t.label
                  else t.quantity || ' ' || t.kind || case when t.quantity > 1 then 's' else '' end || coalesce(' (' || t.label || ')', '') end,
             ', ' order by t.position)
      into v_lines
    from public.project_targets t where t.project_id = r.project_id;
    v_label := 'Monthly package, ' || to_char(r.month, 'FMMonth YYYY') || coalesce(': ' || v_lines, '');
    insert into public.invoices (org_id, client_id, project_id, project_month_id, invoice_number, issue_date, due_date, amount, status, notes, lines)
    values (r.org_id, r.client_id, r.project_id, r.month_id,
            'INV-' || to_char(r.month, 'YYYY-MM') || '-' || upper(left(md5(r.project_id::text), 4)),
            r.month, r.month + 14, r.monthly_fee, 'draft', null,
            jsonb_build_array(jsonb_build_object('description', v_label, 'quantity', 1, 'unit_price', r.monthly_fee)));
    perform public.notify_admins(r.org_id, 'Invoice drafted: ' || r.name, to_char(r.month, 'FMMonth YYYY') || ' · check it and mark it sent', '/cashflow?tab=income');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.draft_monthly_invoices() from public, authenticated;
