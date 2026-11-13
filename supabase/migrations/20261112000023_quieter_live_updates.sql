-- Fewer needless reloads. Marking a notification as read, or recording that it
-- was pushed to a device, no longer makes everyone's open app reload its data.
-- Only a new notification does.
drop trigger notifications_bump_activity on public.notifications;
create trigger notifications_bump_activity
after insert on public.notifications
for each row execute function public.bump_activity();
