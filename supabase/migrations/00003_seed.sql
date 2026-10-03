-- Seed data: subjects catalog
-- Tutor and families are created through the app onboarding flow
-- This seeds the subject catalog which is shared across all tutors

insert into subjects (name, category) values
  ('Algebra', 'Mathematics'),
  ('Geometry', 'Mathematics'),
  ('Calculus', 'Mathematics'),
  ('Pre-Calculus', 'Mathematics'),
  ('Statistics', 'Mathematics'),
  ('Physics', 'Science'),
  ('Chemistry', 'Science'),
  ('Biology', 'Science'),
  ('English Literature', 'English'),
  ('Essay Writing', 'English'),
  ('Reading Comprehension', 'English'),
  ('Spanish', 'Languages'),
  ('French', 'Languages'),
  ('SAT Prep', 'Test Prep'),
  ('ACT Prep', 'Test Prep'),
  ('AP Calculus', 'Test Prep'),
  ('AP Physics', 'Test Prep'),
  ('Computer Science', 'STEM'),
  ('Python Programming', 'STEM')
on conflict (name) do nothing;
