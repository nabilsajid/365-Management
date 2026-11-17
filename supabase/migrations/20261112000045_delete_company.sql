-- The owner can delete a whole company (never their own). Some records refuse
-- to be removed while others point at them (a client with projects, an account
-- with payments), so they are cleared in a safe order before the company itself.

create or replace function public.delete_company(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.investments where org_id = p_org;
  delete from public.expenses where org_id = p_org;
  delete from public.payments where org_id = p_org;
  delete from public.invoices where org_id = p_org;
  delete from public.projects where org_id = p_org;
  delete from public.investors where org_id = p_org;
  delete from public.clients where org_id = p_org;
  delete from public.accounts where org_id = p_org;
  delete from public.organizations where id = p_org;
end $$;
revoke all on function public.delete_company(uuid) from public, authenticated, anon;
