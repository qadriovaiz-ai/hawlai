import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// ------------------------------------------------------------------
// KNOWN GAP, deliberately not fixed here — decide on it separately.
// ------------------------------------------------------------------
// Every /api/* request currently pays TWO auth round-trips: this
// middleware calls supabase.auth.getUser(), and then the route handler
// calls it again. Excluding /api from the matcher below would halve
// that and take the middleware out of the API path entirely.
//
// It was NOT done, because it is a security change wearing a
// performance change's clothes. A handful of routes have no auth check
// of their own and rely on this middleware for it — /api/creative/video/models
// and /api/icon-library among them. Excluding /api wholesale would
// quietly make those public. Low sensitivity, but "quietly" is the
// problem.
//
// To do it properly: give those routes their own auth checks first,
// then narrow the matcher. Surfaced during the blank-dashboard
// investigation (2026-09-02), where the double round-trip was a
// contributing factor to how slow each queued request was.
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// OAuth CALLBACKS MUST BE EXCLUDED, and this was found in production
// rather than by any test.
// ------------------------------------------------------------------
// Third-party connect flows hand credentials back to a callback URL.
// Those requests do not carry our session cookie, so this middleware
// redirected them to /auth/login and the credential was lost:
//
//   WooCommerce was COMPLETELY BROKEN. Its store POSTs the consumer
//   key and secret server-to-server, with no browser and no cookie —
//   it got a 307 to the login page. The dealer would approve on their
//   own store, land back on Integrations still disconnected, and
//   nothing anywhere would say why.
//
//   Shopify happened to work, by luck rather than design. Its
//   callback is a browser redirect, so the dealer's own cookie
//   carried it through. It would still have failed for anyone who
//   approved in a different browser or a private window — and the
//   flow is not supposed to depend on a cookie surviving a
//   third-party redirect, which is exactly what the callback's own
//   comment claims.
//
// These routes do not need the middleware's session: each one
// authenticates itself. Shopify verifies an HMAC over the query
// string and matches a single-use nonce; WooCommerce matches a
// single-use nonce, which is all it can do since that flow has no
// app registration and therefore no shared secret.
//
// Listed INDIVIDUALLY on purpose. Excluding `api/integrations` as a
// prefix would silently unauthenticate every other integration route,
// which is the same mistake as the /api exclusion described above,
// just smaller.
//
// Both are anchored with `$`. Without it the lookahead matches on
// PREFIX, so a future /api/integrations/shopify/callback-verify would
// be silently excluded too — public without anyone choosing that. The
// existing image-extension alternative already uses `$` inside this
// same lookahead, so the syntax is known to survive Next's compile.
//
// WRITTEN OUT AS ONE LITERAL STRING, not composed from a constant.
// Next.js requires the matcher to be statically analysable at build
// time and IGNORES a value it cannot read — so building this from an
// array would not fail, it would silently stop matching and take the
// session refresh off every page. tests/middlewareMatcher.test.ts
// parses this literal and asserts the real behaviour.
// ------------------------------------------------------------------

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/integrations/woocommerce/callback$|api/integrations/shopify/callback$|privacy-policy|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
