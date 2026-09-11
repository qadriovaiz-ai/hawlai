// The shared claims guard — no AI-written claim a small business can't
// back up reaches their customers.
//
// THE LIVE CASE: CRO told candle_by_qaaf (1 paid order, flat ₹60
// shipping) to publish "Loved by 500+ homes across India" and "Free
// shipping on your first order". Content, Social, Email and WhatsApp
// had the same gap — no facts in the prompt, no check on the output —
// and two of them publish or send with no human in between (content
// autopilot, email automation). Under the Consumer Protection Act 2019
// and the ASCI code those claims are the OWNER's liability.
//
// These tests pin the three claim classes the guard exists for —
// unbacked numbers, unbacked superlatives/comparisons/guarantees, and
// offers/prices that don't match the store — plus health claims, and
// prove the guard is low-friction: ordinary copy passes untouched, the
// owner's own claims are allowed, and only the offending sentence goes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims, stripUnsupported, guardOutput, claimsNote } from "@/lib/claims/claimCheck";

type Row = Record<string, any>;

const HOME = {
  slug: "home",
  title: "Home",
  pageType: "home",
  headings: ["A mood, not just a candle."],
  paragraphs: ["Candle by Qaaf makes hand-poured soy wax candles. Each candle arrives in premium, gift-ready packaging."],
  buttons: ["Shop the Collection"],
  metaDescription: null,
  hasShareImage: false,
};

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "candle_by_qaaf",
    category: "Home fragrance",
    city: "Pune",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [HOME] },
    home: HOME,
    products: [{ name: "Lavender candle", price: 550, description: "Hand-poured soy wax, 40 hour burn" }],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 13, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 7.7, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [],
    pillars: ["Hand-poured in small batches"],
    unreadable: [],
    ...over,
  };
}

const flagged = (text: string, f = facts()) => findUnsupportedClaims(text, f).length > 0;

describe("1 — numbers about customers, sales and reviews must be on record", () => {
  it.each([
    "Loved by 500+ homes across India",
    "Join 10k+ happy customers",
    "Thousands of happy customers can't be wrong",
    "Over 1,200 candles sold",
    "Rated 4.9/5 by our community",
    "Our 5-star reviews say it all",
    "Serving 12 years of cosy evenings",
  ])("flags %j for a business with 1 paid order", (text) => {
    expect(flagged(text)).toBe(true);
  });

  it("a count the business really has is fine", () => {
    expect(flagged("Our first 1 order shipped last week")).toBe(false);
  });
});

describe("2 — superlatives, rankings, comparisons and guarantees need support", () => {
  it.each([
    "India's favourite candle brand",
    "The best candles in Pune", // the business's own city
    "The #1 candle for gifting",
    "Our best-selling Lavender candle",
    "Longer-lasting than Bath & Body Works",
    "The cheapest candles online",
    "Guaranteed to transform your room",
    "Money-back promise if you don't love it",
    "Selling fast — only 3 left!",
  ])("flags %j", (text) => {
    expect(flagged(text)).toBe(true);
  });

  it.each([
    "Our best scent yet for slow evenings",
    "The best way to unwind after work",
    "Light it, breathe out, stay a while.",
    "Hand-poured soy wax, made in small batches",
  ])("leaves ordinary persuasive copy alone: %j", (text) => {
    expect(flagged(text)).toBe(false);
  });
});

describe("3 — offers, prices and shipping must match the store", () => {
  it("a discount no active code gives is flagged; the real code's discount isn't", () => {
    expect(flagged("20% off this weekend")).toBe(true);
    const withCode = facts({ offers: [{ code: "CALM10", label: "10% off", percent: 10, flat: null }] });
    expect(flagged("10% off with code CALM10", withCode)).toBe(false);
    expect(flagged("20% off with code CALM10", withCode)).toBe(true);
  });

  it("a price that isn't the product's price is flagged; the real one (or the real discounted one) isn't", () => {
    expect(flagged("Lavender candle at just ₹499")).toBe(true);
    expect(flagged("Lavender candle for ₹550")).toBe(false);
    const withCode = facts({ offers: [{ code: "CALM10", label: "10% off", percent: 10, flat: null }] });
    expect(flagged("Now ₹495 with CALM10", withCode)).toBe(false);
  });

  it("free shipping on a flat-rate store is flagged, and says what the store actually charges", () => {
    expect(findUnsupportedClaims("Free shipping on every order", facts()).join(" ")).toMatch(/₹60 flat/);
    expect(flagged("Free shipping on every order", facts({ shipping: { mode: "free", rate: null, freeThreshold: null } }))).toBe(false);
  });
});

