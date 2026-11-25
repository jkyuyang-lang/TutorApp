-- Add meeting_platform to tutors (zoom = static link, google_meet = auto-generate, jitsi = auto-generate)
alter table tutors add column if not exists meeting_platform text check (meeting_platform in ('zoom', 'google_meet', 'jitsi'));
