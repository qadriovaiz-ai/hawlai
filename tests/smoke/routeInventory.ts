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

/** Placeholder for a dynamic segment. Deliberately obviously fake. */
const PLACEHOLDER = "smoke-test-placeholder";

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
 * Routes that CANNOT return 2xx without a real database, because they
 * query Supabase before rendering anything.
 *
 * This list is only consulted in STRUCTURAL MODE — when the smoke run
 * has no real Supabase project and is using placeholder credentials.
 * There, a 500 from these is the fake database refusing a connection,
 * not a defect, and asserting otherwise would fail the suite for a
 * reason that has nothing to do with the code.
 *
 * Point real credentials at the run (NEXT_PUBLIC_SUPABASE_URL) and
 * this list is IGNORED ENTIRELY — every route must then be < 500.
 *
 * It is deliberately a list rather than a pattern. A pattern would
 * silently absorb new routes; this makes each addition a visible
 * decision, and a route that starts 500ing WITHOUT being on it still
 * fails the suite.
 */
export const DB_DEPENDENT = [
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

export function isDbDependent(url: string): boolean {
  return DB_DEPENDENT.some((prefix) => url.startsWith(prefix));
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