describe("4 — health and efficacy claims need evidence", () => {
  it.each(["Relieves stress and anxiety", "Clinically proven to improve sleep", "Doctor-recommended for calm", "Cures headaches naturally"])(
    "flags %j",
    (text) => expect(flagged(text)).toBe(true)
  );

  it("describing how a product feels to use is fine", () => {
    expect(flagged("Helps you slow down at the end of the day")).toBe(false);
  });
});

describe("the owner's own claims are theirs to make", () => {
  it("a claim in Business Knowledge is allowed; the same claim without it is not", () => {
    expect(flagged("Award-winning candles, poured in Pune")).toBe(true);
    const owned = facts({ ownerFacts: [{ title: "Awards", content: "Award-winning at Pune Design Week 2025" }] });
    expect(flagged("Award-winning candles, poured in Pune", owned)).toBe(false);
  });

  it("wording already on the owner's site is allowed", () => {
    expect(flagged("Every candle arrives in gift-ready packaging")).toBe(false);
  });
});

describe("low friction: only the offending sentence goes, the rest reads exactly as written", () => {
  it("strips one sentence from a caption and keeps the others, hashtags and line breaks", () => {
    const caption = "Meet our Lavender candle. Loved by 500+ homes across India! Hand-poured soy wax for slow evenings.\n\n#candles #pune";
    const r = stripUnsupported(caption, facts());
    expect(r.text).toBe("Meet our Lavender candle. Hand-poured soy wax for slow evenings.\n\n#candles #pune");
    expect(r.removed.join(" ")).toMatch(/500\+ homes/);
  });

  it("clean copy comes back identical, with nothing removed", () => {
    const caption = "Light it, breathe out, stay a while. 🕯️ Shop the Lavender candle — ₹550.";
    expect(stripUnsupported(caption, facts())).toEqual({ text: caption, removed: [] });
  });

  it("works on every output shape: a hook that was only a claim is dropped, and so is a calendar day left with no caption", () => {
    const out = guardOutput(
      {
        hooks: ["What does calm smell like?", "India's #1 candle brand is here."],
        days: [
          { day: "Mon", topic: "Launch", caption: "Meet the Lavender candle. Made for slow evenings." },
          { day: "Tue", topic: "Proof", caption: "Loved by 500+ homes!" },
        ],
        _savedId: "keep-me",
      },
      facts()
    );
    expect(out.output.hooks).toEqual(["What does calm smell like?"]);
    expect(out.output.days.map((d: Row) => d.day)).toEqual(["Mon"]);
    expect(out.output._savedId).toBe("keep-me");
    expect(out.removed).toHaveLength(2);
  });

  it("the owner is told what was removed and how to allow it", () => {
    expect(claimsNote([])).toBeNull();
    expect(claimsNote(['"500+ homes" — 1 paid order on record'])).toMatch(/removed a line.*500\+ homes.*add it to Business Knowledge/);
  });
});

// ---------------------------------------------------------------------
// Wired into the departments — real agents, real routes' logic, a fake
// database and a fake Anthropic.
// ---------------------------------------------------------------------

