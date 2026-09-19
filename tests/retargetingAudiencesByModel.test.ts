// Retargeting R2 (2026-09-20): audiences by how the business makes money.
//
// The four audiences were a shop's — cart, viewed, buyers, lookalike. Now:
//   products      cart, viewed (pixel); lapsed buyers, customers (lists); lookalike
//   services      opened the booking page, didn't book (pixel); enquired, didn't book (list)
//   subscription  members gone quiet (list)
//   b2b           engaged, not converted (list)
// Lists come from the business's own records, each person once, with
// opted-out people removed, and are REPLACED in Meta every sync.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { metaUserTokenWrite } from "@/lib/crypto/oauthSecrets";
import { hashPhone, hashEmail } from "@/lib/ads/audienceHashing";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "upsert" = "select";
  let payload: Row | null = null;
  const run = () => {
    if (op === "upsert") {
      const rows = (tables[table] ??= []);
      const i = rows.findIndex((r) => r.dealership_id === payload!.dealership_id && r.audience_key === payload!.audience_key);
      if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ id: `${table}-${rows.length + 1}`, ...payload });
      return { data: null, error: null };
    }
    return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null };
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api, not: () => api, is: () => api,
    upsert: (p: Row) => ((op = "upsert"), (payload = p), api),
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), api),
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), api),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), api),
    gte: (c: string, v: any) => (filters.push((r) => String(r[c]) >= String(v)), api),
    // buildSuppressionList: dnd_opt_out.eq.true,consent_status.eq.withdrawn
    or: () => (filters.push((r) => r.dnd_opt_out === true || r.consent_status === "withdrawn"), api),
    single: async () => ({ data: run().data?.[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) }, from: (t: string) => query(t) });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => client() }));

import { audiencesFor, listMembers, AUDIENCES, LAPSED_BUYER_DAYS, LAPSED_MEMBER_DAYS, ENQUIRY_DAYS, B2B_ENGAGED_DAYS } from "@/lib/retargeting/audiences";
import { replaceAudienceUsers, REPLACE_BATCH } from "@/lib/ads/metaCustomAudiences";
import { GET, POST } from "@/app/api/retargeting/audiences/route";
import { GET as dashboard } from "@/app/api/retargeting/dashboard/route";
import { GET as bookingPage } from "@/app/api/public/book/route";

const NOW = Date.parse("2026-09-20T06:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function seed(models: string[] | null, over: Row = {}) {
  tables = {
    profiles: [{ id: "owner-1", dealership_id: "d1" }],
    dealerships: [
      { id: "d1", owner_id: "owner-1", fb_ad_account_id: "123", meta_pixel_id: "px1", booking_slug: "glow-salon", business_models: models, ...metaUserTokenWrite("user-token", 60 * 86_400), ...over },
      { id: "d2", owner_id: "owner-2" },
    ],
    products: [],
    orders: [],
    leads: [],
    calls: [],
    appointments: [],
    meta_custom_audiences: [],
    abandoned_carts: [],
    page_events: [],
  };
}

