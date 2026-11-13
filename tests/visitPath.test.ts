// Which page the visitor was on — V1, and the privacy rule of the
// whole Organic Visitor Engine.
//
// THE CHEAPEST FAULT IN THE AUDIT. `/api/public/track` already received
// enough to know the page, but the slug it gets is the SITE's:
// PageTracker mounts in `/site/[slug]/layout.tsx`, so the home page, the
// about page and a product page all wrote the same value. "Did they look
// at pricing twice" was not unmeasured — it was unrecordable, while the
// information arrived and was dropped.
//
// AND THE PATH IS NEVER A URL. A query string is where personal data
// reaches analytics: unsubscribe tokens, an email in a shared link, a
// session id. The stripping runs in the browser AND again on the server,
// because one of those is a convenience and the other is the guarantee.
//
// Source assertions here slice to the function first and check the slice
// is real before anchoring — the habit the owner asked for on
// 2026-11-12.

import { describe, it, expect } from "vitest";
import { visitPath, PATH_CHARS } from "@/lib/utils";
import { code, sql, sourceWithComments } from "./helpers/source";

const ROUTE = "src/app/api/public/track/route.ts";
const MIGRATION = "supabase/migrations/228_page_events_path.sql";

/** One function's body, so an assertion cannot wander into another. */
function bodyOf(path: string, name: string): string {
  const src = code(path);
  const at = src.indexOf(`export function ${name}(`);
  expect(at, `${name} is not exported from ${path}`).toBeGreaterThan(-1);
  const rest = src.slice(at + 1);
  const next = rest.indexOf("\nexport ");
  const body = next > -1 ? rest.slice(0, next) : rest;
  expect(body.length, `${name}'s slice is empty`).toBeGreaterThan(100);
  return body;
}

describe("1. A QUERY STRING NEVER REACHES THE TABLE", () => {
  it("IT IS CUT, AND SO IS A FRAGMENT", () => {
    // THE LOAD-BEARING ONE. Everything else in V1 is a convenience; this
    // is the reason the column can exist at all.
    expect(visitPath("/site/a-shop/thanks?email=x@y.com")).toBe("/site/a-shop/thanks");
    expect(visitPath("/site/a-shop/thanks#section")).toBe("/site/a-shop/thanks");
  });

  it("AND WHICHEVER COMES FIRST IS WHERE IT CUTS", () => {
    // "?a=1#b" and "#b?a=1" must both lose everything after the first
    // mark. Cutting on one and then the other leaves the earlier one in.
    expect(visitPath("/p/x?a=1#b")).toBe("/p/x");
    expect(visitPath("/p/x#b?a=1")).toBe("/p/x");
  });

  it("A TOKEN IN A LINK IS GONE, not merely shortened", () => {
    const out = visitPath("/unsubscribe/abc123def456?token=secret&email=someone@example.com");
    expect(out).toBe("/unsubscribe/abc123def456");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("@");
  });

  it("the path is capped", () => {
    const long = "/" + "a".repeat(PATH_CHARS + 500);
    expect(visitPath(long)!.length).toBe(PATH_CHARS);
  });
});

describe("2. NOT KNOWING IS NOT '/'", () => {
  it("NOTHING IN MEANS NULL OUT", () => {
    // The column is nullable for exactly this: "we did not record the
    // page" and "the visitor was on the home page" are different facts,
    // the same distinction daysSinceChange and webhook_deliveries keep.
    expect(visitPath(null)).toBeNull();
    expect(visitPath(undefined)).toBeNull();
    expect(visitPath("")).toBeNull();
    expect(visitPath("   ")).toBeNull();
  });

  it("AND SO DOES ANYTHING THAT IS NOT A PATH", () => {
    // A full URL would carry the host and, worse, whatever follows it.
    expect(visitPath("https://example.com/a?b=c")).toBeNull();
    expect(visitPath("example.com/a")).toBeNull();
    expect(visitPath("?a=1")).toBeNull();
    expect(visitPath("javascript:alert(1)")).toBeNull();
  });

  it("a real path survives unchanged", () => {
    expect(visitPath("/site/a-shop/products/123")).toBe("/site/a-shop/products/123");
    expect(visitPath("/")).toBe("/");
  });
});

describe("3. THE BROWSER IS THE CONVENIENCE, THE SERVER IS THE GUARANTEE", () => {
  it("THE ROUTE RE-APPLIES THE RULE to whatever it receives", () => {
    // A caller that posts "/thanks?email=x@y.com" straight to the route
    // must not be able to store it.
    const src = code(ROUTE);
    expect(src).toMatch(/path: visitPath\(/);
  });

  it("AND IT DOES NOT TRUST THE TYPE EITHER", () => {
    const src = code(ROUTE);
    expect(src).toMatch(/typeof path === "string" \? path : null/);
  });

  it("THE CLIENT SENDS A PATH, NOT A URL", () => {
    const tracker = bodyOf("src/lib/utils.ts", "trackEvent");
    expect(tracker).toMatch(/visitPath\(window\.location\.pathname\)/);
    // location.href would carry the query string to a server that then
    // has to be trusted to remove it.
    expect(tracker).not.toMatch(/location\.href/);
  });

  it("and it is sent whether or not the visitor consented", () => {
    // A page is a fact about the SITE. Counting visits per page is the
    // same aggregate operation as counting visits per post, and tying
    // either to a person still needs visitorId, which stays gated.
    const tracker = bodyOf("src/lib/utils.ts", "trackEvent");
    const pathLine = tracker.slice(tracker.indexOf("path:"), tracker.indexOf("path:") + 120);
    expect(pathLine).not.toMatch(/consented/);
  });
});

describe("4. A FORM BEGUN IS A FACT", () => {
  it("form_start IS AN EVENT THE ROUTE ACCEPTS", () => {
    expect(code(ROUTE)).toMatch(/"form_start"/);
  });

  it("THE FORM FIRES IT ONCE, not once per keystroke", () => {
    const form = code("src/components/website/LandingLeadForm.tsx");
    expect(form).toMatch(/if \(started\) return;/);
    expect(form).toMatch(/trackEvent\(slug, "form_start"/);
  });

  it("AND EVERY FIELD COUNTS AS A START", () => {
    // A visitor who types only a phone number has started just as much
    // as one who types a name.
    const form = code("src/components/website/LandingLeadForm.tsx");
    expect((form.match(/noteStart\(\);/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("5. THE MIGRATION", () => {
  it("THE COLUMN IS NULLABLE", () => {
    const m = sql(MIGRATION);
    expect(m).toMatch(/add column if not exists path text;/);
    expect(m).not.toMatch(/path text not null/);
  });

  it("AND IT SHIPS THE QUERY THAT WOULD CATCH A LEAK", () => {
    // A count of rows containing "?" that expects zero, always. If the
    // stripping ever fails on both sides, this is how it is found.
    const withComments = sourceWithComments(MIGRATION);
    expect(withComments).toMatch(/where path like '%\?%'/);
    expect(withComments).toMatch(/Expected: 0, ALWAYS/);
  });

  it("and it is indexed for the two questions V2 and V3 ask", () => {
    expect(sql(MIGRATION)).toMatch(/create index if not exists idx_page_events_path on page_events\(dealership_id, path\)/);
  });
});
