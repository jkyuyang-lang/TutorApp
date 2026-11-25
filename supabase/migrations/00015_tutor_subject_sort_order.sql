-- Add sort_order to tutor_subjects for drag-and-drop reordering
alter table tutor_subjects add column if not exists sort_order int not null default 0;

-- Backfill based on current created_at order per tutor
with numbered as (
  select id, row_number() over (partition by tutor_id order by created_at) - 1 as rn
  from tutor_subjects
)
update tutor_subjects set sort_order = numbered.rn
from numbered where tutor_subjects.id = numbered.id;
