// Everything of this business that is public right now.
//
// Three tables each carry their own `published` flag, and each puts a
// different page on the open internet under the owner's name. The
// Website Builder's toggle controls one of them and says so — and
// nothing told him about the other two, so he could switch his site
// off and reasonably believe his business was no longer public.
//
// THE TESTS THAT MATTER are the ones about what this does NOT do: it
// reports, and it never takes anything down.

import { describe, it, expect } from "vitest";
import { readPublicSurfaces, otherSurfacesLine, EXAMPLES_SHOWN } from "@/lib/website/publicSurfaces";
import { code } from "./helpers/source";

function db(opts: { site?: any; siteError?: any; landing?: any[] | null; landingError?: any; seo?: any[] | null; seoError?: any } = {}) {
  return {
    from: (table: string) => {
      if (table === "websites") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: opts.site ?? null, error: opts.siteError ?? null }),
        };
        return chain;
      }
      const isLanding = table === "landing_pages";
      const data = isLanding ? opts.landing : opts.seo;
      const error = isLanding ? opts.landingError : opts.seoError;
      const chain: any = {
        select: () => chain,
        eq: (col: string) => (col === "published" ? Promise.resolve({ data: error ? null : data ?? [], error: error ?? null }) : chain),
      };
      return chain;
    },
  } as any;
}

describe("1. IT REPORTS, AND TAKES NOTHING DOWN", () => {
  it("THE MODULE WRITES NOTHING AT ALL", () => {
    // THE LOAD-BEARING ONE. The tempting fix was one switch that
    // unpublishes all three — which quietly kills the landing page the
    // owner's ads are paying to send people to. He asked for the site
    // to be off; the site is off.
    const src = code("src/lib/website/publicSurfaces.ts");
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/published:\s*false/);
  });

  it("AND NEITHER DOES THE CARD THAT SHOWS IT", () => {
    const src = code("src/components/website-builder/WebsiteBuilderView.tsx");
    const at = src.indexOf("{otherSurfaces &&");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).not.toMatch(/togglePublish|fetch\(/);
  });
});

describe("2. IT COUNTS WHAT IS ACTUALLY SERVED", () => {
  it("EACH SURFACE IS READ WITH ITS OWN PUBLISHED FLAG", async () => {
    const out = await readPublicSurfaces(
      db({ site: { slug: "acme", published: true }, landing: [{ slug: "diwali" }, { slug: "sale" }], seo: [{ slug: "candles-lucknow" }] }),
      "d1"
    );
    expect(out.site).toEqual({ live: true, url: "/site/acme" });
    expect(out.landingPages.live).toBe(2);
    expect(out.seoPages.live).toBe(1);
  });

  it("AN UNPUBLISHED SITE IS live: false, not missing", async () => {
    const out = await readPublicSurfaces(db({ site: { slug: "acme", published: false }, landing: [], seo: [] }), "d1");
    expect(out.site.live).toBe(false);
    expect(out.site.url).toBe("/site/acme");
  });

  it("a business with no site at all is live: false with no address", async () => {
    const out = await readPublicSurfaces(db({ site: null, landing: [], seo: [] }), "d1");
    expect(out.site).toEqual({ live: false, url: null });
  });

  it("A FEW ADDRESSES, NOT A LIST", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ slug: `p${i}` }));
    const out = await readPublicSurfaces(db({ site: null, landing: many, seo: [] }), "d1");
    expect(out.landingPages.live).toBe(9);
    expect(out.landingPages.examples).toHaveLength(EXAMPLES_SHOWN);
    expect(out.landingPages.examples[0]).toBe("/p/p0");
  });
});

describe("3. COULD NOT CHECK IS NOT ZERO", () => {
  it("A FAILED READ IS null, NEVER 0", async () => {
    // "You have no landing pages" and "I could not check your landing
    // pages" are different sentences, and only one is safe to act on.
    const out = await readPublicSurfaces(db({ site: null, landingError: { message: "boom" }, seo: [] }), "d1");
    expect(out.landingPages.live).toBeNull();
    expect(out.landingPages.live).not.toBe(0);
  });

  it("AND IT IS SAID IN ITS OWN SENTENCE, not folded into a count", async () => {
    const out = await readPublicSurfaces(db({ site: null, landingError: { message: "boom" }, seo: [{ slug: "x" }] }), "d1");
    const line = otherSurfacesLine(out)!;
    expect(line).toMatch(/1 search page/);
    expect(line).toMatch(/Couldn't check your landing pages/);
  });

  it("a failed site read says nothing rather than 'not published'", async () => {
    const out = await readPublicSurfaces(db({ siteError: { message: "boom" }, landing: [], seo: [] }), "d1");
    expect(out.site.live).toBeNull();
  });
});

describe("4. THE LINE ONLY APPEARS WHEN THERE IS SOMETHING TO SAY", () => {
  it("NOTHING ELSE PUBLIC MEANS NO LINE", () => {
    // Most businesses have only a site. A line that appears always is
    // a line nobody reads.
    expect(
      otherSurfacesLine({ site: { live: true, url: "/site/x" }, landingPages: { live: 0, examples: [] }, seoPages: { live: 0, examples: [] } })
    ).toBeNull();
  });

  it("AND IT READS THE SAME WHETHER THE SITE IS ON OR OFF", () => {
    // The same fact either way, which is why it is not phrased as a
    // warning — it is the rest of what is live, not an alarm.
    const surfaces = { landingPages: { live: 2, examples: [] }, seoPages: { live: 0, examples: [] } };
    const on = otherSurfacesLine({ ...surfaces, site: { live: true, url: "/site/x" } });
    const off = otherSurfacesLine({ ...surfaces, site: { live: false, url: "/site/x" } });
    expect(on).toBe(off);
    expect(on).toMatch(/Also public: 2 landing pages\./);
  });

  it("one reads as one", () => {
    expect(
      otherSurfacesLine({ site: { live: true, url: null }, landingPages: { live: 1, examples: [] }, seoPages: { live: 1, examples: [] } })
    ).toMatch(/1 landing page and 1 search page/);
  });
});

describe("5. THE OWNER ACTUALLY SEES IT", () => {
  it("THE BUILDER'S LOAD RETURNS IT", () => {
    const src = code("src/app/api/website-builder/generate/route.ts");
    expect(src).toMatch(/const surfaces = await readPublicSurfaces\(supabase, dealershipId\);/);
    expect(src).toMatch(/otherSurfaces: otherSurfacesLine\(surfaces\)/);
  });

  it("AND THE CARD SHOWS IT BESIDE THE TOGGLE IT QUALIFIES", () => {
    const src = code("src/components/website-builder/WebsiteBuilderView.tsx");
    const toggle = src.indexOf("Site: /site/");
    const line = src.indexOf("{otherSurfaces &&");
    expect(toggle).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(toggle);
    expect(line - toggle).toBeLessThan(1500);
  });

  it("and a blank answer shows nothing", () => {
    const src = code("src/components/website-builder/WebsiteBuilderView.tsx");
    expect(src).toMatch(/typeof d\.otherSurfaces === "string" && d\.otherSurfaces\.trim\(\) \? d\.otherSurfaces : null/);
  });
});