let tables: Record<string, Row[]>;
let writes: { table: string; op: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api,
      update: (v: Row) => ((op = "update"), (values = v), api),
      insert: (v: Row) => ((op = "insert"), (values = v), api),
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => {
        if (op !== "select") writes.push({ table, op, values });
        return Promise.resolve({ data: op === "select" ? tables[table] ?? [] : [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { from };
}

const CANDLE_TABLES = (): Record<string, Row[]> => ({
  dealerships: [
    {
      id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Pune",
      fb_page_id: "PAGE1", content_autopilot_enabled: true, content_autopilot_frequency_days: 3, content_autopilot_last_posted_at: null,
      welcome_email_auto_enabled: true, follow_up_email_auto_enabled: false, gmail_email: "owner@example.com",
    },
  ],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60, shipping_free_threshold: null }],
  website_pages: [{ slug: "home", title: "Home", page_type: "home", sections: [{ type: "hero", headline: "A mood, not just a candle." }] }],
  products: [{ name: "Lavender candle", price: 550, description: "Hand-poured soy wax" }],
  discount_codes: [],
  orders: [{ status: "delivered", created_at: new Date().toISOString() }],
  brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: ["Hand-poured in small batches"] }],
  social_post_queue: [],
});

/** Anthropic answering with each of `replies` in turn (the last one repeats). */
function anthropic(replies: unknown[]) {
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: any) => {
      prompts.push(JSON.parse(init.body).messages[0].content);
      const reply = replies[Math.min(prompts.length - 1, replies.length - 1)];
      return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ text: JSON.stringify(reply) }] }) };
    })
  );
  return prompts;
}

const postPhotoToPage = vi.fn(async () => ({ id: "post_1" }));
vi.mock("@/lib/agents/socialMediaAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/socialMediaAgent")>()),
  postPhotoToPage: (...a: any[]) => (postPhotoToPage as any)(...a),
  getConnectedInstagramAccountId: async () => null,
}));
vi.mock("@/lib/agents/graphicDesignAgent", () => ({ generateGraphic: async () => Buffer.from("png") }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "PAGE_TOKEN", hasMetaPageToken: () => true }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/img.png" } }) }) },
  }),
}));
const sendDealerEmail = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => (sendDealerEmail as any)(...a) }));

import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { generateSocialCaption } from "@/lib/agents/socialMediaAgent";
import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { runContentAutopilot } from "@/lib/automation/contentAutopilot";
import { runEmailAutomation } from "@/lib/automation/emailAutomation";

beforeEach(() => {
  tables = CANDLE_TABLES();
  writes = [];
  postPhotoToPage.mockClear();
  sendDealerEmail.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Content Marketing: written from the facts, checked against them", () => {
  it("the prompt carries the real facts and the truth rules, and an invented claim is removed with a note", async () => {
    const prompts = anthropic([{ text: "Meet the Lavender candle — ₹550 of calm. Loved by 500+ homes across India! Light it tonight." }]);
    const f = await gatherBusinessFacts(db(), "d1");
    const r = await generateContent("instagram_post", "candle_by_qaaf", "Home fragrance", "lavender", null, undefined, undefined, f);

    expect(prompts[0]).toContain("Lavender candle — ₹550");
    expect(prompts[0]).toContain("Active offers: none — do not write any discount");
    expect(prompts[0]).toMatch(/NEVER invent numbers/);
    expect(r.output.text).toBe("Meet the Lavender candle — ₹550 of calm. Light it tonight.");
    expect(r.claimsRemoved?.join(" ")).toMatch(/500\+ homes/);
    expect(r.output._claimsNote).toMatch(/Hawlai removed/);
  });

  it("without facts it behaves exactly as before — callers not yet wired are unaffected", async () => {
    anthropic([{ text: "Loved by 500+ homes!" }]);
    const r = await generateContent("instagram_post", "candle_by_qaaf", "Home fragrance", "lavender", null);
    expect(r).toEqual({ output: { text: "Loved by 500+ homes!" } });
  });
});

describe("Social: the caption the owner posts straight to their Page", () => {
  it("free shipping on a flat-rate store is removed from the caption", async () => {
    anthropic([{ caption: "New Lavender candle is here 🕯️ Free shipping on your first order! #candles" }]);
    const f = await gatherBusinessFacts(db(), "d1");
    const r = await generateSocialCaption("new lavender candle", null, "Home fragrance", undefined, f);
    expect(r.caption).toBe("New Lavender candle is here 🕯️ #candles");
    expect(r.claimsRemoved.join(" ")).toMatch(/free shipping.*₹60 flat/);
  });
});

