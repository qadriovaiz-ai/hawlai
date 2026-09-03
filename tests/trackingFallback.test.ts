// Landing-page tracking falls back to the business-level config — A0.
//
// Migration 153 moved tracking config to the business level and kept
// landing_pages.meta_pixel_id as a per-page OVERRIDE. The override was
// never implemented as one: /p/[slug] read only page.*, so a business
// that set its pixel in Settings → Integrations got tracking on its
// storefront and NOTHING on its landing pages.
//
// Verified against production on 2026-09-04 before fixing: zero pages
// had an override and zero businesses had a pixel set, so nothing was
// broken yet. The first dealer to configure one would have hit it.
//
// Source-level assertions, labelled as such: /p/[slug] is a server
// component over Supabase with a dozen other queries, and the property
// worth pinning is narrow — the join must fetch the dealership's
// tracking columns, and the render must prefer page over dealership
// rather than ignoring one of them.

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// Read from HEAD, not disk — a working-tree read is what let a broken
// commit ship green once already this week.
const PAGE = "src/app/p/[slug]/page.tsx";

describe("business-level fallback", () => {
  const source = committed(PAGE);

  it("joins the dealership's tracking columns", () => {
    // Without these in the select, the fallback below silently reads
    // undefined and the bug returns with the code still looking right.
    const join = source.match(/dealerships\([^)]*\)/g)?.join(" ") ?? "";
    expect(join).toContain("meta_pixel_id");
    expect(join).toContain("ga_tracking_id");
    expect(join).toContain("gtm_id");
  });

  // String.raw, NOT a plain template literal. The first version of this
  // used one, so `\s` collapsed to a literal "s" and `\?\?` became a
  // lazy quantifier — the pattern was defanged before RegExp ever saw
  // it. It failed loudly here, but the dangerous case is the opposite:
  // a silently-weakened pattern that matches the buggy code too and
  // reports green. Hence the negative control below.
  const fallbackPattern = (field: string) =>
    new RegExp(String.raw`page\.${field}\s*\?\?\s*dealership\?\.${field}`);

  it("prefers the per-page value and falls back to the business one", () => {
    for (const field of ["meta_pixel_id", "ga_tracking_id", "gtm_id"]) {
      expect(source, `${field} must fall back`).toMatch(fallbackPattern(field));
    }
  });

  it("the pattern above actually rejects the bug it is meant to catch", () => {
    // Guards the assertion, not the app: if someone re-breaks the
    // escaping, this fails instead of quietly approving `page.X` alone.
    expect("metaPixelId={page.meta_pixel_id}").not.toMatch(fallbackPattern("meta_pixel_id"));
    expect("metaPixelId={dealership?.meta_pixel_id}").not.toMatch(fallbackPattern("meta_pixel_id"));
    expect("x={page.meta_pixel_id ?? dealership?.meta_pixel_id}").toMatch(fallbackPattern("meta_pixel_id"));
  });

  it("does not pass a bare page value for any of the three", () => {
    // The exact shape of the original bug.
    expect(source).not.toMatch(/metaPixelId=\{page\.meta_pixel_id\}/);
    expect(source).not.toMatch(/gaId=\{page\.ga_tracking_id\}/);
    expect(source).not.toMatch(/gtmId=\{page\.gtm_id\}/);
  });
});

describe("override fields are labelled as overrides", () => {
  const settings = committed("src/components/website/PopupAndTrackingSettings.tsx");

  it("no longer presents itself as the business-level setting", () => {
    // Two screens both saying plain "Meta Pixel ID", neither
    // mentioning the other, is what made the split invisible.
    expect(settings).not.toMatch(/placeholder="Meta Pixel ID"/);
    expect(settings).not.toMatch(/placeholder="Google Analytics ID \(e\.g\./);
  });

  it("points at Settings → Integrations as the place to set it once", () => {
    expect(settings).toContain("/dashboard/settings/integrations");
  });
});
