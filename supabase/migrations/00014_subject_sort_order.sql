-- Add sort_order columns for drag-and-drop reordering
alter table subjects add column category_sort_order int not null default 0;
alter table subjects add column sort_order int not null default 0;

-- Backfill: assign sort_order based on current alphabetical order
with numbered as (
  select id, row_number() over (partition by category order by name) - 1 as rn
  from subjects
)
update subjects set sort_order = numbered.rn
from numbered where subjects.id = numbered.id;

-- Backfill: assign category_sort_order based on alphabetical category order
with cat_order as (
  select distinct category, dense_rank() over (order by category nulls last) - 1 as rn
  from subjects
)
update subjects set category_sort_order = cat_order.rn
from cat_order where subjects.category is not distinct from cat_order.category;
