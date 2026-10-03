-- Tutoring App: Core schema
-- All tables in public schema (dedicated Supabase project)

-- Extensions
create extension if not exists "btree_gist";
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'parent', 'tutor', 'admin')),
  full_name text not null,
  phone text,
  time_zone text not null default 'America/New_York',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TUTORS
-- ============================================================
create table tutors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references profiles(id) on delete cascade,
  bio text,
  credentials text,
  years_experience int,
  video_url text,
  meeting_link text,
  buffer_minutes int not null default 10,
  min_notice_hours int not null default 12,
  booking_window_days int not null default 60,
  max_lessons_per_day int,
  cancellation_policy jsonb not null default '{"full_refund_hours": 24, "partial_refund_pct": 50, "no_show_charge_pct": 100}'::jsonb,
  stripe_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SUBJECTS (shared catalog)
-- ============================================================
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TUTOR_SUBJECTS
-- ============================================================
create table tutor_subjects (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  levels text[] not null default '{}',
  format text not null default 'online' check (format in ('online', 'in_person', 'both')),
  durations int[] not null default '{60}',
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tutor_id, subject_id)
);

-- ============================================================
-- LEARNERS
-- ============================================================
create table learners (
  id uuid primary key default gen_random_uuid(),
  account_holder_id uuid not null references profiles(id) on delete cascade,
  is_self boolean not null default false,
  full_name text not null,
  grade_level text,
  school text,
  notes text,
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TUTOR_CLIENTS
-- ============================================================
create table tutor_clients (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  account_holder_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'archived')),
  custom_rate jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tutor_id, account_holder_id)
);

-- ============================================================
-- AVAILABILITY_RULES (weekly recurring)
-- ============================================================
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  format text not null default 'online' check (format in ('online', 'in_person', 'both')),
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

-- ============================================================
-- TIME_OFF
-- ============================================================
create table time_off (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

-- ============================================================
-- LESSONS
-- ============================================================
create table lessons (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  booked_by uuid not null references profiles(id),
  subject_id uuid not null references subjects(id),
  tutor_subject_id uuid references tutor_subjects(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  format text not null default 'online' check (format in ('online', 'in_person')),
  status text not null default 'held' check (status in ('held', 'confirmed', 'completed', 'canceled', 'no_show', 'late_cancel')),
  hold_expires_at timestamptz,
  focus_notes text,
  meeting_link text,
  canceled_by uuid references profiles(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent double-booking per tutor (exclude canceled lessons)
  exclude using gist (
    tutor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('canceled', 'late_cancel'))
);

create index idx_lessons_tutor_starts on lessons(tutor_id, starts_at);
create index idx_lessons_learner on lessons(learner_id);
create index idx_lessons_booked_by on lessons(booked_by);
create index idx_lessons_status on lessons(status);

-- ============================================================
-- LESSON_NOTES (shared with family)
-- ============================================================
create table lesson_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid unique not null references lessons(id) on delete cascade,
  tutor_id uuid not null references tutors(id) on delete cascade,
  covered text,
  homework text,
  next_steps text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PRIVATE_NOTES (tutor only)
-- ============================================================
create table private_notes (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- GOALS
-- ============================================================
create table goals (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  tutor_id uuid not null references tutors(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  title text not null,
  description text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'met')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  payer_id uuid not null references profiles(id),
  tutor_id uuid not null references tutors(id),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  created_at timestamptz not null default now()
);

create index idx_payments_lesson on payments(lesson_id);
create index idx_payments_payer on payments(payer_id);

-- ============================================================
-- REFUNDS
-- ============================================================
create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  stripe_refund_id text unique,
  amount_cents int not null,
  reason text,
  policy_applied jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CREDITS
-- ============================================================
create table credits (
  id uuid primary key default gen_random_uuid(),
  account_holder_id uuid not null references profiles(id) on delete cascade,
  tutor_id uuid not null references tutors(id),
  amount_cents int not null,
  reason text,
  lesson_id uuid references lessons(id),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
create table conversations (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  account_holder_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tutor_id, account_holder_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text not null,
  attachments jsonb default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id, created_at);

-- ============================================================
-- INQUIRIES
-- ============================================================
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references tutors(id) on delete cascade,
  name text not null,
  email text not null,
  learner_grade text,
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'replied', 'converted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, created_at desc);

-- ============================================================
-- NOTIFICATION_PREFS
-- ============================================================
create table notification_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  event_type text not null,
  email boolean not null default true,
  push boolean not null default true,
  sms boolean not null default false,
  unique(user_id, event_type)
);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger trg_profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger trg_tutors_updated_at before update on tutors for each row execute function set_updated_at();
create trigger trg_tutor_subjects_updated_at before update on tutor_subjects for each row execute function set_updated_at();
create trigger trg_learners_updated_at before update on learners for each row execute function set_updated_at();
create trigger trg_tutor_clients_updated_at before update on tutor_clients for each row execute function set_updated_at();
create trigger trg_lesson_notes_updated_at before update on lesson_notes for each row execute function set_updated_at();
create trigger trg_private_notes_updated_at before update on private_notes for each row execute function set_updated_at();
create trigger trg_goals_updated_at before update on goals for each row execute function set_updated_at();
create trigger trg_conversations_updated_at before update on conversations for each row execute function set_updated_at();
create trigger trg_inquiries_updated_at before update on inquiries for each row execute function set_updated_at();
create trigger trg_lessons_updated_at before update on lessons for each row execute function set_updated_at();
