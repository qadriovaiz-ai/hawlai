// The PAUSED-on-create guarantee, asserted by RUNNING the route.
//
// R2.3 asked for this and it was covered by a grep:
//
//   expect(source).toContain('status: "PAUSED"')
//
// That assertion passes if the string appears anywhere in the file —
// in a comment, in one of the three calls but not the other two, or in
// a branch that never executes. It cannot see that the campaign is
// PAUSED but the ad set is ACTIVE, which is the shape of the bug that
// actually spends money. Meta bills on the AD's effective status, and
// an ACTIVE ad under a PAUSED campaign is the exact ambiguity worth
// pinning rather than trusting.
//
// So this invokes the real handler with every boundary mocked, and
// reads what was ACTUALLY sent to the Graph API. The strongest
// assertion here is not the three named ones — it is that NO call to
// Meta carries a status other than PAUSED, which stays true when
// someone adds a fourth object next year.

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Every Graph API call the route made, in order. */
const metaCalls: { path: string; params: Record<string, any> }[] = [];
/** Everything written to ad_creatives, in order. */
const writes: Record<string, any>[] = [];

vi.mock("@/lib/adEngine", () => ({
  GRAPH_VERSION: "v23.0",
  generateAdPlan: vi.fn(async () => ({
    headline: "Diwali Sale",
    body: "Limited time",
    daily_budget: 500,
    car_type: "Candles",
    targeting_city: "Lucknow",
    background_style: "studio_white",
    confidence_score: 80,
  })),
  buildFinalCreativeImage: vi.fn(async () => Buffer.from("fake-png")),
  metaPost: vi.fn(async (path: string, params: Record<string, any>) => {
    metaCalls.push({ path, params });
    if (path.endsWith("/adimages")) return { images: { bytes: { hash: "IMGHASH" } } };
    if (path.endsWith("/adcreatives")) return { id: "creative_1" };
    if (path.endsWith("/campaigns")) return { id: "campaign_1" };
    if (path.endsWith("/adsets")) return { id: "adset_1" };
    if (path.endsWith("/ads")) return { id: "ad_1" };
    return {};
  }),
}));

vi.mock("@/lib/ads/metaTargeting", () => ({
  buildMetaTargeting: vi.fn(async () => ({
    targeting: { geo_locations: { cities: [{ key: "123" }] } },
    specialAdCategory: "NONE",
    summary: "Lucknow, 25-45",
    personaApplied: true,
  })),
}));

const DEALERSHIP = "deal-1";

const connection = {
  fb_page_access_token: "PAGE_TOKEN_NEVER_ASSERTED_ON",
  fb_ad_account_id: "act_999",
  fb_page_id: "page_1",
  fb_lead_form_id: "form_1",
  business_category: "candles",
};

/** Rows the server-side (RLS) client returns, by table. */
let serverRows: Record<string, any> = {};

function chain(rowFor: (table: string) => any, table: string, record?: (fields: any) => void) {
  const api: any = {
    select: () => api,
    eq: () => api,
    in: () => api,
    maybeSingle: async () => ({ data: rowFor(table), error: null }),
    single: async () => ({ data: rowFor(table), error: null }),
    insert: (fields: any) => { record?.({ op: "insert", ...fields }); return api; },
    update: (fields: any) => { record?.({ op: "update", ...fields }); return api; },
  };
  return api;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => chain((t) => serverRows[t] ?? null, table),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) =>
      chain(() => ({ id: "draft-1", plan_json: null, generated_image_url: null }), table, (f) => writes.push(f)),
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn/ad.png" } }),
      }),
    },
  }),
}));

import { POST } from "@/app/api/ads/adlaunch/route";

function launchRequest(body: Record<string, unknown> = {}) {
  return new Request("https://hawlai.online/api/ads/adlaunch", {
    method: "POST",
    body: JSON.stringify({
      photo_base64: "data:image/png;base64,aGVsbG8=",
      prompt: "Diwali sale on scented candles, free delivery",
      image_mode: "template",
      ...body,
    }),
  });
}

beforeEach(() => {
  metaCalls.length = 0;
  writes.length = 0;
  serverRows = {
    profiles: { dealership_id: DEALERSHIP },
    dealerships: { ...connection },
    brand_profiles: null,
  };
});

