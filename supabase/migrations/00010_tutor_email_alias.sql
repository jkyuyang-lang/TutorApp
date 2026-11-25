-- Add email alias for per-tutor sender addresses
-- e.g. "jane" means emails come from jane@yourdomain.com
ALTER TABLE tutors ADD COLUMN email_alias text;
