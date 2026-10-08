// The endpoint where the money is actually spent.
//
// The chat tool only quotes now; this is what the button calls, and it
// is also what the Graphic Design page calls. Two things were wrong with
// it on 8 October 2026:
//
//   - it never checked the hold, so gating only the chat tool would have
//     left the spending path wide open;
//   - it called generateGraphic WITHOUT the business facts, so
//     buildImageBrief had nothing to anchor to and productDepictionFor
//     returned "not_applicable" — the guard that stops an invented
//     product being drawn did not apply on this path at all.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const HELD = "NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED";

const generateGraphic = vi.fn(async (..._a: any[]) => Buffer.from("png"));
vi.mock("@/lib/agents/graphicDesignAgent", () => ({
  generateGraphic: (...a: any[]) => generateGraphic(...a),
}));
vi.mock("@/lib/usage/generationLimits", () => ({
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
  generationLimitMessage: () => "over the cap",
}));

let tables: Record<string, any[]>;
// The same shape the other suites use, because gatherBusinessFacts
// reads a dozen tables with a dozen filter verbs and a thinner stub
// makes it throw — which is itself how facts silently became null.
function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Record<string, any> = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, lte: () => api, gt: () => api, order: () => api,
      limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api, or: () => api, range: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Record<string, any>) => ((op = "insert"), (values = v), api),
      update: (v: Record<string, any>) => ((op = "update"), (values = v), api),
      delete: () => ((op = "delete"), api),
      single: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: op === "insert" ? { id: `${table}-1`, ...values } : rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (t: string) => db().from(t),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/made.png" } }),
      }),
    },
  }),
}));

import { POST as generate } from "@/app/api/graphic-design/generate/route";

const call = (body: any) =>
  generate(new Request("https://hawlai.online/api/graphic-design/generate", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  generateGraphic.mockClear();
  delete process.env[HELD];
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "Candle by Qaaf", business_category: "Home fragrance" }],
    products: [
      { id: "p1", name: "Lavender Soy Wax Candle", price: 550, description: "Hand-poured soy wax", images: [], inventory_count: 5, is_active: true, order_index: 0 },
    ],
    brand_profiles: [{ tone_of_voice: "warm" }],
    brand_kits: [],
    websites: [],
    business_knowledge: [],
    graphic_designs: [],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    website_pages: [], team_members: [], business_memory: [], content_pieces: [],
  };
});
afterEach(() => delete process.env[HELD]);

describe("the hold holds where the money is spent", () => {
  it("HELD: nothing is generated, and it is not reported as a plan problem", async () => {
    const res = await call({ designType: "poster", prompt: "Christmas poster" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.unavailable).toBe(true);
    expect(body.error).not.toMatch(/upgrade/i);
    expect(generateGraphic).not.toHaveBeenCalled();
  });

  it("lifted: it generates", async () => {
    process.env[HELD] = "true";
    const res = await call({ designType: "poster", prompt: "Christmas poster" });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://cdn.example/made.png");
    expect(generateGraphic).toHaveBeenCalledTimes(1);
  });
});

describe("the depiction guard applies on this path too", () => {
  it("THE FACTS REACH THE GENERATOR — they used not to", async () => {
    process.env[HELD] = "true";
    await call({ designType: "poster", prompt: "Christmas poster" });
    // The 9th argument is the canonical facts. Absent, it made
    // productDepictionFor answer "not_applicable" on this path, so the
    // product-depiction rule never got into the brief.
    const facts = generateGraphic.mock.calls[0][8] as any;
    expect(facts).toBeTruthy();
    expect(facts.products[0].name).toBe("Lavender Soy Wax Candle");
  });

  it("and an unbacked claim in the brief is stripped before it is painted on", async () => {
    process.env[HELD] = "true";
    const res = await call({ designType: "poster", prompt: "Christmas poster. Free shipping." });
    const brief = generateGraphic.mock.calls[0][3] as string;
    expect(brief).not.toMatch(/Free shipping/);
    expect((await res.json()).leftOut.join(" ")).toMatch(/Free shipping/);
  });
});
