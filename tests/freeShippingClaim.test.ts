// "Free shipping" is never written for a store that charges shipping.
//
// THE LIVE CASE (2026-09-11): asked in chat for a Diwali Facebook post,
// Hawlai produced "Sirf ₹550 mein. Free shipping." for candle_by_qaaf,
// whose shipping is a flat ₹60. The guard's copy check existed, but the
// chat has two routes around it — the AI's own reply and the image brief
// it hands generate_graphic (an image model paints that text onto the
// picture) — and nothing tied "free shipping" to what checkout actually
// charges.
//
// Now: free shipping is allowed only when checkout's own shipping
// function (lib/shipping) charges ₹0; every phrasing is caught; the chat
// AI carries the store facts; and image briefs are checked like copy.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const rows = () => (op === "insert" ? [{ id: `${table}-1`, ...values }] : tables[table] ?? []);
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, or: () => api,
      update: (v: Row) => ((op = "update"), (values = v), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

// candle_by_qaaf as it really is: one ₹550 candle, flat ₹60 shipping.
const STORE = (shipping: Row = { shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, ...shipping }],
  website_pages: [],
  products: [{ name: "Lavender candle", price: 550, description: "Hand-poured soy wax" }],
  discount_codes: [],
  orders: [{ status: "delivered", created_at: new Date().toISOString() }],
  brand_profiles: [],
});

/** Anthropic answering every call with `reply`; records each request's system prompt and user prompt. */
function anthropic(reply: unknown) {
  const calls: { system: string; prompt: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: any): Promise<any> => {
      if (!String(url).includes("anthropic")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
      const body = JSON.parse(init.body);
      const first = body.messages?.[0]?.content;
      calls.push({ system: String(body.system ?? ""), prompt: typeof first === "string" ? first : JSON.stringify(first) });
      const payload: any = typeof reply === "string" ? { content: [{ type: "text", text: reply }] } : { content: [{ type: "text", text: JSON.stringify(reply) }] };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
    })
  );
  return calls;
}

const generateGraphic = vi.fn(async (..._a: any[]) => Buffer.from("png"));
vi.mock("@/lib/agents/graphicDesignAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/graphicDesignAgent")>()),
  generateGraphic: (...a: any[]) => generateGraphic(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => db().from("x"),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/diwali.png" } }) }) },
  }),
}));
vi.mock("@/lib/usage/generationLimits", async (orig) => ({
  ...(await orig<typeof import("@/lib/usage/generationLimits")>()),
  checkAndRecordGenerationUsage: async () => ({ allowed: true }),
}));
vi.mock("@/lib/plans", async (orig) => ({
  ...(await orig<typeof import("@/lib/plans")>()),
  getDealershipPlanLimits: async () => ({}),
  hasFeature: () => true,
  killSwitchFor: () => null,
}));

