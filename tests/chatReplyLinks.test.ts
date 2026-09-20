// The link the owner actually SEES in the chat reply (2026-09-21).
//
// tests/bookingLink.test.ts pins the guard. This one runs the real chat
// turn — runMasterBrainChat, its own system prompt, its own return path —
// with the model replying in prose exactly as it did live, and reads the
// URL out of the rendered reply. The live bug was in that last step: the
// guards all sat on tool results, and this text never passed through one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    let op = "select";
    let payload: any = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = (single: boolean) => {
      if (op === "insert" || op === "update") return { data: payload, error: null };
      const found = rows();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, lt: () => api, lte: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api, or: () => api, range: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), api),
      insert: (v: any) => ((op = "insert"), (payload = v), api),
      update: (v: any) => ((op = "update"), (payload = v), api),
      upsert: (v: any) => ((op = "insert"), (payload = v), api),
      delete: () => ((op = "delete"), api),
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { runMasterBrainChat } from "@/lib/agents/masterBrainV2";

const BOOKING = "https://calendly.com/candlebyqaaf/workshop";

/** The model answers in prose, calling no tool — the shape of the live bug. */
function modelSays(text: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!String(url).includes("anthropic")) return new Response("{}", { status: 404 });
    return new Response(
      JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }),
      { status: 200 }
    );
  }));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  tables = {
    dealerships: [{ id: "d1", dealership_name: "Candle by Qaaf", business_category: "Home fragrance", city: "Shahjahanpur", booking_slug: "candle-by-qaaf", business_models: ["products", "services"] }],
    websites: [{ id: "w1", dealership_id: "d1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    products: [{ id: "p1", dealership_id: "d1", name: "Candle Making Workshop", kind: "service", price: 800, duration_minutes: 90, booking_url: BOOKING, images: [], is_active: true }],
    brand_profiles: [{ dealership_id: "d1", tone_of_voice: "warm", messaging_pillars: [], preferred_language: "english" }],
    business_knowledge: [], business_memory: [], team_members: [], orders: [], leads: [],
    page_events: [], abandoned_carts: [], discount_codes: [], website_pages: [],
    api_usage_logs: [], daily_message_usage: [], content_pieces: [],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the reply the owner reads", () => {
  it("THE LIVE CASE: 'Book here' renders the workshop's own URL, not Calendly's front door", async () => {
    modelSays(
      "Here's a short one:\n\nKhud banao. Khud le jaao. ₹800 · 90 minutes. [Book here](https://calendly.com)"
    );
    const { reply } = await runMasterBrainChat(db(), "d1", [], "chhota punchy caption banao workshop ke liye");

    const rendered = reply.match(/\[Book here\]\(([^)]+)\)/)?.[1];
    // The whole address, path included — a check for "is there a link" or
    // "is the host calendly.com" passes on the broken version.
    expect(rendered).toBe(BOOKING);
    expect(reply).not.toContain("](https://calendly.com)");
    // And the owner is told it was changed.
    expect(reply).toContain("wasn't yours");
  });

  it("a reply with the right link is passed through word for word", async () => {
    const text = `Slots yahan hain: [Book your slot](${BOOKING})`;
    modelSays(text);
    const { reply } = await runMasterBrainChat(db(), "d1", [], "booking link do");
    expect(reply).toBe(text);
  });

  it("a reply with no links is untouched", async () => {
    modelSays("Diwali se pehle do posts chalao — ek story, ek offer.");
    const { reply } = await runMasterBrainChat(db(), "d1", [], "kya karun");
    expect(reply).toBe("Diwali se pehle do posts chalao — ek story, ek offer.");
  });
});
