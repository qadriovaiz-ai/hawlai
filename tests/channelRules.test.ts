// Email and WhatsApp marketing rules, enforced where code can enforce them.
//
// THE BRIEF (2026-09-14): subject lines must not mislead about what's
// inside; WhatsApp marketing needs opt-in and a visible opt-out, and
// Hawlai's WhatsApp stays tap-to-send until Meta-approved template
// sending is built — breaking Meta's rules gets a number banned. These
// tests run the real generators and the real chat tool; only Anthropic,
// the database and the email provider are faked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, ilike: () => api, or: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: () => api, update: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", is_active: true }],
  discount_codes: [],
  orders: [],
});

/** Anthropic answering with `reply` (JSON-encoded when not a string); records system and user prompts. */
function anthropic(reply: unknown) {
  const calls: { system: string; prompt: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: any): Promise<any> => {
      if (!String(url).includes("anthropic")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
      const body = JSON.parse(init.body);
      const first = body.messages?.[0]?.content;
      calls.push({ system: String(body.system ?? ""), prompt: typeof first === "string" ? first : JSON.stringify(first) });
      const payload = { content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }] };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
    })
  );
  return calls;
}

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
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

import { misleadingSubject, honestSubject, EMAIL_RULES, WHATSAPP_RULES, WHATSAPP_OPT_OUT } from "@/lib/expertise/channelRules";
import { generateEmailContent } from "@/lib/agents/emailMarketingAgent";
import { generateWhatsappContent } from "@/lib/agents/whatsappMarketingAgent";
import { executeTool, runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { gatherBusinessFacts } from "@/lib/claims/businessFacts";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };

