-- Tutor applications table
create table if not exists tutor_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  college text not null,
  degree_level text not null,
  resume_url text not null,
  linkedin_url text,
  why_good_fit text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'needs_more_info', 'denied', 'onboarded')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Storage bucket for resumes
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', true)
on conflict (id) do nothing;

-- Allow anyone to upload to resumes bucket (public form)
create policy "Anyone can upload resumes"
  on storage.objects for insert
  with check (bucket_id = 'resumes');

-- Allow authenticated users to read resumes
create policy "Authenticated users can read resumes"
  on storage.objects for select
  using (bucket_id = 'resumes' and auth.role() = 'authenticated');

-- Allow public read for resumes (needed for admin to view)
create policy "Public can read resumes"
  on storage.objects for select
  using (bucket_id = 'resumes');

-- RLS
alter table tutor_applications enable row level security;

-- Only superadmin can read applications (via service key in API routes)
-- No RLS policies needed since we use service client
