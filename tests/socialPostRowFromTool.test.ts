// The row the chat tool writes when it shows a social card.
//
// Separate file from socialPostApprovalRecord.test.ts because this one
// has to mock the content generator and the destination reader, which
// that file deliberately does not.
//
// WHY IT EXISTS: three mutations survived the first pass of step 4, all
// for the same reason — nothing ran the TOOL. The tool could have
// stopped writing the row, composed the agreed text with a DIFFERENT
// function than the card uses, or written a row for a destination that
// is not even connected, and every test still passed.
//
// The composer one matters most. On 8 October 2026 the card's text and
// the payload's text came from two different functions, the owner
// approved one post and Facebook received another. A row whose agreed
// text came from a third function would reintroduce exactly that.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

// Partial mocks: masterBrainV2 imports other things from both modules,
// and replacing them wholesale makes it fail to load.
let generated: Row;
vi.mock("@/lib/agents/contentMarketingAgent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/contentMarketingAgent")>()),
  generateContent: async () => ({ output: generated }),
}));

let destinations: Row | null;
vi.mock("@/lib/chat/destinations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat/destinations")>()),
  readDestinations: async () => destinations,
}));

let writes: { table: string; values: Row }[];
let tables: Record<string, Row[]>;

function db(): any {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api, is: () => api, not: () => api,
      gte: () => api, lt: () => api, lte: () => api, gt: () => api, ilike: () => api, or: () => api, range: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), writes.push({ table, values: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), writes.push({ table, values: v }), api),
      upsert: () => api,
      delete: () => api,
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));

import { executeTool, extractArtifact } from "@/lib/agents/masterBrainV2";
import { composePost } from "@/lib/chat/socialPost";

const CTX: any = { id: "d1", name: "Candle by Qaaf", category: "Home fragrance", toneOfVoice: "warm", city: "Lucknow" };
const FB = { platform: "facebook", name: "Candle by Qaaf", connected: true, why: null };
const IG_OFF = { platform: "instagram", name: null, connected: false, why: "Instagram isn't connected." };

const run = (contentType = "facebook_post") =>
  executeTool(db(), CTX, "generate_content", { contentType, topic: "Lavender candle" }, "");

const row = () => writes.find((w) => w.table === "pending_approvals")?.values ?? null;

beforeEach(() => {
  writes = [];
  generated = { text: "Slow evenings start with the Lavender candle.", hashtags: ["#candles", "#lavender"] };
  destinations = { facebook: FB, instagram: IG_OFF, anyConnected: true };
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "Candle by Qaaf", business_category: "Home fragrance" }],
    products: [{ id: "p1", name: "Lavender candle", price: 550, is_active: true, order_index: 0, images: [] }],
    brand_profiles: [{ tone_of_voice: "warm" }],
    content_pieces: [], websites: [], business_knowledge: [], brand_kits: [],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    website_pages: [], team_members: [], business_memory: [], pending_approvals: [],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("THE TOOL WRITES THE ROW", () => {
  it("a connected destination gets a pending_approvals row", async () => {
    await run();
    expect(row()).toBeTruthy();
    expect(row()!.action_type).toBe("publish_social_post");
  });

  it("the row names the destination and the Page", async () => {
    await run();
    expect(row()!.action_details.destination).toBe("facebook");
    expect(row()!.action_details.destination_name).toBe("Candle by Qaaf");
  });

  it("THE AGREED TEXT IS composePost's TEXT, the same the card composes", async () => {
    // The 8 October bug was two composers. A row built by a third
    // function would reintroduce it: the hashtags live in a separate
    // field and only composePost joins them on.
    const r: any = await run();
    const expected = composePost(r).text;
    expect(row()!.action_details.expect_text).toBe(expected);
    // And it really does include the hashtags, so this is not passing on
    // a trivially equal pair of plain strings.
    expect(expected).toContain("#candles");
    expect(row()!.action_details.expect_text).toContain("#candles");
  });

  it("the card's payload carries the SAME text and the row's id", async () => {
    const r: any = await run();
    const card = extractArtifact("generate_content", { contentType: "facebook_post" }, r)!;
    expect(card.publish!.payload.expect_text).toBe(row()!.action_details.expect_text);
    expect(card.publish!.payload.approval_id).toBe("pending_approvals-1");
  });

  it("the row stores the words the owner will read", async () => {
    await run();
    expect(row()!.action_details.confirm).toMatch(/posts publicly/i);
    expect(row()!.action_details.confirm).toMatch(/Candle by Qaaf/);
  });
});

describe("NO ROW WHERE THERE SHOULD BE NONE", () => {
  it("AN UNCONNECTED DESTINATION GETS NO ROW", async () => {
    // Writing one would mean an approval record for something that
    // cannot happen, and the card gives no button either.
    destinations = { facebook: { ...FB, connected: false, name: null }, instagram: IG_OFF, anyConnected: false };
    await run();
    expect(row()).toBeNull();
  });

  it("a content type that is not a social post gets no row", async () => {
    destinations = null;
    await run("blog_seo");
    expect(row()).toBeNull();
  });

  it("an empty caption gets no row", async () => {
    // Nothing to agree to.
    generated = { text: "   " };
    await run();
    expect(row()).toBeNull();
  });

  it("and no row means the card has no approval id", async () => {
    destinations = { facebook: { ...FB, connected: false, name: null }, instagram: IG_OFF, anyConnected: false };
    const r: any = await run();
    const card = extractArtifact("generate_content", { contentType: "facebook_post" }, r)!;
    expect(card.publish).toBeUndefined();
  });
});
