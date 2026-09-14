// A marketing email from chat is shown before it's sent.
//
// APPROVED 2026-09-14 (Part 1, step 3): a chat card shows the email
// exactly as the customer will get it — the visual email, or the words
// as written plus the footer — and nothing goes out until the owner
// presses Send and confirms. The send runs every rule again. A note to a
// team member is internal mail and still sends directly.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserted: { table: string; row: Row }[];

function db() {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let insertRow: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, or: () => api, neq: () => api,
      eq: (k: string, v: any) => (filters.push((r) => r[k] === undefined || r[k] === v), api),
      ilike: (k: string, p: string) => (filters.push((r) => String(r[k] ?? "").toLowerCase() === p.replace(/\\(.)/g, "$1").toLowerCase()), api),
      insert: (row: Row) => ((insertRow = row), inserted.push({ table, row }), api),
      upsert: () => api, update: () => api,
      maybeSingle: async () => ({ data: insertRow ?? rows()[0] ?? null, error: null }),
      single: async () => ({ data: insertRow ?? rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: insertRow ? [insertRow] : rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) } };
}

const PHOTO = "https://cdn.example/lavender.jpg";
const PRODUCT_URL = "https://hawlai.online/site/candle-by-qaaf/products/p1";

const STORE = (): Record<string, Row[]> => ({
  dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow", business_address: "12 Hazratganj, Lucknow", owner_id: "owner-1" }],
  profiles: [{ id: "owner-1", dealership_id: "d1" }],
  websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
  website_pages: [],
  products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [PHOTO], is_active: true }],
  discount_codes: [],
  orders: [],
  leads: [{ id: "L1", dealership_id: "d1", name: "Asha", email: "asha@example.com" }],
  team_members: [{ id: "t1", dealership_id: "d1", email: "priya@candle.example", status: "active" }],
  email_suppressions: [],
  email_unsubscribe_tokens: [],
});

const sendDealerEmail = vi.fn(async (..._a: any[]) => ({ success: true, via: "resend" as const }));
vi.mock("@/lib/email/sendDealerEmail", () => ({ sendDealerEmail: (...a: any[]) => sendDealerEmail(...a) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db() }));
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

import { executeTool, extractArtifact, runMasterBrainChat } from "@/lib/agents/masterBrainV2";
import { POST as postEmailSend } from "@/app/api/email/send/route";

const CTX: any = { id: "d1", name: "candle_by_qaaf", category: "Home fragrance", city: "Lucknow", toneOfVoice: "warm", knowledgeFacts: [], brandVoice: null, team: [], memories: [] };
const VISUAL = {
  recipient: "asha@example.com",
  subject: "Slow evenings are back",
  body: "Our Lavender candle is back — hand-poured soy wax, ₹550.",
  headline: "Slow evenings are back",
  intro: "Our Lavender candle is hand-poured in small batches.",
  bullets: ["Hand-poured soy wax", "₹550"],
  ctaLabel: "Shop Lavender",
  product: "Lavender candle",
};

beforeEach(() => {
  tables = STORE();
  inserted = [];
  sendDealerEmail.mockClear();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chat proposes; it doesn't send", () => {
  it("a visual email to a lead comes back as a preview — nothing sent, no unsubscribe token spent", async () => {
    const r = await executeTool(db(), CTX, "send_email", VISUAL, "");

    expect(sendDealerEmail).not.toHaveBeenCalled();
    expect(inserted.filter((i) => i.table === "email_unsubscribe_tokens")).toEqual([]);
    expect(r).toMatchObject({ proposed: true, to: "asha@example.com", recipientKind: "lead", format: "visual", subject: "Slow evenings are back", businessName: "Candle by Qaaf" });
    expect(r.note).toContain("NOT SENT YET");
    expect(r._emailPreview.html).toContain(PHOTO);
    expect(r._emailPreview.html).toContain(PRODUCT_URL);
    expect(r._emailPreview.html).toContain("Candle by Qaaf · 12 Hazratganj, Lucknow");
    expect(r._emailPreview.html).toContain(">Unsubscribe</a>");
    expect(r.payload).toEqual({ draft: { subject: VISUAL.subject, headline: VISUAL.headline, intro: VISUAL.intro, bullets: VISUAL.bullets, ctaLabel: VISUAL.ctaLabel, product: VISUAL.product, body: VISUAL.body } });
  });

  it("a plain note to a lead previews the words exactly as written, with the footer", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "asha@example.com", subject: "Your candle", body: "Hi Asha,\nthanks for asking — it's back in stock." }, "");
    expect(r.format).toBe("plain");
    expect(r._emailPreview).toEqual({
      html: null,
      text: "Hi Asha,\nthanks for asking — it's back in stock.\n\n—\nCandle by Qaaf · 12 Hazratganj, Lucknow\nUnsubscribe: https://hawlai.online/unsubscribe/preview",
    });
    expect(r.payload).toEqual({ subject: "Your candle", body: "Hi Asha,\nthanks for asking — it's back in stock." });
  });

  it("a note to a team member still sends straight away — it's internal mail", async () => {
    const r = await executeTool(db(), CTX, "send_email", { recipient: "priya@candle.example", subject: "Banner", body: "Check the Diwali banner?" }, "");
    expect(r.success).toBe(true);
    expect(r.note).toBe("Accepted for delivery to priya@candle.example (via resend) — not yet confirmed as arrived in their inbox.");
    expect(sendDealerEmail).toHaveBeenCalledTimes(1);
  });
});

