// Retargeting R4 (2026-09-20): what an ad SAYS follows how long ago the
// person showed interest — reminder, then the likely doubt answered with
// one of the owner's own story facts, then an offer if there is a real one.
//
// The sequence is the recency tiers, not an ad schedule: Meta has no
// reliable ad sequencing for Traffic or Leads campaigns, and takes a
// frequency cap only on reach campaigns. Both are said, not implied.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" = "select";
  let payload: Row | null = null;
  const run = () => {
    if (op === "insert") {
      const row = { id: `${table}-1`, created_at: new Date().toISOString(), ...payload };
      (tables[table] ??= []).push(row);
      return { data: row, error: null };
    }
    return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, or: () => api, gte: () => api, lt: () => api, neq: () => api, in: () => api,
    insert: (p: Row) => ((op = "insert"), (payload = p), api),
    eq: (c: string, v: any) => (filters.push((r) => !(c in r) || r[c] === v), api),
    single: async () => {
      const { data } = run();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error: null };
    },
    maybeSingle: async () => ({ data: (run().data as any)?.[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

let factsFixture: any;
vi.mock("@/lib/claims/businessFacts", async (orig) => ({ ...(await orig<any>()), gatherBusinessFactsSafely: async () => factsFixture }));

let briefs: string[];
vi.mock("@/lib/adEngine", async (orig) => ({
  ...(await orig<any>()),
  generateAdPlan: async (brief: string) => {
    briefs.push(brief);
    return { headline: "Come back", body: "Your candle is waiting.", background_style: "warm", confidence_score: 80 };
  },
}));

import { POST as campaign } from "@/app/api/retargeting/campaign/route";
import { GET as dashboard } from "@/app/api/retargeting/dashboard/route";
import { STEPS, stepFor, messageBrief, frequencyCapFor, NO_FREQUENCY_CAP_NOTE, storyFacts } from "@/lib/retargeting/messages";
import { TIERS } from "@/lib/retargeting/audiences";
import { readFileSync } from "node:fs";

const STORY = { category: "business_story", title: "Why soy wax", content: "Soy wax from a Kanpur supplier; I rejected paraffin after testing it." };
const facts = (over: Row = {}) => ({ businessName: "Candle by Qaaf", ownerFacts: [STORY], offers: [], products: [], ...over });

const make = (audienceKey: string, body: Row = {}) =>
  campaign(new Request("https://hawlai.test/api/retargeting/campaign", { method: "POST", body: JSON.stringify({ audienceKey, ...body }) }));

beforeEach(() => {
  briefs = [];
  factsFixture = facts();
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", business_category: "Home fragrance", business_models: ["products"] }],
    brand_profiles: [],
    products: [],
    orders: [],
    leads: [],
    abandoned_carts: [],
    page_events: [],
    meta_custom_audiences: TIERS.map((t) => ({ dealership_id: "d1", audience_key: `abandoned_cart:${t.key}`, meta_audience_id: `aud-${t.key}`, sync_status: "synced" })),
    ad_creatives: [],
  };
});
afterEach(() => vi.restoreAllMocks());

describe("the three messages", () => {
  it("each recency group is one of them, in order", () => {
    expect(TIERS.map((t) => STEPS[t.key])).toEqual([
      { step: 1, kind: "reminder", label: "Reminder", allowsOffer: false },
      { step: 2, kind: "objection", label: "Answers the likely doubt", allowsOffer: false },
      { step: 3, kind: "offer", label: "Offer, if you have one", allowsOffer: true },
    ]);
    // An audience that isn't split by recency keeps its single message.
    expect(stepFor(null)).toBeNull();
  });

  it("the first is a reminder with nothing promised", async () => {
    const res = await make("abandoned_cart:1_3");
    expect(res.status).toBe(200);
    expect(briefs[0]).toContain("This is the FIRST message");
    expect(briefs[0]).toContain("Do NOT promise any discount");
    expect(briefs[0]).not.toContain("Why soy wax");
  });

  it("the second answers the doubt with the owner's own story fact — and only those", async () => {
    await make("abandoned_cart:4_14");
    expect(briefs[0]).toContain("This is the SECOND message");
    expect(briefs[0]).toContain("- Why soy wax: Soy wax from a Kanpur supplier");
    expect(briefs[0]).toContain("Do NOT promise any discount");
  });

  it("with no story recorded, the second message says so instead of inventing a reason to trust them", async () => {
    factsFixture = facts({ ownerFacts: [{ category: "other", title: "Note", content: "Something else" }] });
    await make("abandoned_cart:4_14");
    expect(briefs[0]).toContain("The owner hasn't recorded their story yet");
    expect(briefs[0]).not.toContain("Something else");
    expect(storyFacts(factsFixture as any)).toEqual([]);
  });

  it("the third carries the owner's offer exactly — or makes the case on value when there isn't one", async () => {
    await make("abandoned_cart:15_30", { discountPercent: 15 });
    expect(briefs[0]).toContain("This is the THIRD and last message");
    expect(briefs[0]).toContain("Feature exactly a 15% discount");

    briefs = [];
    await make("abandoned_cart:15_30");
    expect(briefs[0]).toContain("There is no offer to make");
    expect(briefs[0]).toContain("Do NOT promise any discount");
  });

  it("an offer aimed at an early group is refused, not quietly dropped", async () => {
    const res = await make("abandoned_cart:1_3", { discountPercent: 20 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("An offer belongs in the last message. This group saw you 1–3 days ago, so its ad is a reminder — make the offer ad for the 15–30 day group.");
    expect(briefs).toEqual([]);
    expect(tables.ad_creatives).toEqual([]);
    // The same for the second message, including a written-out offer.
    expect((await make("abandoned_cart:4_14", { customOffer: "Free delivery this week" })).status).toBe(400);
    expect(briefs).toEqual([]);
  });

  it("the draft says which message it is", async () => {
    const body = await (await make("abandoned_cart:4_14")).json();
    expect(body.step).toEqual({ number: 2, kind: "objection", label: "Answers the likely doubt" });
  });

  it("messageBrief is what the route uses — no offer text survives an early step", () => {
    const offer = { text: 'The offer to feature is exactly: "Free delivery".' };
    expect(messageBrief(STEPS["1_3"], facts() as any, offer)).not.toContain("Free delivery");
    expect(messageBrief(STEPS["4_14"], facts() as any, offer)).not.toContain("Free delivery");
    expect(messageBrief(STEPS["15_30"], facts() as any, offer)).toContain("Free delivery");
    // An untiered audience keeps the old behaviour: whatever was authorised.
    expect(messageBrief(null, facts() as any, offer)).toBe(offer.text);
    expect(messageBrief(null, facts() as any, { text: null })).toContain("Do NOT promise any discount");
  });
});

describe("frequency, said honestly", () => {
  it("Meta takes a cap only on reach campaigns — ours get none, and the page says why", async () => {
    expect(frequencyCapFor("OUTCOME_TRAFFIC")).toBeNull();
    expect(frequencyCapFor("OUTCOME_LEADS")).toBeNull();
    expect(frequencyCapFor("OUTCOME_AWARENESS")).toEqual({ specs: [{ event: "IMPRESSIONS", interval_days: 7, max_frequency: 3 }] });
    expect(NO_FREQUENCY_CAP_NOTE).toContain("doesn't allow a frequency cap on this kind of campaign");
  });

  it("the ad set sends a cap only when there is one to send", () => {
    const launch = readFileSync("src/lib/ads/launchCampaign.ts", "utf8");
    expect(launch).toContain("...(frequencyCapFor(destination.objective) ? { frequency_control_specs: frequencyCapFor(destination.objective)!.specs } : {}),");
  });

  it("the dashboard carries the note and each group's message", async () => {
    const body = await (await dashboard()).json();
    expect(body.frequencyCapNote).toBe(NO_FREQUENCY_CAP_NOTE);
    const carts = body.segments.filter((s: any) => s.key.startsWith("abandoned_cart"));
    expect(carts.map((s: any) => s.step.number)).toEqual([1, 2, 3]);
    expect(carts.map((s: any) => s.step.allowsOffer)).toEqual([false, false, true]);
    // A win-back audience isn't part of the sequence.
    expect(body.segments.find((s: any) => s.key === "lapsed_buyers").step).toBeNull();
  });

  it("the page only offers the discount box on the last message", () => {
    const view = readFileSync("src/components/retargeting/RetargetingDashboard.tsx", "utf8");
    expect(view).toContain("{s.step && !s.step.allowsOffer ? (");
    expect(view).toContain("The 15–30 day group is where an offer goes.");
    expect(view).toContain("createCampaign(s.key, s.step?.allowsOffer !== false)");
    expect(view).toContain("{frequencyNote && <p");
  });
});
