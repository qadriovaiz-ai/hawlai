import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — for server-to-server contexts ONLY
 * (e.g. webhooks from Meta/Google Ads where there is no logged-in user/cookie session).
 *
 * This client BYPASSES Row Level Security. Never expose it to the browser,
 * never import it in client components, and never return its results
 * directly without checking dealership_id matches the intended target.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in environment variables
 * (Vercel → Settings → Environment Variables). This key is secret —
 * it must NOT have the NEXT_PUBLIC_ prefix.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
