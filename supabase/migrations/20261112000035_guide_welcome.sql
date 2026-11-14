-- After a new person fills in their profile for the first time, a pop-up offers
-- the team guide once. guide_seen_at records that it was shown. People who had
-- already filled in their profile are counted as having seen it.

alter table public.profiles add column if not exists guide_seen_at timestamptz;
update public.profiles set guide_seen_at = now() where profile_completed_at is not null and guide_seen_at is null;

create or replace function public.mark_guide_seen() returns void
language sql security definer set search_path = public as $$
  update public.profiles set guide_seen_at = coalesce(guide_seen_at, now()) where id = auth.uid()
$$;
revoke all on function public.mark_guide_seen() from public, anon;
grant execute on function public.mark_guide_seen() to authenticated;
