-- Entry and exit time for each attendance day.
alter table public.attendance
  add column check_in time,
  add column check_out time,
  add constraint attendance_exit_after_entry check (check_in is null or check_out is null or check_out > check_in);
