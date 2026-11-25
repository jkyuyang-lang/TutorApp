-- RLS Policies for all tables
-- Helper: get current user's profile
create or replace function get_my_profile_id()
returns uuid as $$
  select id from profiles where user_id = auth.uid()
$$ language sql security definer stable;

create or replace function get_my_role()
returns text as $$
  select role from profiles where user_id = auth.uid()
$$ language sql security definer stable;

create or replace function get_my_tutor_id()
returns uuid as $$
  select t.id from tutors t join profiles p on t.profile_id = p.id where p.user_id = auth.uid()
$$ language sql security definer stable;

-- ============================================================
-- PROFILES
-- ============================================================
alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select using (user_id = auth.uid());

create policy "Users can update own profile"
  on profiles for update using (user_id = auth.uid());

create policy "Users can insert own profile"
  on profiles for insert with check (user_id = auth.uid());

create policy "Tutors can read client profiles"
  on profiles for select using (
    id in (
      select tc.account_holder_id from tutor_clients tc where tc.tutor_id = get_my_tutor_id()
    )
  );

create policy "Clients can read tutor profiles"
  on profiles for select using (
    id in (
      select t.profile_id from tutors t
      join tutor_clients tc on tc.tutor_id = t.id
      where tc.account_holder_id = get_my_profile_id()
    )
  );

-- ============================================================
-- TUTORS
-- ============================================================
alter table tutors enable row level security;

create policy "Anyone can read tutor profiles"
  on tutors for select using (true);

create policy "Tutor can update own record"
  on tutors for update using (profile_id = get_my_profile_id());

create policy "Tutor can insert own record"
  on tutors for insert with check (profile_id = get_my_profile_id());

-- ============================================================
-- SUBJECTS
-- ============================================================
alter table subjects enable row level security;

create policy "Anyone can read subjects"
  on subjects for select using (true);

-- ============================================================
-- TUTOR_SUBJECTS
-- ============================================================
alter table tutor_subjects enable row level security;

create policy "Anyone can read active tutor subjects"
  on tutor_subjects for select using (true);

create policy "Tutor manages own subjects"
  on tutor_subjects for insert with check (tutor_id = get_my_tutor_id());

create policy "Tutor updates own subjects"
  on tutor_subjects for update using (tutor_id = get_my_tutor_id());

create policy "Tutor deletes own subjects"
  on tutor_subjects for delete using (tutor_id = get_my_tutor_id());

-- ============================================================
-- LEARNERS
-- ============================================================
alter table learners enable row level security;

create policy "Account holder manages own learners"
  on learners for select using (account_holder_id = get_my_profile_id());

create policy "Account holder inserts learners"
  on learners for insert with check (account_holder_id = get_my_profile_id());

create policy "Account holder updates learners"
  on learners for update using (account_holder_id = get_my_profile_id());

create policy "Account holder deletes learners"
  on learners for delete using (account_holder_id = get_my_profile_id());

create policy "Tutor can read assigned learners"
  on learners for select using (
    account_holder_id in (
      select tc.account_holder_id from tutor_clients tc where tc.tutor_id = get_my_tutor_id()
    )
  );

-- ============================================================
-- TUTOR_CLIENTS
-- ============================================================
alter table tutor_clients enable row level security;

create policy "Tutor manages own clients"
  on tutor_clients for all using (tutor_id = get_my_tutor_id());

create policy "Client can read own client record"
  on tutor_clients for select using (account_holder_id = get_my_profile_id());

-- ============================================================
-- AVAILABILITY_RULES
-- ============================================================
alter table availability_rules enable row level security;

create policy "Anyone can read availability"
  on availability_rules for select using (true);

create policy "Tutor manages own availability"
  on availability_rules for insert with check (tutor_id = get_my_tutor_id());

create policy "Tutor updates own availability"
  on availability_rules for update using (tutor_id = get_my_tutor_id());

create policy "Tutor deletes own availability"
  on availability_rules for delete using (tutor_id = get_my_tutor_id());

-- ============================================================
-- TIME_OFF
-- ============================================================
alter table time_off enable row level security;

create policy "Tutor manages own time off"
  on time_off for all using (tutor_id = get_my_tutor_id());

create policy "Authenticated can read time off for slot calc"
  on time_off for select using (true);

-- ============================================================
-- LESSONS
-- ============================================================
alter table lessons enable row level security;

create policy "Booker can read own lessons"
  on lessons for select using (booked_by = get_my_profile_id());

create policy "Tutor can read assigned lessons"
  on lessons for select using (tutor_id = get_my_tutor_id());

create policy "Authenticated can insert lessons (booking)"
  on lessons for insert with check (booked_by = get_my_profile_id());

create policy "Booker can update own lessons"
  on lessons for update using (booked_by = get_my_profile_id());

create policy "Tutor can update assigned lessons"
  on lessons for update using (tutor_id = get_my_tutor_id());

create policy "Tutor can delete assigned lessons"
  on lessons for delete using (tutor_id = get_my_tutor_id());

