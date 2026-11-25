-- Add phone carrier for SMS via email-to-SMS gateway
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_carrier text;
