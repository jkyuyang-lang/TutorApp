-- Consolidate 'student' and 'parent' roles into 'client'

-- 1. Update existing rows
UPDATE profiles SET role = 'client' WHERE role IN ('student', 'parent');

-- 2. Update the constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client', 'tutor', 'admin', 'superadmin'));
