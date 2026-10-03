import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side admin operations.
 * Bypasses RLS — use only in API routes / cron / webhooks.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
