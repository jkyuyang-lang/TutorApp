-- Inquiry message thread
CREATE TABLE inquiry_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('inquirer', 'tutor')),
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inquiry_messages_inquiry ON inquiry_messages(inquiry_id, created_at);

-- RLS
ALTER TABLE inquiry_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tutor reads own inquiry messages"
  ON inquiry_messages FOR SELECT USING (
    inquiry_id IN (SELECT id FROM inquiries WHERE tutor_id = get_my_tutor_id())
  );

CREATE POLICY "Superadmin reads all inquiry messages"
  ON inquiry_messages FOR SELECT USING (get_my_role() = 'superadmin');

CREATE POLICY "Tutor inserts own inquiry messages"
  ON inquiry_messages FOR INSERT WITH CHECK (
    inquiry_id IN (SELECT id FROM inquiries WHERE tutor_id = get_my_tutor_id())
  );

CREATE POLICY "Superadmin inserts inquiry messages"
  ON inquiry_messages FOR INSERT WITH CHECK (get_my_role() = 'superadmin');

CREATE POLICY "Tutor deletes own inquiry messages"
  ON inquiry_messages FOR DELETE USING (
    inquiry_id IN (SELECT id FROM inquiries WHERE tutor_id = get_my_tutor_id())
  );

CREATE POLICY "Superadmin deletes inquiry messages"
  ON inquiry_messages FOR DELETE USING (get_my_role() = 'superadmin');

-- Backfill: create an initial message for each existing inquiry
INSERT INTO inquiry_messages (inquiry_id, sender_type, sender_name, content, created_at)
SELECT id, 'inquirer', name, message, created_at
FROM inquiries;