describe("WhatsApp: a promotion can't invent an offer", () => {
  it("'20% off' with no active code is removed from the message", async () => {
    anthropic([{ message: "*Lavender candle* is back. Flat 20% off till Sunday! Reply YES to order." }]);
    const f = await gatherBusinessFacts(db(), "d1");
    const r = await generateWhatsappContent("promotion", "candle_by_qaaf", "Home fragrance", "", null, undefined, undefined, f);
    expect(r.output.message).toBe("*Lavender candle* is back. Reply YES to order.");
  });
});

describe("content autopilot — posts publicly with nobody reading first", () => {
  it("never posts a caption that needed a claim removed: one retry, then the run is skipped and logged", async () => {
    const prompts = anthropic([{ text: "India's #1 candle brand. Loved by 500+ homes!" }]);
    const r = await runContentAutopilot(db(), "d1");

    expect(prompts).toHaveLength(2); // one fresh attempt
    expect(postPhotoToPage).not.toHaveBeenCalled();
    expect(r.posted).toBe(false);
    const log = writes.find((w) => w.table === "content_autopilot_log")!.values;
    expect(log.success).toBe(false);
    expect(log.error).toMatch(/Skipped: the caption made claims Hawlai couldn't verify.*nothing was posted/);
    expect(writes.some((w) => w.table === "dealerships" && "content_autopilot_last_posted_at" in w.values)).toBe(false);
  });

  it("posts the retry when it comes back clean", async () => {
    anthropic([{ text: "Loved by 500+ homes!" }, { text: "Slow evenings start with the Lavender candle. 🕯️" }]);
    const r = await runContentAutopilot(db(), "d1");
    expect(r.posted).toBe(true);
    expect((postPhotoToPage.mock.calls[0] as any[])[3]).toBe("Slow evenings start with the Lavender candle. 🕯️");
  });

  it("if the business's facts can't be read at all, nothing is posted", async () => {
    anthropic([{ text: "Slow evenings." }]);
    // The autopilot's own reads work; every read the facts need throws.
    const FACT_TABLES = new Set(["websites", "products", "discount_codes", "page_events", "orders", "leads", "abandoned_carts", "business_knowledge"]);
    const broken = { from: (t: string) => (FACT_TABLES.has(t) ? { select: () => { throw new Error("db down"); } } : db().from(t)) };
    const r = await runContentAutopilot(broken, "d1");
    expect(r).toEqual({ skipped: "business facts unreadable" });
    expect(postPhotoToPage).not.toHaveBeenCalled();
  });
});

describe("email automation — sent to real leads with nobody reading first", () => {
  it("a welcome email that needed a claim removed is never sent, and the lead isn't marked as welcomed", async () => {
    tables.leads = [{ id: "L1", name: "Asha", email: "asha@example.com" }];
    anthropic([{ subject: "Welcome!", previewText: "", body: "Hi Asha! Join 2,000+ happy customers who love our candles." }]);
    const r = await runEmailAutomation(db(), "d1");
    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(r.welcomesSent).toBe(0);
    expect(writes.some((w) => w.table === "leads" && "welcome_email_sent_at" in w.values)).toBe(false);
  });

  it("a clean welcome email is sent as written", async () => {
    tables.leads = [{ id: "L1", name: "Asha", email: "asha@example.com" }];
    anthropic([{ subject: "Welcome, Asha", previewText: "", body: "Hi Asha! Thanks for stopping by. Our Lavender candle is ₹550 — reply if you'd like one." }]);
    const r = await runEmailAutomation(db(), "d1");
    expect(r.welcomesSent).toBe(1);
    expect((sendDealerEmail.mock.calls[0] as any[])[3]).toBe("Welcome, Asha");
  });
});
