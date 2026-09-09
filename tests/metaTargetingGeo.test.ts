// The targeting payload Meta actually receives.
//
// THE BUG: resolveLocation returns { geo_locations: {...} }, and every
// return in buildMetaTargeting spread the INNER object —
// `...location.geo_locations` — so `countries` or `cities` landed at
// the top level of targeting, where Meta's spec has no such field,
// while the geo_locations key it requires was never sent. Every adset
// was rejected:
//
//   Add at least one location or choose a custom audience (1885364)
//
// NOT a regression from removing the hardcoded Lucknow default. That
// changed which BRANCH of resolveLocation runs; all three branches were
// flattened the same way, so a campaign with a city set failed
// identically. It was simply never reachable until the executor started
// completing launches.
//
// These tests CALL the function and read the payload. This session has
// produced seven bugs that source-reading tests could not see, and a
// grep for "geo_locations" would have passed on the broken code —
// the string was right there, on the wrong side of a spread.

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildMetaTargeting } from "@/lib/ads/metaTargeting";

afterEach(() => vi.unstubAllGlobals());

/** Meta's adgeolocation search, for the city lookup. */
function stubCityLookup(key: string | null) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: key ? [{ key, name: "Mumbai", type: "city" }] : [] }),
  })));
}

const base = { businessCategory: "candles", persona: null, location: null, accessToken: "TOKEN", customAudienceIds: [] };

describe("geo_locations is NESTED, which is the only shape Meta accepts", () => {
  it("city null → country-level India, under geo_locations", async () => {
    // candle_by_qaaf's exact case: no city on the dealership, so the
    // plan returns null and this is the all-India path.
    stubCityLookup(null);
    const built = await buildMetaTargeting({ ...base, aiSuggestedCity: null });

    expect(built.targeting.geo_locations).toEqual({ countries: ["IN"] });
    // THE ASSERTION THAT WOULD HAVE CAUGHT IT: the flattened keys must
    // NOT be at the top level, where Meta ignores them.
    expect(built.targeting).not.toHaveProperty("countries");
    expect(built.targeting).not.toHaveProperty("cities");
  });

  it("city set → city-level targeting, still under geo_locations", async () => {
    stubCityLookup("1234567");
    const built = await buildMetaTargeting({ ...base, aiSuggestedCity: "Mumbai" });

    expect(built.targeting.geo_locations.cities?.[0]?.key).toBe("1234567");
    expect(built.targeting).not.toHaveProperty("cities");
    expect(built.summary).toBeTruthy();
  });

  it("an unresolvable city falls back to India rather than to nothing", async () => {
    // A geo that cannot be matched must not become an absent geo —
    // that is the same rejection by another route.
    stubCityLookup(null);
    const built = await buildMetaTargeting({ ...base, aiSuggestedCity: "Nowhereville" });
    expect(built.targeting.geo_locations).toEqual({ countries: ["IN"] });
  });

  it("EVERY path sends a non-empty geo_locations", async () => {
    // The invariant, over each branch rather than the one case above.
    // Meta rejects the adset if this is missing, empty, or flattened.
    stubCityLookup("999");
    const cases = [
      { label: "plain", input: { ...base, aiSuggestedCity: null } },
      { label: "with city", input: { ...base, aiSuggestedCity: "Mumbai" } },
      { label: "retargeting", input: { ...base, aiSuggestedCity: null, customAudienceIds: ["aud_1"] } },
      { label: "special ad category", input: { ...base, businessCategory: "real estate", aiSuggestedCity: null } },
      { label: "with persona", input: { ...base, aiSuggestedCity: null, persona: { age_range: "25-45", gender: "all" } } },
    ];

    for (const { label, input } of cases) {
      const built = await buildMetaTargeting(input as any);
      const geo = built.targeting.geo_locations;
      expect(geo, `${label}: no geo_locations — Meta rejects this adset`).toBeTruthy();
      expect(Object.keys(geo ?? {}).length, `${label}: geo_locations is empty`).toBeGreaterThan(0);
      const hasTarget =
        (geo.countries?.length ?? 0) > 0 || (geo.cities?.length ?? 0) > 0 || (geo.regions?.length ?? 0) > 0;
      expect(hasTarget, `${label}: geo_locations names no actual place`).toBe(true);
    }
  });

  it("retargeting keeps BOTH the audience and the geo", async () => {
    // Meta still requires a location even when a custom audience
    // defines who to reach.
    stubCityLookup(null);
    const built = await buildMetaTargeting({ ...base, aiSuggestedCity: null, customAudienceIds: ["aud_1"] } as any);
    expect(built.targeting.custom_audiences).toEqual([{ id: "aud_1" }]);
    expect(built.targeting.geo_locations).toEqual({ countries: ["IN"] });
  });

  it("a special ad category is location-only but still located", async () => {
    stubCityLookup(null);
    const built = await buildMetaTargeting({ ...base, businessCategory: "real estate", aiSuggestedCity: null });
    expect(built.specialAdCategory).not.toBe("NONE");
    expect(built.targeting.geo_locations).toEqual({ countries: ["IN"] });
    // Demographics are stripped for these by law; the geo is not.
    expect(built.targeting).not.toHaveProperty("age_min");
  });
});