let calls: { url: string; body: any }[];
function meta(reply: (url: string) => { status: number; body: any } = () => ({ status: 200, body: { id: "aud-1", approximate_count_lower_bound: 1000 } })) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    const r = reply(url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
}
const post = (audienceKey: string) => POST(new Request("https://hawlai.test/api/retargeting/audiences", { method: "POST", body: JSON.stringify({ audienceKey }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  meta();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which audiences a business gets", () => {
  const keys = (models: any[]) => audiencesFor(models).map((a) => a.key);

  it("by how it makes money — and a shop's set when that isn't known", () => {
    expect(keys(["products"])).toEqual(["abandoned_cart", "viewed_no_purchase", "lapsed_buyers", "buyers", "buyers_lookalike"]);
    expect(keys(["services"])).toEqual(["booking_visitors", "enquired_not_booked"]);
    expect(keys(["subscription"])).toEqual(["lapsed_members"]);
    expect(keys(["b2b"])).toEqual(["engaged_not_converted"]);
    expect(keys(["services", "products"])).toEqual(["abandoned_cart", "viewed_no_purchase", "lapsed_buyers", "buyers", "buyers_lookalike", "booking_visitors", "enquired_not_booked"]);
    expect(keys([])).toEqual(keys(["products"]));
  });

  it("every audience has a distinct Meta name, and every model has at least one", () => {
    expect(new Set(AUDIENCES.map((a) => a.name)).size).toBe(AUDIENCES.length);
    for (const m of ["products", "services", "subscription", "b2b"]) expect(keys([m]).length).toBeGreaterThan(0);
  });
});

describe("who is on each list — from this business's own records", () => {
  beforeEach(() => seed(["products"]));

  it("lapsed buyers: whose LAST order is older than the window — one recent order keeps someone off", async () => {
    tables.orders = [
      { dealership_id: "d1", customer_phone: "9876500001", customer_email: null, status: "paid", created_at: ago(LAPSED_BUYER_DAYS + 10) },
      { dealership_id: "d1", customer_phone: "9876500002", customer_email: null, status: "paid", created_at: ago(LAPSED_BUYER_DAYS + 10) },
      { dealership_id: "d1", customer_phone: "9876500002", customer_email: null, status: "paid", created_at: ago(5) },
      { dealership_id: "d1", customer_phone: "9876500003", customer_email: null, status: "cancelled", created_at: ago(90) },
      { dealership_id: "d2", customer_phone: "9876500004", customer_email: null, status: "paid", created_at: ago(90) },
    ];
    expect((await listMembers(client(), "d1", "lapsed_buyers", NOW)).map((m) => m.phone)).toEqual(["9876500001"]);
  });

  it("customers: each person once, however their number was written", async () => {
    tables.orders = [
      { dealership_id: "d1", customer_phone: "+91 98765 00001", customer_email: null, status: "paid", created_at: ago(3) },
      { dealership_id: "d1", customer_phone: "9876500001", customer_email: null, status: "paid", created_at: ago(2) },
      { dealership_id: "d1", customer_phone: null, customer_email: "A@Example.com", status: "paid", created_at: ago(2) },
      { dealership_id: "d1", customer_phone: null, customer_email: "a@example.com ", status: "paid", created_at: ago(1) },
    ];
    expect(await listMembers(client(), "d1", "buyers", NOW)).toHaveLength(2);
  });

  it("enquired, not booked: new, queued or contacted, in the window — never booked, won, lost or merged", async () => {
    const lead = (phone: string, status: string, days: number, over: Row = {}) => ({ dealership_id: "d1", phone, email: null, status, created_at: ago(days), merged_into_lead_id: null, ...over });
    tables.leads = [
      lead("9000000001", "new", 2),
      lead("9000000002", "ready_to_call", 2),
      lead("9000000003", "called", 2),
      lead("9000000004", "appointment_set", 2),
      lead("9000000005", "converted", 2),
      lead("9000000006", "not_interested", 2),
      lead("9000000007", "new", ENQUIRY_DAYS + 1),
      lead("9000000008", "new", 2, { merged_into_lead_id: "x" }),
      lead("9000000009", "new", 2, { dealership_id: "d2" }),
    ];
    expect((await listMembers(client(), "d1", "enquired_not_booked", NOW)).map((m) => m.phone)).toEqual(["9000000001", "9000000002", "9000000003"]);
  });

  it("engaged, not converted (B2B): contacted or meeting booked, in a longer window", async () => {
    tables.leads = [
      { dealership_id: "d1", phone: "9100000001", status: "called", created_at: ago(B2B_ENGAGED_DAYS - 5) },
      { dealership_id: "d1", phone: "9100000002", status: "appointment_set", created_at: ago(10) },
      { dealership_id: "d1", phone: "9100000003", status: "new", created_at: ago(10) },
      { dealership_id: "d1", phone: "9100000004", status: "converted", created_at: ago(10) },
      { dealership_id: "d1", phone: "9100000005", status: "called", created_at: ago(B2B_ENGAGED_DAYS + 5) },
    ];
    expect((await listMembers(client(), "d1", "engaged_not_converted", NOW)).map((m) => m.phone)).toEqual(["9100000001", "9100000002"]);
  });

  it("members gone quiet: last order past the window, or a customer not touched in it — not someone who ordered lately", async () => {
    vi.useRealTimers(); // the churn list reads the real clock
    const real = Date.now();
    const back = (d: number) => new Date(real - d * 86_400_000).toISOString();
    tables.orders = [
      { dealership_id: "d1", customer_phone: "9200000001", customer_email: null, status: "paid", created_at: back(LAPSED_MEMBER_DAYS + 5) },
      { dealership_id: "d1", customer_phone: "9200000002", customer_email: null, status: "paid", created_at: back(3) },
    ];
    tables.leads = [
      { id: "l1", dealership_id: "d1", name: "Old member", phone: "9200000003", status: "converted", created_at: back(LAPSED_MEMBER_DAYS + 20) },
      { id: "l2", dealership_id: "d1", name: "Recent orderer", phone: "9200000002", status: "converted", created_at: back(LAPSED_MEMBER_DAYS + 20) },
      { id: "l3", dealership_id: "d1", name: "New member", phone: "9200000004", status: "converted", created_at: back(5) },
    ];
    const phones = (await listMembers(client(), "d1", "lapsed_members", real)).map((m) => m.phone).sort();
    expect(phones).toEqual(["9200000001", "9200000003"]);
  });
});

describe("syncing — replaced, not appended", () => {
  it("a list replaces everyone in Meta with the people on it now, hashed, opted-out people left out", async () => {
    seed(["services"]);
    tables.leads = [
      { dealership_id: "d1", phone: "9000000001", email: "a@x.in", status: "new", created_at: ago(2) },
      { dealership_id: "d1", phone: "9000000002", email: null, status: "called", created_at: ago(2), dnd_opt_out: true },
    ];
    const res = await post("enquired_not_booked");
    expect(res.status).toBe(200);
    const replace = calls.find((c) => c.url.includes("/usersreplace"))!;
    expect(replace.url).toContain("/aud-1/usersreplace");
    expect(replace.body.payload).toEqual({ schema: ["PHONE", "EMAIL"], data: [[hashPhone("9000000001"), hashEmail("a@x.in")]] });
    expect(replace.body.session).toMatchObject({ batch_seq: 1, last_batch_flag: true, estimated_num_total: 1 });
    expect(replace.body.access_token).toBe("user-token");
    expect(calls.some((c) => /\/users(\?|$)/.test(c.url))).toBe(false);
    expect(tables.meta_custom_audiences[0]).toMatchObject({ dealership_id: "d1", audience_key: "enquired_not_booked", audience_type: "customer_list", sync_status: "synced", sync_error: null });
  });

  it("more than one batch: one session, numbered batches, the last flagged", async () => {
    meta(() => ({ status: 200, body: { success: true } }));
    const rows = Array.from({ length: REPLACE_BATCH + 5 }, (_, i) => ({ phoneHash: `h${i}`, emailHash: null }));
    const r = await replaceAudienceUsers({ audienceId: "aud-9", accessToken: "t", rows, sessionId: 42 });
    expect(r).toMatchObject({ success: true, sent: REPLACE_BATCH + 5 });
    expect(calls.map((c) => c.body.session)).toEqual([
      { session_id: 42, batch_seq: 1, last_batch_flag: false, estimated_num_total: REPLACE_BATCH + 5 },
      { session_id: 42, batch_seq: 2, last_batch_flag: true, estimated_num_total: REPLACE_BATCH + 5 },
    ]);
    expect(calls[1].body.payload.data).toHaveLength(5);
  });

  it("nobody on the list: nothing is sent, and the row says Meta still has the last sync's people", async () => {
    seed(["services"]);
    tables.meta_custom_audiences = [{ dealership_id: "d1", audience_key: "enquired_not_booked", meta_audience_id: "aud-7" }];
    await post("enquired_not_booked");
    expect(calls.some((c) => c.url.includes("usersreplace"))).toBe(false);
    expect(tables.meta_custom_audiences[0]).toMatchObject({ sync_status: "synced", sync_error: "Nobody is in this group right now. Meta still has the people from the last sync — pause any campaign aimed at it." });
  });

  it("only an audience for how the business makes money can be synced", async () => {
    seed(["b2b"]);
    const res = await post("abandoned_cart");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That audience isn't one for how your business makes money.");
    expect(calls).toEqual([]);
  });
});

describe("the services audience from the pixel: opened the booking page, didn't book", () => {
  it("is ruled in Meta as a visit to this business's booking page, minus anyone who booked", async () => {
    seed(["services"]);
    await post("booking_visitors");
    const create = calls.find((c) => c.url.includes("/act_123/customaudiences"))!;
    expect(create.body.rule.inclusions.rules[0].filter.filters).toEqual([
      { field: "event", operator: "eq", value: "PageView" },
      { field: "url", operator: "i_contains", value: "/book/glow-salon" },
    ]);
    expect(create.body.rule.exclusions.rules[0].filter.filters).toEqual([{ field: "event", operator: "eq", value: "Schedule" }]);
  });

  it("without a booking page, or a pixel, it says what's missing — and the lists still work", async () => {
    seed(["services"], { booking_slug: null, meta_pixel_id: null });
    const body = await (await GET()).json();
    expect(body.ready).toBe(true);
    const visitors = body.audiences.find((a: any) => a.key === "booking_visitors");
    expect(visitors.blocked).toBe("Add your Meta Pixel ID in Integrations first — this audience is built from pixel activity.");
    expect(body.audiences.find((a: any) => a.key === "enquired_not_booked").blocked).toBeNull();
    expect((await post("booking_visitors")).status).toBe(400);
    expect(calls).toEqual([]);

    seed(["services"], { booking_slug: null });
    const noPage = (await (await GET()).json()).audiences.find((a: any) => a.key === "booking_visitors");
    expect(noPage.blocked).toBe("Set up your booking page first — this audience is the people who open it.");
  });

  it("the booking page loads the business's pixel (after consent) and tells Meta about a booking", async () => {
    seed(["services"]);
    const res = await bookingPage(new Request("https://hawlai.test/api/public/book?slug=glow-salon"));
    expect((await res.json()).metaPixelId).toBe("px1");
    const page = readFileSync("src/app/book/[slug]/page.tsx", "utf8");
    expect(page).toContain("const tracking = pixelId ? <TrackingScripts metaPixelId={pixelId} /> : null;");
    expect(page).toMatch(/if \(!res\.ok\) throw new Error\(data\.error \?\? "Booking failed"\);\s*trackSchedule\(\);\s*setDone\(true\);/);
  });

  it("the Schedule event goes to the pixel when one is loaded — and nowhere when it isn't", async () => {
    const { trackSchedule } = await import("@/lib/pixelEvents");
    const fbq = vi.fn();
    vi.stubGlobal("window", { fbq });
    trackSchedule();
    expect(fbq).toHaveBeenCalledWith("track", "Schedule", {});
    vi.stubGlobal("window", {});
    expect(() => trackSchedule()).not.toThrow();
  });
});

describe("the page and the dashboard follow the business model", () => {
  it("GET lists this business's audiences and says whether the model was guessed", async () => {
    seed(null);
    tables.products = [{ dealership_id: "d1", kind: "service", is_active: true }];
    const body = await (await GET()).json();
    expect(body).toMatchObject({ models: ["services"], modelsGuessed: true });
    expect(body.audiences.map((a: any) => a.key)).toEqual(["booking_visitors", "enquired_not_booked"]);
  });

  it("the dashboard counts each list the way it's synced — each person once, opted-out people out; pixel-only has no count of ours", async () => {
    seed(["services"]);
    tables.leads = [
      { dealership_id: "d1", phone: "9000000001", status: "new", created_at: ago(2) },
      { dealership_id: "d1", phone: "+91 90000 00001", status: "called", created_at: ago(1) },
      { dealership_id: "d1", phone: "9000000002", status: "new", created_at: ago(2), consent_status: "withdrawn" },
      { dealership_id: "d1", phone: "9000000003", status: "new", created_at: ago(2) },
    ];
    const body = await (await dashboard()).json();
    expect(body.segments.map((s: any) => [s.key, s.count])).toEqual([["booking_visitors", null], ["enquired_not_booked", 2]]);
  });

  it("an ad draft can be made for every non-lookalike audience", () => {
    const route = readFileSync("src/app/api/retargeting/campaign/route.ts", "utf8");
    for (const a of AUDIENCES) expect(route).toContain(`  ${a.key}: {`);
  });
});