import { executeTool, runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";
import { computeShippingAmount } from "@/lib/shipping";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const FREE = /free\s+(?:shipping|delivery)|shipping\s+free/i;

beforeEach(() => {
  tables = STORE();
  generateGraphic.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the live case, through the real chat tools", () => {
  it("generate_content (Facebook post): 'Free shipping.' is removed, 'Sirf ₹550 mein.' stays, and the owner is told why", async () => {
    anthropic({ text: "Is Diwali, ghar ko khushboo se bhar do. 🪔 Lavender candle — sirf ₹550 mein. Free shipping. Order via link in bio!" });
    const result = await executeTool(db(), CTX, "generate_content", { contentType: "facebook_post", topic: "Diwali sale" }, "");

    expect(result.text).toBe("Is Diwali, ghar ko khushboo se bhar do. 🪔 Lavender candle — sirf ₹550 mein. Order via link in bio!");
    expect(result._claimsNote).toMatch(/Free shipping.*₹60 flat/);
  });

  it("generate_graphic: 'Free shipping' never reaches the image model, and the owner is told it was left out", async () => {
    anthropic({});
    const result = await executeTool(db(), CTX, "generate_graphic", { designType: "poster", prompt: "Diwali poster for the Lavender candle. Sirf ₹550 mein. Free shipping." }, "");

    const brief = generateGraphic.mock.calls[0][3] as string;
    expect(brief).toBe("Diwali poster for the Lavender candle. Sirf ₹550 mein.");
    expect(result._claimsNote).toMatch(/₹60 flat/);
    expect(result.note).toMatch(/Left out of the image/);
  });

  it("the chat AI itself is told the real shipping — for its replies and every brief it writes", async () => {
    const calls = anthropic("Here's your Diwali post.");
    await runMasterBrainChat(db(), "d1", [], "Diwali sale ke liye ek social media post banao");
    const system = calls[0].system;
    expect(system).toContain("Shipping: ₹60 flat on every order (NOT free)");
    expect(system).toMatch(/cover your own replies and every tool brief, image prompts included/);
  });
});

describe("no guarded department can say it", () => {
  const LINE = "Lavender candle, ₹550. Free shipping on every order. Order today.";

  it.each([
    ["Content — Facebook post", async (f: any) => JSON.stringify((await generateContent("facebook_post", "c", "Home fragrance", "Diwali", null, undefined, undefined, f)).output)],
    ["Email — promotional", async (f: any) => JSON.stringify((await generateEmailContent("promotional", "c", "Home fragrance", "Diwali", null, undefined, undefined, f)).output)],
    ["WhatsApp — promotion", async (f: any) => JSON.stringify((await generateWhatsappContent("promotion", "c", "Home fragrance", "Diwali", null, undefined, undefined, f)).output)],
    ["Social — caption", async (f: any) => (await generateSocialCaption("Diwali", null, "Home fragrance", undefined, f)).caption],
  ])("%s", async (_name, run) => {
    anthropic({ text: LINE, caption: LINE, message: LINE, subject: "Diwali is here", previewText: "Light it up", body: LINE });
    const facts = await gatherBusinessFacts(db(), "d1");
    const out = await run(facts);
    // The copy itself — the owner-facing _claimsNote deliberately names what was removed.
    const copy = out.replace(/"_claimsNote":"(?:[^"\\]|\\.)*"/, "");
    expect(copy).not.toMatch(FREE);
    expect(copy).toContain("Order today.");
  });
});

describe("every way of saying it is caught", () => {
  it.each([
    "Sirf ₹550 mein. Free shipping.",
    "Free delivery all over India!",
    "Free home delivery this Diwali",
    "Shipping bilkul free hai",
    "Delivery is free on every order",
    "No shipping charges this festive season",
    "Zero delivery fees",
    "Ships free across India",
  ])("%j", async (text) => {
    const facts = await gatherBusinessFacts(db(), "d1");
    expect(findUnsupportedClaims(text, facts).join(" ")).toMatch(/₹60 flat/);
  });

  it("…and the rest of the sentence set survives", async () => {
    const facts = await gatherBusinessFacts(db(), "d1");
    expect(stripUnsupported("Sirf ₹550 mein. Free shipping.", facts).text).toBe("Sirf ₹550 mein.");
  });
});

describe("allowed exactly when checkout charges ₹0 — decided by checkout's own shipping function", () => {
  const CASES: [string, Row, boolean][] = [
    ["always free", { shipping_mode: "free", shipping_rate: null, shipping_free_threshold: null }, true],
    ["mode never set (checkout treats it as free)", { shipping_mode: null, shipping_rate: 60, shipping_free_threshold: null }, true],
    ["flat ₹60", { shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }, false],
    ["free above ₹999, candle is ₹550", { shipping_mode: "free_above", shipping_rate: 60, shipping_free_threshold: 999 }, false],
    ["free above ₹500, candle is ₹550", { shipping_mode: "free_above", shipping_rate: 60, shipping_free_threshold: 500 }, true],
  ];

  it.each(CASES)("%s", async (_name, shipping, allowed) => {
    tables = STORE(shipping);
    const facts = await gatherBusinessFacts(db(), "d1");
    const flagged = findUnsupportedClaims("Free shipping on your order!", facts).length > 0;
    expect(flagged).toBe(!allowed);
    // …and that is exactly what checkout charges for the ₹550 candle.
    expect(computeShippingAmount(shipping, 550) === 0).toBe(allowed);
  });

  it("a free-above store may say it with its real threshold, never without it", async () => {
    tables = STORE({ shipping_mode: "free_above", shipping_rate: 60, shipping_free_threshold: 999 });
    const facts = await gatherBusinessFacts(db(), "d1");
    expect(findUnsupportedClaims("Free shipping on orders above ₹999", facts)).toEqual([]);
    expect(findUnsupportedClaims("Free shipping above ₹500", facts).length).toBeGreaterThan(0);
  });
});
