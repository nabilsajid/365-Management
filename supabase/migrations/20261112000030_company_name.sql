-- The company name shown in the sidebar under the UniDock logo. This app holds
-- a single company (365 Frames); the name is set only when that is the case.
update public.organizations
set name = '365 Frames'
where name is distinct from '365 Frames'
  and (select count(*) from public.organizations) = 1;
