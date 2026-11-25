-- Add unique slug for public tutor URLs
alter table tutors
  add column if not exists slug text unique;

-- Backfill slugs from profile names
update tutors t
set slug = lower(regexp_replace(p.full_name, '[^a-zA-Z0-9]+', '-', 'g'))
from profiles p
where p.id = t.profile_id
  and t.slug is null;