beforeEach(() => {
  tables = STORE();
  sendDealerEmail.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("subject lines say what's inside", () => {
  it.each([
    "Re: your Diwali candles",
    "FWD: Lavender candle is back",
    "Fw: Fwd: a gift idea",
    "Your order is waiting",
    "Your account needs attention",
    "Payment failed — act now",
    "Invoice #4821 for candle_by_qaaf",
    "Security alert: verify now",
    "Final notice: Diwali stock",
  ])("flags %j", (subject) => {
    expect(misleadingSubject(subject)).not.toBeNull();
  });

  it.each([
    "Diwali gifting, sorted",
    "Lavender candle is back — ₹550",
    "Reordering made easy",
    "A gift for your mother",
    "Your evening, slowed down",
    "Refresh your space this monsoon",
  ])("leaves %j alone", (subject) => {
    expect(misleadingSubject(subject)).toBeNull();
  });

  it("a fake Re:/Fwd: is just dropped; a fake notice becomes a plain subject from the business", () => {
    expect(honestSubject("Re: Diwali gifting, sorted", "candle_by_qaaf")).toEqual({ subject: "Diwali gifting, sorted", problem: expect.stringContaining("Re:") });
    expect(honestSubject("Re: Your order is waiting", "candle_by_qaaf")).toEqual({ subject: "A note from Candle by Qaaf", problem: expect.any(String) });
  });
});

describe("the email generator", () => {
  it("writes under the email rules, fixes a misleading subject, and tells the owner", async () => {
    const calls = anthropic({ subject: "Re: Your order is waiting", previewText: "Lavender, restocked", body: "Our Lavender candle is back." });
    const f = await gatherBusinessFacts(db(), "d1");
    const r = await generateEmailContent("promotional", "candle_by_qaaf", "Home fragrance", "restock", null, undefined, undefined, f);

    expect(calls[0].prompt).toContain(EMAIL_RULES);
    expect(r.output.subject).toBe("A note from Candle by Qaaf");
    expect(r.output._claimsNote).toContain("Hawlai changed the subject line so it doesn't mislead");
    // Counts as a change, so automation — which sends only untouched emails — won't send it.
    expect(r.claimsRemoved).toHaveLength(1);
  });

  it("fixes every subject in a sequence", async () => {
    anthropic({ emails: [{ step: 1, subject: "Fwd: meet the Lavender candle", body: "a" }, { step: 2, subject: "Slow evenings", body: "b" }] });
    const r = await generateEmailContent("sales_sequence", "candle_by_qaaf", "Home fragrance", "", null, undefined, undefined, await gatherBusinessFacts(db(), "d1"));
    expect(r.output.emails.map((e: any) => e.subject)).toEqual(["meet the Lavender candle", "Slow evenings"]);
  });

  it("an honest email comes back untouched, with nothing counted as removed", async () => {
    anthropic({ subject: "Lavender candle is back — ₹550", previewText: "Hand-poured", body: "Our Lavender candle is back." });
    const r = await generateEmailContent("promotional", "candle_by_qaaf", "Home fragrance", "", null, undefined, undefined, await gatherBusinessFacts(db(), "d1"));
    expect(r.output.subject).toBe("Lavender candle is back — ₹550");
    expect(r.claimsRemoved).toEqual([]);
    expect(r.output._claimsNote).toBeUndefined();
  });
});

describe("the WhatsApp generator", () => {
  it("writes under Meta's rules, and a promotion always ends with the opt-out line", async () => {
    const calls = anthropic({ message: "*Lavender candle* is back — ₹550. Reply YES to order." });
    const r = await generateWhatsappContent("promotion", "candle_by_qaaf", "Home fragrance", "", null, undefined, undefined, await gatherBusinessFacts(db(), "d1"));
    expect(calls[0].prompt).toContain(WHATSAPP_RULES);
    expect(r.output.message).toBe(`*Lavender candle* is back — ₹550. Reply YES to order.\n\n${WHATSAPP_OPT_OUT}`);
  });

  it("every message of a nurture sequence gets it; a message that already has one isn't doubled", async () => {
    anthropic({ messages: [{ step: 1, message: "Hi! New scents are in." }, { step: 2, message: "Still thinking? Reply STOP to opt out." }] });
    const r = await generateWhatsappContent("lead_nurturing", "candle_by_qaaf", "Home fragrance", "", null);
    expect(r.output.messages.map((m: any) => m.message)).toEqual([`Hi! New scents are in.\n\n${WHATSAPP_OPT_OUT}`, "Still thinking? Reply STOP to opt out."]);
  });

  it.each(["follow_up", "order_update", "chatbot_flow"])("a %s message isn't marketing and gets no opt-out line", async (task) => {
    anthropic({ message: "Your candle ships tomorrow." });
    const r = await generateWhatsappContent(task, "candle_by_qaaf", "Home fragrance", "", null);
    expect(r.output.message).toBe("Your candle ships tomorrow.");
  });
});

describe("chat", () => {
  it("refuses to send an email with a misleading subject, before anything is sent", async () => {
    const result = await executeTool(db(), CTX, "send_email", { recipient: "customer@example.com", subject: "Re: your order", body: "Our Lavender candle is back." }, "");
    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(result.error).toContain('Not sent: the subject "Re: your order"');
  });

  it("knows the email and WhatsApp rules, including the 24-hour window and template categories", async () => {
    const calls = anthropic("Sure.");
    await runMasterBrainChat(db(), "d1", [], "Can we auto-send WhatsApp offers to all our leads?");
    const system = calls[0].system;
    expect(system).toContain(EMAIL_RULES);
    expect(system).toContain(WHATSAPP_RULES);
    expect(system).toContain("Outside that window only Meta-approved template messages can be sent");
    expect(system).toContain("Templates are Marketing, Utility or Authentication");
    expect(system).toContain("Hawlai keeps WhatsApp as tap-to-send");
  });
});

describe("WhatsApp stays tap-to-send", () => {
  const SRC = join(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  const all = files(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: readFileSync(p, "utf-8") }));

  it("only the inbound webhook — replying to someone who just messaged Hawlai — can send a WhatsApp message", () => {
    const senders = all.filter((f) => /\bsendWhatsApp(Text|Image)\b/.test(f.text) && f.path !== "lib/whatsapp/gupshupClient.ts").map((f) => f.path);
    expect(senders).toEqual(["app/api/webhooks/whatsapp/route.ts"]);
  });

  it("nothing calls a WhatsApp sending API directly", () => {
    const direct = all
      .filter((f) => f.path !== "lib/whatsapp/gupshupClient.ts")
      .filter((f) => /api\.gupshup\.io|messaging_product["']?\s*:\s*["']whatsapp|graph\.facebook\.com\/[^`"']*\/messages[^`"']*whatsapp/i.test(f.text))
      .map((f) => f.path);
    expect(direct).toEqual([]);
  });
});
