import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ------------------------------------------------------------------
// SELF-AUTHENTICATING ROUTES — routes that carry their own credential
// and must NOT be bounced to the login page.
// ------------------------------------------------------------------
// Hoisted out of updateSession and exported so it can be tested. It
// was inline, which meant the single decision behind FOUR production
// incidents had no test and no name.
//
// A route belongs here when it authenticates a caller that can never
// present a session cookie: a cron with a bearer secret, a webhook
// with a signature, a third party posting server-to-server. It does
// NOT belong here merely because it is an API route.
//
// The recurring failure is always the same shape: a route proves its
// own identity, nobody adds it here, and every call is 307'd to
// /auth/login. Because NextResponse.redirect defaults to 307 — which
// PRESERVES the method — a POST is replayed against a page component
// and comes back 405. That 405 is the visible symptom; the redirect
// is the bug.
const PUBLIC_PATH_PREFIXES = [
  "/auth",
  "/p/", // legacy storefront route (landing_pages table)
  "/site/", // current storefront route (websites/website_pages tables) — the one the Website Builder actually generates and publishes
  "/collabs",
  "/affiliates",
  "/admin-seed-knowledge", // page itself, protected by its own secret header, not user auth
  "/api/admin/", // API routes for the above (and similar) — also secret-header protected, not user-session protected
  "/api/public/",
  "/book/", // customer appointment booking, no account needed
  "/report/", // shareable client report links (get_report_links tool) — the client viewing it never has a Hawlai account
  "/invite/", // team invite acceptance — the invitee doesn't have an account yet when they click this
  "/seo/", // published SEO content pages, meant to be publicly indexed by Google
  "/api/auth/instagram/callback", // Instagram's OAuth redirect target — the browser lands here straight from instagram.com, same reasoning as every other public callback/redirect route above

  // Cron-driven, authenticated by `Authorization: Bearer $CRON_SECRET`
  // in the route itself. Added 2026-09-04 after production logs showed
  // both being redirected on every invocation.
  //
  // /api/events/dispatch is called by a Supabase pg_cron + pg_net job
  // every 2 minutes (migration 129). /api/autopilot/daily-run is called
  // by the two Vercel crons in vercel.json. Neither carries a cookie,
  // so both were 307'd to /auth/login on every single run — the event
  // queue and agent_tasks never drained, and the daily autopilot never
  // ran. Vercel counts a 3xx as a completed invocation, so the cron
  // dashboard reported success throughout.
  //
  // Listed as EXACT paths, not as "/api/autopilot/": that directory
  // also holds content-queue and settings, which are session-backed
  // dashboard endpoints and must stay protected.
  "/api/events/dispatch",
  "/api/autopilot/daily-run",
];

/**
 * Whether a path is reachable without a Hawlai session.
 *
 * Exported for tests — this is the predicate that decides whether a
 * request gets redirected to /auth/login.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[])  {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The list and the predicate live at module scope (top of this
  // file) so they can be tested. They were inline here, which meant
  // the single decision behind four production incidents had no test
  // and no name.
  const isPublic = isPublicPath(request.nextUrl.pathname);
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
