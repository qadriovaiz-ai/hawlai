// Routes that carry their own credential must be reachable without a
// session. FOURTH OCCURRENCE of this bug class — hence a test.
//
// The recurring shape, four times now:
//
//   1. buttonClasses (2026-09-03) — different cause, same invisibility.
//   2. WooCommerce OAuth callback (2026-09-04) — server-to-server POST
//      from the merchant's store, 307'd to /auth/login. Credentials
//      never stored. Completely broken on arrival.
//   3. Shopify OAuth callback — survived only because a browser
//      redirect carries the user's own cookie.
//   4. /api/events/dispatch and /api/autopilot/daily-run — cron-driven,
//      bearer-secret authenticated, 307'd on EVERY invocation. The
//      event queue and agent_tasks never drained; the daily autopilot
//      never ran. Vercel counts a 3xx as a completed invocation, so
//      the cron dashboard reported success the whole time.
//
// Two different mechanisms produce this, and both are covered here:
//
//   - the MATCHER decides whether middleware runs at all
//     (tests/middlewareMatcher.test.ts)
//   - PUBLIC_PATH_PREFIXES decides whether a matched request is
//     redirected to /auth/login (this file)
//
// A route can be caught by either. Testing only the matcher would
// have missed occurrence 4 entirely.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { isPublicPath } from "@/lib/supabase/middleware";

/** Route files in HEAD that authenticate a caller themselves. */
function committedRouteFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "src/app/api"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return out.split("\n").filter((f) => f.endsWith("route.ts"));
}

function committedSource(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** A route's URL path, from its file path. */
function routePath(file: string): string {
  return file
    .replace(/^src\/app/, "")
    .replace(/\/route\.ts$/, "")
    // Dynamic segments become a representative value — the middleware
    // only does prefix matching, so any placeholder is faithful.
    .replace(/\[\.\.\.[^\]]+\]/g, "x")
    .replace(/\[[^\]]+\]/g, "x");
}

// Markers for "this route proves the caller's identity by itself".
// Header names vary (x-seed-secret, x-admin-secret, x-migrate-secret),
// which is exactly why an ad-hoc grep for one of them under-reports —
// that mistake was made while investigating occurrence 4.
const SELF_AUTH = /CRON_SECRET|x-seed-secret|x-admin-secret|x-migrate-secret|verifyMetaSignature|verifyRazorpaySignature|X-Hub-Signature|checkCallback|validateCallbackPayload/;

// Excluded from the matcher entirely, so middleware never runs and
// PUBLIC_PATH_PREFIXES is irrelevant to them. Kept explicit rather
// than inferred, so adding one is a deliberate act.
const MATCHER_EXCLUDED = [
  "/api/webhooks/",
  "/api/integrations/woocommerce/callback",
  "/api/integrations/shopify/callback",
];
const isMatcherExcluded = (p: string) => MATCHER_EXCLUDED.some((prefix) => p.startsWith(prefix));

describe("self-authenticating routes are reachable without a session", () => {
  const selfAuthRoutes = committedRouteFiles()
    .filter((file) => SELF_AUTH.test(committedSource(file)))
    .map(routePath);

  it("finds the known self-authenticating routes", () => {
    // Vacuity guard. If the detection regex ever stops matching, the
    // assertion below would pass over an empty list and this whole
    // file would silently stop protecting anything.
    expect(selfAuthRoutes.length).toBeGreaterThanOrEqual(5);
    expect(selfAuthRoutes).toContain("/api/events/dispatch");
    expect(selfAuthRoutes).toContain("/api/autopilot/daily-run");
  });

  it("EVERY self-authenticating route is public or matcher-excluded", () => {
    // THE LOAD-BEARING ONE. This is the assertion that would have
    // caught all three redirect incidents before deploy.
    const bounced = selfAuthRoutes.filter((p) => !isPublicPath(p) && !isMatcherExcluded(p));
    expect(bounced, `these authenticate their own caller but would be 307'd to /auth/login: ${bounced.join(", ")}`).toEqual([]);
  });

  it("the two cron routes specifically", () => {
    // Named explicitly because they are the ones that just broke, and
    // a future refactor of the detection regex must not quietly drop
    // them from the generic check above.
    expect(isPublicPath("/api/events/dispatch")).toBe(true);
    expect(isPublicPath("/api/autopilot/daily-run")).toBe(true);
  });
});

describe("the public list does not over-reach", () => {
  it("still protects the session-backed routes beside the cron one", () => {
    // /api/autopilot/ also holds content-queue and settings, which are
    // ordinary dashboard endpoints. Listing the DIRECTORY instead of
    // the exact path would have made both public — a worse bug than
    // the one being fixed, and an easy shortcut to reach for.
    expect(isPublicPath("/api/autopilot/content-queue")).toBe(false);
    expect(isPublicPath("/api/autopilot/settings")).toBe(false);
  });

  it("still protects ordinary dashboard and API routes", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/settings/integrations",
      "/api/settings/tracking",
      "/api/integrations/shopify",
      "/api/integrations/shopify/start",
      "/api/ads/adlaunch",
      "/api/events",
    ]) {
      expect(isPublicPath(path), `${path} must stay behind auth`).toBe(false);
    }
  });

  it("keeps the genuinely public surfaces public", () => {
    for (const path of ["/", "/auth/login", "/p/some-slug", "/site/some-slug", "/api/public/leads", "/book/abc", "/seo/x"]) {
      expect(isPublicPath(path), `${path} must stay public`).toBe(true);
    }
  });
});
