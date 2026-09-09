// Linking a website order back to the ad that produced it.
//
// THE GAP: withCampaignTag() stamps utm_campaign=<ad_creatives.id> on
// every outbound ad link, so the attribution arrived on every click and
// was thrown away at checkout. No order carried a campaign id, and
// revenue came only from converted LEADS — which a
// traffic-to-product-page campaign never creates. So every campaign
// this chat-launch flow produces would have shown spend and
// impressions with zero revenue and no ROAS, however much it sold.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "f".repeat(64);
import { readAttributionFromUrl, captureAttribution, getAttribution } from "@/lib/storefront/attribution";
import { resolveOrderAttribution } from "@/lib/storefront/resolveAttribution";

/** A sessionStorage stand-in, so capture rules run without a browser. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

const DRAFT = "3f2a1c9e-4b7d-4e8a-9c1f-2d6b8a0e5f31";

describe("reading the tags off a landing URL", () => {
  it("picks up the campaign tag an ad link carries", () => {
    const got = readAttributionFromUrl(`https://hawlai.online/site/candle-by-qaaf/products/p1?utm_source=facebook&utm_medium=paid_social&utm_campaign=${DRAFT}`);
    expect(got!.utm_campaign).toBe(DRAFT);
    expect(got!.utm_source).toBe("facebook");
  });

  it("returns null for an ordinary visit with no tags", () => {
    expect(readAttributionFromUrl("https://hawlai.online/site/candle-by-qaaf/products/p1")).toBeNull();
  });

  it("does not choke on a malformed URL", () => {
    expect(readAttributionFromUrl("not a url")).toBeNull();
  });

  it("caps an absurdly long tag rather than storing it whole", () => {
    const got = readAttributionFromUrl(`https://x.com/?utm_campaign=${"a".repeat(5000)}`);
    expect(got!.utm_campaign!.length).toBe(200);
  });
});

describe("first touch wins", () => {
  it("keeps the ad that FOUND them, not the last link they clicked", () => {
    // Someone lands from an ad, browses, then returns via a plain
    // product link. Overwriting would credit the untagged visit and
    // lose the ad entirely.
    const store = memoryStorage();
    captureAttribution(`https://x.com/p?utm_campaign=${DRAFT}&utm_source=facebook`, store);
    captureAttribution("https://x.com/p?utm_campaign=some-other-campaign", store);
    expect(getAttribution(store)!.utm_campaign).toBe(DRAFT);
  });

  it("stores nothing for an untagged landing", () => {
    const store = memoryStorage();
    captureAttribution("https://x.com/p", store);
    expect(getAttribution(store)).toBeNull();
  });

  it("survives storage that throws, because a checkout must not break", () => {
    const hostile = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(() => captureAttribution(`https://x.com/?utm_campaign=${DRAFT}`, hostile)).not.toThrow();
    expect(getAttribution(hostile)).toBeNull();
  });

  it("ignores corrupted stored data instead of sending nonsense", () => {
    const store = memoryStorage();
    store.setItem("hawlai_attribution", "{not json");
    expect(getAttribution(store)).toBeNull();
  });
});

describe("resolving the tag into a campaign the dashboard can join", () => {
  const db = (row: any, expectDealership?: string) => ({
    from: () => {
      const filters: Record<string, any> = {};
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => { filters[c] = v; return api; },
        maybeSingle: async () => {
          if (expectDealership && filters.dealership_id !== expectDealership) return { data: null };
          return { data: row };
        },
      };
      return api;
    },
  });

  it("turns the draft id in the URL into the meta_campaign_id the dashboard uses", async () => {
    // THE LOAD-BEARING ONE. withCampaignTag stamps the DRAFT id --
    // the only stable per-ad identifier that exists before Meta hands
    // back its own -- while the dashboard joins on meta_campaign_id.
    const got = await resolveOrderAttribution(db({ meta_campaign_id: "camp_123" }), "d1", {
      utm_campaign: DRAFT,
      utm_source: "facebook",
    });
    expect(got.meta_campaign_id).toBe("camp_123");
    expect(got.utm_campaign).toBe(DRAFT);
    expect(got.utm_source).toBe("facebook");
  });

  it("KEEPS the raw tag even when it resolves to nothing", async () => {
    // "An order arrived tagged with something we could not match" is a
    // real observation -- a mistyped link, another tool's utm, a
    // deleted campaign. Dropping it would leave no trace to look at.
    const got = await resolveOrderAttribution(db(null), "d1", { utm_campaign: DRAFT, utm_source: "facebook" });
    expect(got.meta_campaign_id).toBeNull();
    expect(got.utm_campaign).toBe(DRAFT);
  });

  it("REFUSES a campaign id belonging to another business", async () => {
    // utm_campaign is attacker-controlled. Without the dealership
    // scope, anyone could append another shop's campaign id and
    // attach their order's revenue to it.
    const got = await resolveOrderAttribution(db({ meta_campaign_id: "camp_123" }, "d1"), "OTHER", {
      utm_campaign: DRAFT,
    });
    expect(got.meta_campaign_id).toBeNull();
  });

  it("does not query at all for a tag that cannot be a draft id", async () => {
    // Google's own utm values, a newsletter tag, a hand-typed word.
    let queried = false;
    const spy = { from: () => { queried = true; return {} as any; } };
    const got = await resolveOrderAttribution(spy, "d1", { utm_campaign: "spring-newsletter", utm_source: "email" });
    expect(queried).toBe(false);
    expect(got.utm_campaign).toBe("spring-newsletter");
    expect(got.meta_campaign_id).toBeNull();
  });

  it("returns empty for an untagged order rather than null-ing the columns oddly", async () => {
    for (const submitted of [null, undefined, {}, "nonsense", { utm_campaign: "   " }]) {
      const got = await resolveOrderAttribution(db(null), "d1", submitted);
      expect(got).toEqual({ utm_campaign: null, utm_source: null, meta_campaign_id: null });
    }
  });

  it("NEVER throws, because a sale must not fail on a lookup", async () => {
    const broken = { from: () => { throw new Error("db down"); } };
    const got = await resolveOrderAttribution(broken, "d1", { utm_campaign: DRAFT });
    expect(got.utm_campaign).toBe(DRAFT);
    expect(got.meta_campaign_id).toBeNull();
  });
});

// ---------------------------------------------------------------
// Step 4: an attributed order shows up in that campaign's revenue.
// ---------------------------------------------------------------
describe("an attributed order reaches the campaign's revenue", () => {
  // Meta's insights call. Spend is what ROAS divides by; the revenue
  // side is what these tests are about.
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ spend: "100", impressions: "1000", clicks: "10", ctr: "1" }] }),
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  /**
   * A Supabase double for getCampaignPerformanceState's three reads:
   * launched ads, converted leads, attributed orders.
   */
  function perfDb(opts: { ads: any[]; leads?: any[]; orders?: any[] }) {
    return {
      from: (table: string) => {
        const api: any = {
          select: () => api,
          eq: () => api,
          in: () => api,
          not: () => api,
          order: () => api,
          maybeSingle: async () => ({ data: null }),
          // The token read short-circuits the whole function when it
          // comes back empty, so the double has to answer it.
          single: async () => ({
            data: table === "dealerships"
              ? { fb_page_access_token: "TOKEN", fb_page_access_token_encrypted: null }
              : null,
          }),
          then: (resolve: any) =>
            resolve({
              data:
                table === "ad_creatives" ? opts.ads
                : table === "leads" ? (opts.leads ?? [])
                : table === "orders" ? (opts.orders ?? [])
                : [],
              error: null,
            }),
        };
        return api;
      },
    };
  }

  it("credits a traffic campaign with the order it produced", async () => {
    // THE WHOLE POINT. A traffic-to-product-page campaign creates no
    // lead row, so before this it read as zero revenue however much it
    // sold — and every campaign the chat launch flow creates is one.
    const { getCampaignPerformanceState } = await import("@/lib/agents/analyticsAgent");

    const state = await getCampaignPerformanceState(
      perfDb({
        ads: [{ id: "draft-1", headline: "Lavender Candle Sale", meta_campaign_id: "camp_123", meta_status: "ACTIVE" }],
        leads: [],
        orders: [{ meta_campaign_id: "camp_123", total: 550 }],
      }) as any,
      "d1"
    );

    if (state.state !== "ok") {
      // A missing Meta token short-circuits before revenue is computed;
      // that is a different path and not what this test is about.
      expect(state.state, `expected ok, got ${state.state}`).toBe("ok");
      return;
    }
    const campaign = state.value.campaigns.find((c: any) => c.id === "draft-1");
    expect(campaign?.revenue).toBe(550);
    expect(campaign?.conversions).toBe(1);
  });

  it("adds order revenue to lead revenue rather than replacing it", async () => {
    // A campaign can produce both — an Instant Form lead that converted
    // AND a website order. Counting only one would understate it.
    const { getCampaignPerformanceState } = await import("@/lib/agents/analyticsAgent");
    const state = await getCampaignPerformanceState(
      perfDb({
        ads: [{ id: "draft-1", headline: "x", meta_campaign_id: "camp_123", meta_status: "ACTIVE" }],
        leads: [{ meta_campaign_id: "camp_123", deal_value: 1000 }],
        orders: [{ meta_campaign_id: "camp_123", total: 550 }],
      }) as any,
      "d1"
    );
    if (state.state !== "ok") return;
    const campaign = state.value.campaigns.find((c: any) => c.id === "draft-1");
    expect(campaign?.revenue).toBe(1550);
    expect(campaign?.conversions).toBe(2);
  });
});
