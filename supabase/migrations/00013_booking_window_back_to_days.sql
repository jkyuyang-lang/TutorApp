-- Revert booking_window_hours back to booking_window_days (hours -> days)
alter table tutors rename column booking_window_hours to booking_window_days;
update tutors set booking_window_days = greatest(1, booking_window_days / 24);
alter table tutors alter column booking_window_days set default 60;
