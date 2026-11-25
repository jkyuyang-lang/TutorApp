-- Rename booking_window_days to booking_window_hours and convert values (days -> hours)
alter table tutors rename column booking_window_days to booking_window_hours;
alter table tutors alter column booking_window_hours set default 1440;
update tutors set booking_window_hours = booking_window_hours * 24;
