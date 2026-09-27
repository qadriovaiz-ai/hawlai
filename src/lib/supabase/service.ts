import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. This client holds the service-role key and bypasses RLS
// entirely, so an accidental import from a client component would ship it
// to a browser. Next's `import "server-only"` would catch that at build
// time, but that package isn't a dependency here — so this throws on
// evaluation in a browser instead, and a test asserts no client file
// imports it.
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/service is server-only — it holds the service-role key and must never be imported into a client bundle.");
}

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
