-- Add rescheduled_to column to link canceled lessons to their replacement
alter table lessons add column rescheduled_to uuid references lessons(id);
create index idx_lessons_rescheduled_to on lessons(rescheduled_to) where rescheduled_to is not null;
