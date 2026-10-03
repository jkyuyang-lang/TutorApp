# Architecture Decisions

## 2026-10-02: Dedicated Supabase project
- Using a separate Supabase project (`lfynhpheltzgwlnjkmvp`) instead of sharing with the Service Design app.
- This avoids auth conflicts, shared email templates, and accidental data interference.
- All tables live in the `public` schema (no need for a separate `tutoring` schema since it's a dedicated project).

## 2026-10-02: No auth trigger on auth.users
- Profile creation happens during the onboarding flow, not via a database trigger.
- This keeps auth decoupled and avoids issues if the project is ever shared.

## 2026-10-02: Branded emails via Resend
- Using Resend with React Email templates for all transactional emails.
- Supabase's built-in email templates are left as defaults (only used for auth verification).

## 2026-10-02: Stripe direct merchant for MVP
- Tutor is the Stripe merchant (direct charges) in the MVP.
- `tutors.stripe_account_id` column exists for future Stripe Connect migration.

## 2026-10-02: Double-booking prevention via exclusion constraint
- Using `btree_gist` extension with an exclusion constraint on `lessons(tutor_id, tstzrange(starts_at, ends_at))`.
- Filtered to exclude canceled lessons. This is a database-level guarantee.

## 2026-10-02: Slot hold mechanism
- Lessons are created with `status='held'` and `hold_expires_at` set 10 minutes in the future.
- A cron job releases expired holds. Payment confirmation transitions to `status='confirmed'`.
