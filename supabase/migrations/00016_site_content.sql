-- Editable site content for the landing page
create table site_content (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS: anyone can read, only superadmin can write
alter table site_content enable row level security;

create policy "Anyone can read site_content"
  on site_content for select using (true);

create policy "Superadmin can manage site_content"
  on site_content for all using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
      and profiles.role = 'superadmin'
    )
  );
