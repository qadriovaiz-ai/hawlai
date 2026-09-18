// The business's name as people read it, everywhere — not the signup handle.
//
// THE LIVE CASE: the Marketing Strategy SWOT for candle_by_qaaf wrote
// "candle_by_qaaf" into its analysis. dealerships.dealership_name holds the
// handle the account was created with. Email already turned it into
// "Candle by Qaaf" (senderDisplayName), but nothing else did: the Strategy
// tools, chat, and every generator reading the business facts passed the
// raw handle to the model, which repeated it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { businessDisplayName } from "@/lib/business/displayName";
import { senderDisplayName } from "@/lib/email/resendClient";

describe("the name rule", () => {
  it.each([
    ["candle_by_qaaf", "Candle by Qaaf"],
    ["glow-studio", "Glow Studio"],
    ["the_bake_house", "The Bake House"],
    ["qaaf", "qaaf"], // one word: nothing to convert, kept as typed
    ["Candle by Qaaf", "Candle by Qaaf"], // typed with spaces: kept exactly
    ["ACME_Traders", "ACME_Traders"], // capitals: the owner's choice, kept
  ])("%s → %s", (input, expected) => {
    expect(businessDisplayName(input)).toBe(expected);
  });

  it("no name at all is 'the business', never an empty string", () => {
    expect(businessDisplayName(null)).toBe("the business");
    expect(businessDisplayName("   ")).toBe("the business");
  });

  it("email's From name is the same rule, still safe for a mail header", () => {
    expect(senderDisplayName("candle_by_qaaf")).toBe("Candle by Qaaf");
    expect(senderDisplayName('Evil"<x@y.z>\r\nBcc: a@b.c')).not.toMatch(/["<>\r\n]/);
    // Letters are never stripped — only header-breaking characters.
    expect(senderDisplayName("Rare Roots")).toBe("Rare Roots");
    expect(senderDisplayName(null)).toBe("Hawlai");
  });
});

// ---- the Strategy tools, through their real routes -----------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, not: () => api, is: () => api, in: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      insert: () => api, upsert: () => api, update: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

let prompts: string[];
beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Shahjahanpur", plan_tier: "max" }],
  };
  prompts = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: any, init?: any) => {
    if (init?.body) {
      try { prompts.push(JSON.parse(init.body).messages?.[0]?.content ?? ""); } catch { /* not a model call */ }
    }
    return new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }], usage: {} }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("the Strategy tools are told the real name", () => {
  it("Deep Strategy (SWOT): the prompt names Candle by Qaaf, never the handle", async () => {
    const { GET } = await import("@/app/api/strategy/deep/route");
    await GET(new Request("https://x.test/api/strategy/deep?regenerate=true")).catch(() => null);
    const prompt = prompts.find((p) => /SWOT|swot/.test(p)) ?? "";
    expect(prompt).toContain('"Candle by Qaaf"');
    expect(prompt).not.toContain("candle_by_qaaf");
  });

  it("Marketing Strategy plan: the prompt names Candle by Qaaf, never the handle", async () => {
    const { POST } = await import("@/app/api/strategy/route");
    await POST(new Request("https://x.test/api/strategy", { method: "POST", body: JSON.stringify({ monthly_budget: 10000, goal: "leads" }) })).catch(() => null);
    const prompt = prompts.find((p) => p.includes("Candle by Qaaf") || p.includes("candle_by_qaaf")) ?? "";
    expect(prompt).toContain("Candle by Qaaf");
    expect(prompt).not.toContain("candle_by_qaaf");
  });

  it("every generator reading the business facts gets the real name", async () => {
    const { gatherBusinessFacts, formatFactsForCopy } = await import("@/lib/claims/businessFacts");
    const f = await gatherBusinessFacts(db(), "d1");
    expect(f.businessName).toBe("Candle by Qaaf");
    expect(formatFactsForCopy(f)).not.toContain("candle_by_qaaf");
  });
});
