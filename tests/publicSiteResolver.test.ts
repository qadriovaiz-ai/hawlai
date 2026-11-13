// Which business a public slug belongs to — one resolver.
//
// Two public routes had each written this fallback out by hand, in two
// different shapes, and a third was about to be written for the chat
// route. The tests that matter are the ones about WHOSE page answers:
// an unpublished draft must not resolve to anybody.

import { describe, it, expect } from "vitest";
import { resolvePublicSite } from "@/lib/publicSite";
import { code } from "./helpers/source";

/**
 * A database that answers the way PostgREST does: a filtered query
 * returns nothing when the filter does not match, which is the whole
 * behaviour under test.
 */
function db(rows: { landing_pages?: any[]; websites?: any[] } = {}) {
  const seen: { table: string; filters: Record<string, any> }[] = [];
  return {
    seen,
    client: {
      from(table: string) {
        const filters: Record<string, any> = {};
        seen.push({ table, filters });
        const chain: any = {
          select: () => chain,
          eq: (col: string, value: any) => {
            filters[col] = value;
            return chain;
          },
          maybeSingle: () => {
            const all = (rows as any)[table] ?? [];
            const hit = all.find((r: any) =>
              Object.entries(filters).every(([k, v]) => r[k] === v)
            );
            return Promise.resolve({ data: hit ?? null, error: null });
          },
        };
        return chain;
      },
    } as any,
  };
}

describe("1. AN UNPUBLISHED PAGE RESOLVES TO NOBODY", () => {
  it("A DRAFT LANDING PAGE FALLS THROUGH TO THE SITE, rather than answering", async () => {
    // THE LOAD-BEARING ONE. Resolving a draft would hand a visitor the
    // business behind a page nobody is allowed to see — and on the chat
    // route, would let the agent speak for it.
    const { client } = db({
      landing_pages: [{ slug: "diwali", published: false, dealership_id: "draft-owner" }],
      websites: [{ slug: "diwali", published: true, dealership_id: "real-owner" }],
    });
    expect(await resolvePublicSite(client, "diwali")).toEqual({
      dealershipId: "real-owner",
      source: "website",
    });
  });

  it("AND A DRAFT SITE RESOLVES TO NOTHING AT ALL", async () => {
    const { client } = db({ websites: [{ slug: "shop", published: false, dealership_id: "d1" }] });
    expect(await resolvePublicSite(client, "shop")).toBeNull();
  });

  it("THE PUBLISHED FILTER IS ASKED OF THE DATABASE, not applied afterwards", async () => {
    // The two hand-written copies disagreed on this: one filtered in
    // the query, the other read the column back and tested it in
    // JavaScript. One place, one shape.
    const { client, seen } = db({});
    await resolvePublicSite(client, "x");
    expect(seen).toHaveLength(2);
    for (const q of seen) expect(q.filters.published, q.table).toBe(true);
  });
});

describe("2. WHICH TABLE ANSWERS", () => {
  it("a landing page resolves as a landing page", async () => {
    const { client } = db({ landing_pages: [{ slug: "p", published: true, dealership_id: "d1" }] });
    expect(await resolvePublicSite(client, "p")).toEqual({ dealershipId: "d1", source: "landing_page" });
  });

  it("a site resolves as a site", async () => {
    const { client } = db({ websites: [{ slug: "s", published: true, dealership_id: "d2" }] });
    expect(await resolvePublicSite(client, "s")).toEqual({ dealershipId: "d2", source: "website" });
  });

  it("A LANDING PAGE WINS A TIE — the order both callers already used", async () => {
    // The namespaces are separate, so one slug can exist in both.
    // Changing which business answers for a slug is not a refactor.
    const { client } = db({
      landing_pages: [{ slug: "both", published: true, dealership_id: "page-owner" }],
      websites: [{ slug: "both", published: true, dealership_id: "site-owner" }],
    });
    expect((await resolvePublicSite(client, "both"))?.dealershipId).toBe("page-owner");
  });

  it("AND THE SITE IS NOT EVEN ASKED FOR when the landing page answered", async () => {
    const { client, seen } = db({ landing_pages: [{ slug: "p", published: true, dealership_id: "d1" }] });
    await resolvePublicSite(client, "p");
    expect(seen.map((q) => q.table)).toEqual(["landing_pages"]);
  });

  it("an unknown slug is null, not an exception", async () => {
    const { client } = db({});
    expect(await resolvePublicSite(client, "nope")).toBeNull();
  });

  it("a missing or blank slug never reaches the database", async () => {
    const { client, seen } = db({});
    expect(await resolvePublicSite(client, "")).toBeNull();
    expect(await resolvePublicSite(client, null)).toBeNull();
    expect(await resolvePublicSite(client, undefined)).toBeNull();
    expect(await resolvePublicSite(client, "   ")).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("3. THE HAND-WRITTEN COPIES ARE GONE", () => {
  // In this codebase a duplicated definition has caused a bug every
  // time it was left alone. These two had already drifted in shape.
  const routes = [
    "src/app/api/public/track/route.ts",
    "src/app/api/public/leads/route.ts",
  ];

  for (const route of routes) {
    it(`${route} resolves through the shared resolver`, () => {
      const src = code(route);
      expect(src).toMatch(/resolvePublicSite\(supabase, slug\)/);
    });

    it(`${route} NO LONGER QUERIES EITHER TABLE ITSELF`, () => {
      const src = code(route);
      expect(src).not.toMatch(/from\("landing_pages"\)/);
      expect(src).not.toMatch(/from\("websites"\)/);
    });
  }
});
