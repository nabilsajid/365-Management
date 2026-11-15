-- Investors and their investments are managed in one place: deleting an investor
-- also removes the money recorded from them. One who has been paid back cannot
-- be deleted while those repayments exist.
alter table public.investments drop constraint if exists investments_investor_id_fkey;
alter table public.investments add constraint investments_investor_id_fkey
  foreign key (investor_id) references public.investors (id) on delete cascade;