describe("the card", () => {
  it("shows the email and a Send button that asks first, pointing at the endpoint lead pages send from", async () => {
    const r = await executeTool(db(), CTX, "send_email", VISUAL, "");
    const card = extractArtifact("send_email", VISUAL, r)!;

    expect(card.label).toBe("Email ready to send");
    expect(card.emailPreview).toEqual({ to: "asha@example.com", subject: "Slow evenings are back", html: r._emailPreview.html, text: r._emailPreview.text });
    expect(card.publish).toEqual({
      target: "email",
      label: "Send email",
      confirm: "This sends the email to asha@example.com now, from Candle by Qaaf, with your business address and an unsubscribe link in the footer. It can't be unsent.",
      endpoint: "/api/email/send",
      method: "POST",
      payload: { to: "asha@example.com", draft: r.payload.draft },
      done: "✅ Sent to asha@example.com — accepted for delivery, not yet confirmed in their inbox",
    });
  });

  it("the model is told it's not sent, but never given the email's HTML", async () => {
    const requests: any[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: any): Promise<any> => {
        if (!String(url).includes("anthropic")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
        requests.push(JSON.parse(init.body));
        const payload =
          call++ === 0
            ? { content: [{ type: "tool_use", id: "tu1", name: "send_email", input: VISUAL }], stop_reason: "tool_use" }
            : { content: [{ type: "text", text: "Here's the email — press Send when you're happy." }], stop_reason: "end_turn" };
        return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), headers: { get: () => null } };
      })
    );

    const turn = await runMasterBrainChat(db(), "d1", [], "Email Asha about the Lavender candle");
    const toolResult = requests[1].messages.at(-1).content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.content).not.toContain("<html");
    expect(JSON.parse(toolResult.content)).toMatchObject({ proposed: true, to: "asha@example.com" });
    expect(turn.artifacts.find((a: any) => a.emailPreview)?.emailPreview?.html).toContain("<html");
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });
});

describe("pressing Send", () => {
  const send = (body: Row) => postEmailSend(new Request("https://hawlai.online/api/email/send", { method: "POST", body: JSON.stringify(body) }));

  it("sends the visual email the card showed, now with a real unsubscribe link", async () => {
    const r = await executeTool(db(), CTX, "send_email", VISUAL, "");
    const res = await send(extractArtifact("send_email", VISUAL, r)!.publish!.payload);

    expect(res.status).toBe(200);
    const [, , to, subject, text, opts] = sendDealerEmail.mock.calls[0] as any[];
    expect([to, subject]).toEqual(["asha@example.com", "Slow evenings are back"]);
    const token = inserted.find((i) => i.table === "email_unsubscribe_tokens")!.row.token;
    expect(opts.html).toContain(PHOTO);
    expect(opts.html).toContain(`https://hawlai.online/unsubscribe/${token}`);
    expect(text).toContain("Shop Lavender: " + PRODUCT_URL);
  });

  it("a draft with a misleading subject or an invented link is refused at send time too", async () => {
    const draft = { subject: "Slow evenings", body: "b", headline: "h", intro: "Shop at candlebyqaaf.com today" };
    expect((await send({ to: "asha@example.com", draft })).status).toBe(400);
    expect((await send({ to: "asha@example.com", draft: { ...draft, intro: "Hi", subject: "Re: your order" } })).status).toBe(400);
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });

  it("someone who unsubscribed after the preview was made isn't sent it", async () => {
    const r = await executeTool(db(), CTX, "send_email", VISUAL, "");
    tables.email_suppressions = [{ dealership_id: "d1", email: "asha@example.com", reason: "unsubscribed" }];
    const res = await send(extractArtifact("send_email", VISUAL, r)!.publish!.payload);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Not sent: asha@example.com has unsubscribed from this business's emails.");
    expect(sendDealerEmail).not.toHaveBeenCalled();
  });
});
