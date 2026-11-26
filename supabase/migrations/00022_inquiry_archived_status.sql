-- Add 'archived' status to inquiries
ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_status_check
  CHECK (status IN ('new', 'replied', 'converted', 'closed', 'archived'));

-- Allow tutors and superadmins to delete inquiries
CREATE POLICY "Tutor deletes own inquiries"
  ON inquiries FOR DELETE USING (tutor_id = get_my_tutor_id());

CREATE POLICY "Superadmin deletes inquiries"
  ON inquiries FOR DELETE USING (get_my_role() = 'superadmin');
