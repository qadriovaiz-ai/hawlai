// Route-level smoke tests — OPEN_ITEMS item 0, parts 1 and 2.
//
// WHY THIS EXISTS. Four production failures shipped green:
//
//   1. 2026-09-02  redirect loop left the dashboard blank
//   2. 2026-09-03  buttonClasses was a client export called from
//                  thirteen server components — every one 500'd, for
//                  weeks, with 263 tests passing
//   3. 2026-09-04  both OAuth callbacks 307'd to /auth/login
//   4. 2026-09-04  both cron routes 307'd on every invocation; the
//                  event queue never drained and the daily autopilot
//                  never ran
//
// All four were runtime failures the compiler cannot see, and none was
// catchable by a unit test, because nothing in the repository ever
// EXECUTED a route. `next build` prerenders only static routes;
// everything behind auth is dynamic and never runs.
//
// TWO ASSERTIONS, and the second is the one people forget:
//   - nothing returns 5xx
//   - nothing redirects somewhere it should not
// Incident 4 was a 307, not a 500. A smoke test checking only for
// server errors would have passed it and taught us the wrong lesson
// twice.
//
// GET ONLY, ALWAYS. 255 API routes include destructive handlers;
// firing POST or DELETE at all of them to see what happens would be a
// worse idea than the bugs this catches. A route with no GET export
// answers 405, which is a pass — it proves the module loaded and the
// framework routed to it.

import { describe, it, expect } from "vitest";
import { collectRoutes, shouldSkip, isServiceRoleDependent, isStructuralMode, type Route } from "./routeInventory";
import fs from "fs";
import { SMOKE_BASE, SESSION_FILE } from "./globalSetup";

const routes = collectRoutes();

// TWO MODES, and the suite says which one it ran in.
//
// STRUCTURAL (no real Supabase project): placeholder credentials, so
// any route that queries the database before rendering will 500 —
// that is the fake host refusing a connection, not a defect. Those
// routes are exempted from the no-5xx assertion and ONLY those. A
// route that starts 500ing without being on the list still fails.
//
// FULL (real NEXT_PUBLIC_SUPABASE_URL): the exemption is ignored
// entirely and every route must be < 500.
//
// The distinction is stated in the output rather than buried, because
// "345 passed" means materially different things in the two modes.
const STRUCTURAL = isStructuralMode();
const exempt = (url: string) => STRUCTURAL && isServiceRoleDependent(url);

/** Public prefixes, mirroring PUBLIC_PATH_PREFIXES in the middleware. */
const PUBLIC_PREFIXES = ["/auth", "/p/", "/site/", "/collabs", "/affiliates", "/book/", "/report/", "/invite/", "/seo/", "/api/public/", "/api/admin/", "/admin-seed-knowledge", "/api/events/dispatch", "/api/autopilot/daily-run"];
const isPublic = (url: string) => url === "/" || PUBLIC_PREFIXES.some((p) => url.startsWith(p));

