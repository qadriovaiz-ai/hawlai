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

  it("prefers the per-page value and falls back to the business one", () => {
    for (const field of ["meta_pixel_id", "ga_tracking_id", "gtm_id"]) {
      expect(source, `${field} must fall back`).toMatch(
        new RegExp(`page\.${field}\s*\?\?\s*dealership\?\.${field}`)
      );
    }
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