-- Parent can see lessons for linked learners
create policy "Parent sees linked learner lessons"
  on lessons for select using (
    learner_id in (
      select l.id from learners l where l.account_holder_id = get_my_profile_id()
    )
  );

-- ============================================================
-- LESSON_NOTES
-- ============================================================
alter table lesson_notes enable row level security;

create policy "Tutor manages own lesson notes"
  on lesson_notes for all using (tutor_id = get_my_tutor_id());

create policy "Client can read published notes for own lessons"
  on lesson_notes for select using (
    status = 'published' and
    lesson_id in (
      select ls.id from lessons ls where ls.booked_by = get_my_profile_id()
    )
  );

create policy "Parent reads published notes for linked learners"
  on lesson_notes for select using (
    status = 'published' and
    lesson_id in (
      select ls.id from lessons ls
      join learners lr on ls.learner_id = lr.id
      where lr.account_holder_id = get_my_profile_id()
    )
  );

-- ============================================================
-- PRIVATE_NOTES (tutor only!)
-- ============================================================
alter table private_notes enable row level security;

create policy "Tutor manages own private notes"
  on private_notes for all using (tutor_id = get_my_tutor_id());

-- ============================================================
-- GOALS
-- ============================================================
alter table goals enable row level security;

create policy "Tutor manages goals"
  on goals for all using (tutor_id = get_my_tutor_id());

create policy "Client reads own learner goals"
  on goals for select using (
    learner_id in (
      select l.id from learners l where l.account_holder_id = get_my_profile_id()
    )
  );

-- ============================================================
-- PAYMENTS
-- ============================================================
alter table payments enable row level security;

create policy "Payer reads own payments"
  on payments for select using (payer_id = get_my_profile_id());

create policy "Tutor reads own payments"
  on payments for select using (tutor_id = get_my_tutor_id());

create policy "Authenticated inserts payments"
  on payments for insert with check (payer_id = get_my_profile_id());

-- ============================================================
-- REFUNDS
-- ============================================================
alter table refunds enable row level security;

create policy "Payer reads own refunds"
  on refunds for select using (
    payment_id in (
      select p.id from payments p where p.payer_id = get_my_profile_id()
    )
  );

create policy "Tutor reads own refunds"
  on refunds for select using (
    payment_id in (
      select p.id from payments p where p.tutor_id = get_my_tutor_id()
    )
  );

-- ============================================================
-- CREDITS
-- ============================================================
alter table credits enable row level security;

create policy "Account holder reads own credits"
  on credits for select using (account_holder_id = get_my_profile_id());

create policy "Tutor reads own credits"
  on credits for select using (tutor_id = get_my_tutor_id());

-- ============================================================
-- CONVERSATIONS
-- ============================================================
alter table conversations enable row level security;

create policy "Participant reads own conversations"
  on conversations for select using (
    account_holder_id = get_my_profile_id() or tutor_id = get_my_tutor_id()
  );

create policy "Authenticated creates conversations"
  on conversations for insert with check (
    account_holder_id = get_my_profile_id() or tutor_id = get_my_tutor_id()
  );

-- Parent can see conversations for their minor children
create policy "Parent sees minor child conversations"
  on conversations for select using (
    account_holder_id in (
      select l.account_holder_id from learners l
      where l.account_holder_id = get_my_profile_id()
    )
  );

-- ============================================================
-- MESSAGES
-- ============================================================
alter table messages enable row level security;

create policy "Conversation participants read messages"
  on messages for select using (
    conversation_id in (
      select c.id from conversations c
      where c.account_holder_id = get_my_profile_id() or c.tutor_id = get_my_tutor_id()
    )
  );

create policy "Participant sends messages"
  on messages for insert with check (
    sender_id = get_my_profile_id() and
    conversation_id in (
      select c.id from conversations c
      where c.account_holder_id = get_my_profile_id() or c.tutor_id = get_my_tutor_id()
    )
  );

create policy "Sender can update own messages (read receipt)"
  on messages for update using (
    conversation_id in (
      select c.id from conversations c
      where c.account_holder_id = get_my_profile_id() or c.tutor_id = get_my_tutor_id()
    )
  );

-- ============================================================
-- INQUIRIES
-- ============================================================
alter table inquiries enable row level security;

create policy "Anyone can insert inquiries"
  on inquiries for insert with check (true);

create policy "Tutor reads own inquiries"
  on inquiries for select using (tutor_id = get_my_tutor_id());

create policy "Tutor updates own inquiries"
  on inquiries for update using (tutor_id = get_my_tutor_id());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
alter table notifications enable row level security;

create policy "User reads own notifications"
  on notifications for select using (user_id = auth.uid());

create policy "User updates own notifications"
  on notifications for update using (user_id = auth.uid());

-- ============================================================
-- NOTIFICATION_PREFS
-- ============================================================
alter table notification_prefs enable row level security;

create policy "User manages own prefs"
  on notification_prefs for all using (user_id = auth.uid());
