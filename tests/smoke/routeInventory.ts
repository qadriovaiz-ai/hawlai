// Every route the app serves, derived from the filesystem.
//
// Derived rather than listed, deliberately: a hand-maintained list
// would drift, and the routes most likely to break are exactly the
// ones nobody remembered to add. Incident 1 killed thirteen pages for
// weeks precisely because nothing enumerated them.

import fs from "fs";
import path from "path";

const APP_DIR = path.join(process.cwd(), "src", "app");

export type RouteKind = "page" | "api";
export type Route = { url: string; kind: RouteKind; file: string; dynamic: boolean };

/**
 * Value substituted for a dynamic segment like [id] or [slug].
 *
 * A VALID UUID, and that matters. It was "smoke-test-placeholder",
 * which is fine for a slug but not parseable as a uuid — so any route
 * querying a uuid column got a Postgres 22P02 and returned 500, and
 * the suite reported a defect that was purely an artefact of the
 * value I chose. A uuid is well-formed for uuid columns AND perfectly
 * acceptable as a slug, so it is strictly the better placeholder.
 *
 * Still obviously fake, and version 4 / variant 8 so it is valid
 * rather than merely uuid-shaped. Nothing should ever match it.
 */
const PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

function toUrl(relativeDir: string): string | null {
  const segments = relativeDir.split(path.sep).filter(Boolean);
  const out: string[] = [];

  for (const segment of segments) {
    // Route groups — organisational only, contribute no URL segment.
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    // Private folders are never routable.
    if (segment.startsWith("_")) return null;
    // Parallel and intercepting routes need a parent context to make
    // sense on their own; requesting them directly proves nothing.
    if (segment.startsWith("@") || segment.startsWith("(.)")) return null;

    if (segment.startsWith("[") && segment.endsWith("]")) {
      out.push(PLACEHOLDER);
      continue;
    }
    out.push(segment);
  }

  return "/" + out.join("/");
}

export function collectRoutes(dir: string = APP_DIR, relative = ""): Route[] {
  const routes: Route[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return routes;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      routes.push(...collectRoutes(path.join(dir, entry.name), path.join(relative, entry.name)));
      continue;
    }
    if (entry.name !== "page.tsx" && entry.name !== "route.ts") continue;

    const url = toUrl(relative);
    if (url === null) continue;

    routes.push({
      url: url === "" ? "/" : url,
      kind: entry.name === "page.tsx" ? "page" : "api",
      file: path.join("src", "app", relative, entry.name).split(path.sep).join("/"),
      dynamic: url.includes(PLACEHOLDER),
    });
  }

  return routes;
}

/**
 * Routes to skip, with a stated reason each.
 *
 * Kept short and justified. A skip list is where a smoke test quietly
 * stops covering the thing that breaks, so every entry has to earn its
 * place — "it was failing" is not a reason.
 */
export const SKIP: { url: string; why: string }[] = [
  {
    url: "/api/integrations/woocommerce/callback",
    why: "consumes a single-use nonce; a GET here is meaningless and the POST is a credential write",
  },
];

export function shouldSkip(url: string): string | null {
  return SKIP.find((s) => s.url === url)?.why ?? null;
}

/**
 * Routes that need the SERVICE ROLE KEY, not merely a database.
 *
 * This was originally called DB_DEPENDENT, and that name was wrong in
 * a way worth recording. Running the suite against a real, fully
 * migrated Supabase project produced exactly the same 14 failures as
 * running it against a placeholder host — which made no sense under
 * the "they need a database" theory. The actual error, once read
 * rather than assumed, was:
 *
 *   Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
 *
 * Every route here calls createServiceClient(): public storefront
 * pages that deliberately bypass RLS, the public API routes, and the
 * cron route. They throw at the client construction, before any query
 * is attempted, so a perfect database makes no difference to them.
 *
 * The distinction matters because it names what is actually needed to
 * close the gap — one more secret, not a schema.
 *
 * Consulted only in STRUCTURAL MODE. Set SMOKE_REAL_DB=1 with both a
 * real project AND a service role key and this list is ignored
 * entirely: every route must then be < 500.
 *
 * Deliberately a list rather than a pattern. A pattern would silently
 * absorb new routes; this makes each addition a visible decision, and
 * a route that starts 500ing WITHOUT being on it still fails.
 */
export const SERVICE_ROLE_DEPENDENT = [
  "/p/",
  "/site/",
  "/seo/",
  "/report/",
  "/api/public/collabs",
  "/api/public/products/",
  "/api/admin/website-fallback-audit",
  "/api/auth/instagram/callback",
  "/api/autopilot/daily-run",
];

export function isServiceRoleDependent(url: string): boolean {
  return SERVICE_ROLE_DEPENDENT.some((prefix) => url.startsWith(prefix));
}

/**
 * Whether this run lacks a real database behind it.
 *
 * An explicit OPT-IN to full mode, not host-sniffing. Sniffing for a
 * placeholder hostname was the first version and it was wrong: CI
 * already builds with `https://placeholder.supabase.co`, a different
 * placeholder from the one globalSetup substitutes, so the sniff would
 * have concluded "real database" in CI and failed the suite on routes
 * that cannot possibly work there.
 *
 * Defaulting to structural is also the safe direction. The failure of
 * a wrong guess here is either a red suite for no reason, or — worse —
 * silently claiming coverage the run did not have.
 */
export function isStructuralMode(): boolean {
  return process.env.SMOKE_REAL_DB !== "1";
}
