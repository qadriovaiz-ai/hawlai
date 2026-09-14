// A festive request that doesn't name a festival gets the right one,
// named.
//
// THE LIVE CASE (2026-09-15): asked for "a festive promo email" during
// Ganesh Chaturthi, chat wrote "Iss Tyohaar Mein" ("this festival") and
// never named it. The Season facts listed Ganesh Chaturthi as happening
// now, but the only festival rule was a restriction, so a vague hedge was
// the model's safe choice. Now code decides which festival an unnamed
// festive request means, every generator's topic says so, and chat can't
// offer an email that still hedges.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, or: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      ilike: (k: string, p: string) => (filters.push((r) => String(r[k] ?? "").toLowerCase() === p.replace(/\\(.)/g, "$1").toLowerCase()), api),
      insert: () => api, upsert: () => api, update: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

const MIGRATION = readFileSync(join(__dirname, "../supabase/migrations/180_seasonal_events_india_2026_27.sql"), "utf-8");
const FESTIVALS = Array.from(MIGRATION.matchAll(/\('([^']+)',\s*'(\d{4}-\d{2}-\d{2})',\s*(\d+),/g)).map((m) => ({ name: m[1], event_date: m[2], lead_time_days: Number(m[3]) }));

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow", business_address: "12 Hazratganj, Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, is_active: true }],
  discount_codes: [],
  orders: [],
  leads: [{ id: "L1", dealership_id: "d1", email: "asha@example.com" }],
  email_suppressions: [],
  seasonal_events: FESTIVALS,
});

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));

import { featuredFestival, resolveFestiveTopic, vagueFestiveWording, seasonFor, formatSeason, SEASON_TRUTH_RULE } from "@/lib/expertise/seasonalCalendar";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";
import { executeTool } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const season = (day: string) => seasonFor(FESTIVALS, day);

function anthropic(reply: unknown) {
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      const text = typeof reply === "string" ? reply : JSON.stringify(reply);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => JSON.stringify({ content: [{ type: "text", text }] }) };
    })
  );
  return prompts;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T06:00:00Z"));
  tables = STORE();
  sendDealerEmail.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which festival a festive request means", () => {
  it("15 Sep 2026: Ganesh Chaturthi, happening now", () => {
    expect(featuredFestival(season("2026-09-15"))).toMatchObject({ when: "now", event: { name: "Ganesh Chaturthi", date: "2026-09-14" } });
  });

  it("30 Sep 2026, nothing on but three campaign windows open: the nearest — Sharad Navratri", () => {
    const s = season("2026-09-30");
    expect(s.now).toEqual([]);
    expect(s.launchNow.map((e) => e.name)).toEqual(["Sharad Navratri", "Durga Puja", "Dussehra"]);
    expect(featuredFestival(s)).toMatchObject({ when: "window", event: { name: "Sharad Navratri" } });
  });

  it("20 Oct 2026, three festivals on at once: the most recent — Dussehra", () => {
    expect(featuredFestival(season("2026-10-20"))?.event.name).toBe("Dussehra");
  });

  it("a quiet week (1 Jul 2027): none", () => {
    expect(featuredFestival(season("2027-07-01"))).toBeNull();
  });
});

describe("the topic every generator is given", () => {
  it.each(["festive promo email", "Festival offer for our candles", "iss tyohaar ke liye offer", "tyohar special post", "त्योहार ऑफर"])("%j gets Ganesh Chaturthi named", (topic) => {
    expect(resolveFestiveTopic(topic, season("2026-09-15"))).toBe(
      `${topic} — for Ganesh Chaturthi (happening now, 14 Sept). Name Ganesh Chaturthi explicitly; never write a vague "this festival" / "iss tyohaar".`
    );
  });

  it.each(["Diwali promo", "festive Ganpati post", "summer sale", "new Lavender candle launch", ""])("%j is left as it is", (topic) => {
    expect(resolveFestiveTopic(topic, season("2026-09-15"))).toBe(topic);
  });

  it("with no festival on, a festive request becomes a regular promotion, not a vague festive one", () => {
    expect(resolveFestiveTopic("festive promo", season("2027-07-01"))).toContain("don't write a vague festive message; write a regular promotion");
  });

  it("the Season facts and truth rules say the same, for chat and every generator", () => {
    expect(formatSeason(season("2026-09-15"))).toContain(
      '- A festive or festival request that doesn\'t name a festival means Ganesh Chaturthi (happening now, 14 Sept): name Ganesh Chaturthi in the copy. Never write a vague "this festival" / "iss tyohaar".'
    );
    expect(SEASON_TRUTH_RULE).toContain("Festive copy always names its festival");
  });
});

describe("the live case, through the real generators", () => {
  it.each([
    ["email", async (f: any) => generateEmailContent("promotional", "candle_by_qaaf", "Home fragrance", "festive promo email", null, undefined, undefined, f)],
    ["WhatsApp", async (f: any) => generateWhatsappContent("promotion", "candle_by_qaaf", "Home fragrance", "festive promo", null, undefined, undefined, f)],
    ["content", async (f: any) => generateContent("facebook_post", "candle_by_qaaf", "Home fragrance", "festive promo", null, undefined, undefined, f)],
    ["social caption", async (f: any) => generateSocialCaption("festive promo", null, "Home fragrance", undefined, f)],
  ])("%s: the prompt names Ganesh Chaturthi for a festive request", async (_name, run) => {
    const prompts = anthropic({ subject: "s", body: "b", message: "m", text: "t", caption: "c" });
    await run(await gatherBusinessFacts(db(), "d1"));
    expect(prompts[0]).toContain("festive promo");
    expect(prompts[0]).toContain("for Ganesh Chaturthi (happening now, 14 Sept). Name Ganesh Chaturthi explicitly");
  });
});

describe("chat can't offer an email that hedges", () => {
  it("the live email — 'Iss Tyohaar Mein' — is refused before a preview is made, naming the festival to use", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "asha@example.com", subject: "Iss Tyohaar Mein roshni", body: "Iss Tyohaar Mein ghar ko Lavender candle se roshan karein." }, "");
    expect(r.error).toBe(
      'Not sent: the email says "Tyohaar" without naming the festival — right now that\'s Ganesh Chaturthi (happening now, 14 Sept). Rewrite it naming the festival, or ask the owner which festival they meant.'
    );
    expect(r.proposed).toBeUndefined();
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("the same email naming Ganesh Chaturthi goes to the preview", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "asha@example.com", subject: "Ganesh Chaturthi roshni", body: "Is Ganesh Chaturthi, is tyohaar mein ghar ko Lavender candle se roshan karein." }, "");
    expect(r.proposed).toBe(true);
  });

  it("wording checks: named festivals and non-festive copy pass; a quiet week doesn't force a festival", () => {
    expect(vagueFestiveWording("Ganpati Bappa Morya — festive glow for your home", season("2026-09-15"))).toBeNull();
    expect(vagueFestiveWording("Slow evenings, hand-poured", season("2026-09-15"))).toBeNull();
    expect(vagueFestiveWording("A festive glow for your home", season("2027-07-01"))).toBeNull();
    expect(vagueFestiveWording("A festive glow for your home", season("2026-09-15"))).toContain("Ganesh Chaturthi");
  });
});