const call = (suffix: string) => metaCalls.find((c) => c.path.endsWith(suffix));

describe("nothing reaches Meta in a spending state", () => {
  it("creates the campaign, ad set and ad ALL paused", async () => {
    const res = await POST(launchRequest());
    expect(res.status).toBe(200);

    expect(call("/campaigns")!.params.status).toBe("PAUSED");
    expect(call("/adsets")!.params.status).toBe("PAUSED");
    expect(call("/ads")!.params.status).toBe("PAUSED");
  });

  it("sends NO status other than PAUSED, on any call, ever", async () => {
    // The assertion that outlives the three above. A fourth object, a
    // refactor, a copy-paste from a different platform module — any of
    // them would have to pass this.
    await POST(launchRequest());

    const statuses = metaCalls
      .filter((c) => "status" in c.params)
      .map((c) => `${c.path} => ${c.params.status}`);

    expect(statuses.length).toBeGreaterThanOrEqual(3);
    expect(statuses.filter((s) => !s.endsWith("PAUSED"))).toEqual([]);
  });

  it("never sends ACTIVE anywhere in any payload", async () => {
    // Belt and braces against a status nested somewhere other than the
    // top-level `status` field.
    await POST(launchRequest());
    for (const c of metaCalls) {
      expect(JSON.stringify(c.params)).not.toContain("ACTIVE");
    }
  });

  it("records PAUSED on the row too, in both the meta_ and external_ columns", async () => {
    // The dual-write from migration 140. If these disagree, the
    // dashboard shows one state and Meta holds another — and the
    // activate route reads external_status.
    await POST(launchRequest());
    const update = writes.find((w) => w.op === "update" && w.meta_ad_id);

    // Asserted before the fields are read: without it, a launch that
    // never wrote the row at all would make every expect below
    // silently operate on undefined.
    expect(update, "no ad_creatives update carried the Meta ids").toBeDefined();
    expect(update!.meta_status).toBe("PAUSED");
    expect(update!.external_status).toBe("PAUSED");
    expect(update!.status).toBe("launched");
  });
});

describe("the launch is otherwise well-formed", () => {
  it("creates the campaign before the ad set, and the ad set before the ad", async () => {
    // Each depends on the previous one's id. Out of order, the ad set
    // would reference an undefined campaign_id and Meta would reject
    // it with an error that names neither.
    await POST(launchRequest());
    const order = metaCalls.map((c) => c.path.split("/").pop());
    expect(order).toEqual(["adimages", "adcreatives", "campaigns", "adsets", "ads"]);
  });

  it("wires the real ids through, not placeholders", async () => {
    await POST(launchRequest());
    expect(call("/adsets")!.params.campaign_id).toBe("campaign_1");
    expect(call("/ads")!.params.adset_id).toBe("adset_1");
    expect(call("/ads")!.params.creative).toEqual({ creative_id: "creative_1" });
  });

  it("sends the budget in PAISE, not rupees", async () => {
    // Same class of bug as the Razorpay conversion, and worse in this
    // direction: sending 500 instead of 50000 would set a ₹5/day
    // budget, and sending rupees where paise are expected on a larger
    // number silently underspends a campaign the merchant thinks is
    // running properly.
    await POST(launchRequest());
    expect(call("/adsets")!.params.daily_budget).toBe(50000);
  });

  it("declares a special ad category, which Meta requires", async () => {
    await POST(launchRequest());
    expect(call("/campaigns")!.params.special_ad_categories).toEqual(["NONE"]);
  });
});

describe("an unconnected business cannot launch", () => {
  it.each([
    ["no token", { fb_page_access_token: null }],
    ["no ad account", { fb_ad_account_id: null }],
    ["no page", { fb_page_id: null }],
  ])("refuses with %s, before any Graph call", async (_label, missing) => {
    // The state candle_by_qaaf is in today. Refusing before the first
    // Graph call is what makes the error actionable ("connect your
    // Page") instead of a Meta permissions error.
    serverRows.dealerships = { ...connection, ...missing };

    const res = await POST(launchRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't connected/i);
    expect(metaCalls).toEqual([]);
  });
});
