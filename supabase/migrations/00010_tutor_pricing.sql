-- Move durations and pricing to tutor level
alter table tutors
  add column if not exists hourly_rate numeric,
  add column if not exists session_durations int[] not null default '{60}';
