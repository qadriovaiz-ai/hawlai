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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|privacy-policy|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