async function request(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${SMOKE_BASE}${url}`, {
    method: "GET",
    redirect: "manual",
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}

describe("part 1 — every route is reachable and nothing 5xx's", () => {
  const testable = routes.filter((r) => !shouldSkip(r.url));

  it("found a realistic number of routes", () => {
    // Vacuity guard. If the inventory ever returns nothing, every
    // assertion below would pass over an empty list.
    expect(testable.length).toBeGreaterThan(200);
  });

  it.each(testable.map((r) => [r.url, r] as [string, Route]))(
    "%s does not 5xx",
    async (_url, route) => {
      const { status } = await request(route.url);
      // THE CORE ASSERTION. A 404 on a dynamic route with a
      // placeholder id is expected and fine; a 500 never is —
      // except for a database-dependent route in structural mode,
      // where the database is deliberately not there.
      if (exempt(route.url)) {
        // Still assert it ANSWERED. A hang, a crash on module load,
        // or a connection refused is a defect in either mode.
        expect(status, `${route.file} did not respond`).toBeGreaterThan(0);
        return;
      }
      expect(status, `${route.file} returned ${status}`).toBeLessThan(500);
    },
    35_000
  );
});

describe("part 1b — routes redirect where they should, and nowhere else", () => {
  // Incident 4's shape: a correct-looking 307 to the wrong place.
  const protectedPages = routes.filter((r) => r.kind === "page" && !isPublic(r.url) && !shouldSkip(r.url));
  const publicPages = routes.filter((r) => r.kind === "page" && isPublic(r.url) && !r.dynamic && !shouldSkip(r.url));

  it("protected pages send a logged-out visitor to the login page", async () => {
    // Not merely "redirects somewhere" — to /auth/login specifically.
    // A redirect loop (incident 1) or a redirect to a page that
    // refuses the method (incident 4) both pass a looser check.
    const wrong: string[] = [];
    for (const route of protectedPages.slice(0, 40)) {
      const { status, location } = await request(route.url);
      if (status !== 307 && status !== 302) { wrong.push(`${route.url} → ${status}`); continue; }
      if (!location.includes("/auth/login")) wrong.push(`${route.url} → ${location}`);
    }
    expect(wrong, `unexpected redirect targets: ${wrong.join(", ")}`).toEqual([]);
  }, 120_000);

  it("public pages render for a logged-out visitor", async () => {
    // The buttonClasses class of bug: these RENDER, so a server-side
    // throw shows up here as a 500 rather than staying invisible.
    const broken: string[] = [];
    for (const route of publicPages) {
      if (exempt(route.url)) continue;
      const { status } = await request(route.url);
      if (status >= 400) broken.push(`${route.url} → ${status}`);
    }
    expect(broken, `public pages not rendering: ${broken.join(", ")}`).toEqual([]);
  }, 120_000);

  it("self-authenticating routes reach their own auth instead of being redirected", async () => {
    // Incident 4 exactly. These must NOT be 307'd — they authenticate
    // their own caller and can never present a session cookie.
    for (const url of ["/api/events/dispatch", "/api/autopilot/daily-run"]) {
      const { status, location } = await request(url);
      // The redirect check holds in BOTH modes — it is the whole
      // point, and needs no database.
      expect(location, `${url} was redirected to ${location}`).not.toContain("/auth/login");
      if (!exempt(url)) expect(status, `${url} returned ${status}`).toBeLessThan(500);
    }
  }, 60_000);
});

// ---------------------------------------------------------------
// PART 2 — rendering pages WITH a session.
// ---------------------------------------------------------------
// Needs a real Supabase session, which cannot be fabricated: it is a
// JWT signed by Supabase and verified on every request.
//
// globalSetup mints one per run by signing in as a dedicated CI test
// user (SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD against a real
// NEXT_PUBLIC_SUPABASE_URL). Credentials are the durable secret; the
// session itself is disposable and never stored.
//
// Without them this block SKIPS LOUDLY rather than passing. A silent
// pass would be the worst outcome available — it would report
// coverage of exactly the incident that started this.
function readSessionCookie(): string | undefined {
  // Written by globalSetup after a successful sign-in. Read from a
  // file rather than process.env because globalSetup runs in the main
  // process and tests run in workers.
  try {
    const value = fs.readFileSync(SESSION_FILE, "utf8").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}
const sessionCookie = readSessionCookie();

describe.skipIf(!sessionCookie)("part 2 — authenticated pages actually render", () => {
  const dashboardPages = collectRoutes().filter(
    (r) => r.kind === "page" && r.url.startsWith("/dashboard") && !r.dynamic && !shouldSkip(r.url)
  );

  it("every dashboard page renders without a server error", async () => {
    // THE INCIDENT-2 CHECK. Thirteen server components called a client
    // export and threw at render. Only executing the render finds it.
    const broken: string[] = [];
    const redirected: string[] = [];
    for (const route of dashboardPages) {
      const { status, location } = await request(route.url, { cookie: sessionCookie! });
      if (status >= 500) { broken.push(`${route.url} → ${status}`); continue; }
      // A redirect back to login means the cookie is stale, not that
      // the page is broken — say so rather than reporting a failure.
      if (location.includes("/auth/login")) {
        // Report ONCE with the reason, not 77 times with the same
        // guess appended. A wall of identical messages buries the one
        // fact that matters: the session was minted and rejected, so
        // this is a cookie problem, not 77 broken pages.
        redirected.push(route.url);
      }
    }
    // Two DIFFERENT failures, never merged. A 500 is a broken page; a
    // redirect to login is a session the app would not accept, which
    // says nothing about the page at all.
    expect(
      redirected.length,
      `the session was minted but REJECTED by the app — ${redirected.length}/${dashboardPages.length} pages redirected to login. This is a cookie problem, not a page problem.`
    ).toBe(0);
    expect(broken, `pages returning 5xx: ${broken.join(", ")}`).toEqual([]);
  }, 300_000);
});

describe("coverage is visible when it is absent", () => {
  it("reports which mode this run used", () => {
    if (STRUCTURAL) {
      console.warn(
        "\n  [smoke] STRUCTURAL MODE — no real Supabase project configured.\n" +
        "  Database-backed routes (storefront, public APIs, cron) were checked for a\n" +
        "  RESPONSE but not for correctness. Set NEXT_PUBLIC_SUPABASE_URL /\n" +
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY to a real project for full coverage.\n"
      );
    }
    expect(true).toBe(true);
  });

  it("says plainly whether authenticated rendering was covered", () => {
    if (!sessionCookie) {
      console.warn(
        "\n  [smoke] PART 2 DID NOT RUN — no CI test user configured.\n" +
        "  Authenticated page rendering is UNCOVERED. This is the gap that let\n" +
        "  thirteen dashboard pages 500 for weeks.\n" +
        "  Set SMOKE_USER_EMAIL, SMOKE_USER_PASSWORD and a real\n" +
        "  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to close it.\n"
      );
    }
    // Always passes. Its job is to make an absence visible in the
    // output rather than let it look like coverage.
    expect(true).toBe(true);
  });
});
