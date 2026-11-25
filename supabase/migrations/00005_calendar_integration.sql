-- Calendar integration: add provider columns to tutors and event tracking to lessons

alter table tutors
  add column calendar_provider text not null default 'none'
    check (calendar_provider in ('none', 'google', 'outlook')),
  add column calendar_tokens jsonb,
  add column calendar_id text;

alter table lessons
  add column calendar_event_id text;
