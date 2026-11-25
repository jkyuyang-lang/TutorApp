-- Add superadmin role and app settings

-- 1. Expand role constraint to include 'superadmin'
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'parent', 'tutor', 'admin', 'superadmin'));

-- 2. App-wide settings (key-value)
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default: refund cutoff is 3 hours before lesson
INSERT INTO app_settings (key, value)
VALUES ('refund_period_hours', '3');

-- 3. RLS for app_settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings"
  ON app_settings FOR SELECT USING (true);

CREATE POLICY "Superadmin manages app settings"
  ON app_settings FOR ALL USING (get_my_role() = 'superadmin');

-- 4. Superadmin bypass policies (read/write all data)
-- Profiles
CREATE POLICY "Superadmin full access profiles"
  ON profiles FOR ALL USING (get_my_role() = 'superadmin');

-- Tutors
CREATE POLICY "Superadmin full access tutors"
  ON tutors FOR ALL USING (get_my_role() = 'superadmin');

-- Learners
CREATE POLICY "Superadmin full access learners"
  ON learners FOR ALL USING (get_my_role() = 'superadmin');

-- Lessons
CREATE POLICY "Superadmin full access lessons"
  ON lessons FOR ALL USING (get_my_role() = 'superadmin');

-- Payments
CREATE POLICY "Superadmin full access payments"
  ON payments FOR ALL USING (get_my_role() = 'superadmin');

-- Refunds
CREATE POLICY "Superadmin full access refunds"
  ON refunds FOR ALL USING (get_my_role() = 'superadmin');

-- Credits
CREATE POLICY "Superadmin full access credits"
  ON credits FOR ALL USING (get_my_role() = 'superadmin');

-- Conversations
CREATE POLICY "Superadmin full access conversations"
  ON conversations FOR ALL USING (get_my_role() = 'superadmin');

-- Messages
CREATE POLICY "Superadmin full access messages"
  ON messages FOR ALL USING (get_my_role() = 'superadmin');

-- Tutor clients
CREATE POLICY "Superadmin full access tutor_clients"
  ON tutor_clients FOR ALL USING (get_my_role() = 'superadmin');

-- Tutor subjects
CREATE POLICY "Superadmin full access tutor_subjects"
  ON tutor_subjects FOR ALL USING (get_my_role() = 'superadmin');

-- Availability
CREATE POLICY "Superadmin full access availability_rules"
  ON availability_rules FOR ALL USING (get_my_role() = 'superadmin');

-- Time off
CREATE POLICY "Superadmin full access time_off"
  ON time_off FOR ALL USING (get_my_role() = 'superadmin');

-- Lesson notes
CREATE POLICY "Superadmin full access lesson_notes"
  ON lesson_notes FOR ALL USING (get_my_role() = 'superadmin');

-- Private notes
CREATE POLICY "Superadmin full access private_notes"
  ON private_notes FOR ALL USING (get_my_role() = 'superadmin');

-- Goals
CREATE POLICY "Superadmin full access goals"
  ON goals FOR ALL USING (get_my_role() = 'superadmin');

-- Inquiries
CREATE POLICY "Superadmin full access inquiries"
  ON inquiries FOR ALL USING (get_my_role() = 'superadmin');

-- Notifications
CREATE POLICY "Superadmin full access notifications"
  ON notifications FOR ALL USING (get_my_role() = 'superadmin');

-- Notification prefs
CREATE POLICY "Superadmin full access notification_prefs"
  ON notification_prefs FOR ALL USING (get_my_role() = 'superadmin');

-- Subjects (already public read, add write for superadmin)
CREATE POLICY "Superadmin manages subjects"
  ON subjects FOR ALL USING (get_my_role() = 'superadmin');
