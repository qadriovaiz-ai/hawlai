// THE SELLER'S ORDER NOTICE, AND THE TEMPLATE SENDER BEHIND IT — WA-T,
// 28 November 2026, docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct).
//
// Seller Mode asks the customer to pay the seller's own UPI ID, and only
// the seller can say the money arrived. So each order sends the seller a
// WhatsApp TEMPLATE — the only shape Meta accepts outside the 24-hour
// window — with Yes / Not yet buttons that carry the order's id.
//
// The template sender was deleted on 24 November with H3 (49cf3d8f) and
// is restored here. So is the rule that went with it: channelRules names
// its free-form senders BY HAND, so a template sender is invisible to
// it, and the template gets its own list (section 5).
//
// UNVERIFIED AGAINST A LIVE SEND: `order_payment_check` is not approved
// by Meta yet, and nothing sends until WHATSAPP_ORDER_TEMPLATE names it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { code } from "./helpers/source";

const events: string[] = [];
const notifications: any[] = [];
vi.mock("@/lib/notifications/emit", () => ({
  emitNotification: async (_supabase: any, input: any) => {
    events.push("notification");
    notifications.push(input);
  },
}));

import { templateVariable, sendWhatsAppTemplate as metaTemplate } from "@/lib/whatsapp/metaClient";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { notifySellerOfOrder, paymentButtonPayloads, formatRupees, orderTemplateName } from "@/lib/dm/sellerOrderNotice";

let sent: any[] = [];

function metaAnswers(status = 200, body: any = { messages: [{ id: "wamid.TEST" }] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      events.push("send");
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify(body), { status });
    })
  );
}

function business(row: Record<string, any> | null, error: any = null) {
  return {
    from: (table: string) => {
      expect(table).toBe("dealerships");
      const api: any = { select: () => api, eq: () => api, maybeSingle: async () => ({ data: row, error }) };
      return api;
    },
  };
}

const VERIFIED = { owner_whatsapp_number: "919800000001", owner_whatsapp_verified: true };
const ORDER = { orderId: "6b1f0c2e-0000-4000-8000-000000000042", orderRef: "#1042", amount: 1299, customerName: "Asha" };

beforeEach(() => {
  sent = [];
  events.length = 0;
  notifications.length = 0;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "100000000000001";
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.WHATSAPP_ORDER_TEMPLATE = "order_payment_check";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PROVIDER", "WHATSAPP_ORDER_TEMPLATE"]) delete process.env[k];
});

describe("1. A VARIABLE IS MADE SENDABLE, OR NOTHING IS SENT", () => {
  it("A NEWLINE, A TAB AND A RUN OF SPACES ARE COLLAPSED — Meta refuses each at send time", () => {
    expect(templateVariable("Asha\nSharma")).toBe("Asha Sharma");
    expect(templateVariable("a\t\tb     c")).toBe("a b c");
  });

  it("AN EMPTY VALUE THROWS RATHER THAN SENDING A BLANK", () => {
    for (const empty of ["", "   ", "\n\n", "\t", null as any, undefined as any]) {
      expect(() => templateVariable(empty), JSON.stringify(empty)).toThrow(/came out empty/);
    }
  });

  it("A LONG VALUE IS CAPPED, and says it was", () => {
    const out = templateVariable("x".repeat(900));
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("2. THE PAYLOAD IS THE SHAPE META DOCUMENTS", () => {
  it("A NAMED TEMPLATE, POSITIONAL BODY PARAMETERS, TO THE PHONE NUMBER ID", async () => {
    metaAnswers();
    await metaTemplate("919800000001", { name: "order_payment_check", variables: ["#1042", "1,299", "Asha"] });
    const body = sent[0].body;
    expect(sent[0].url).toContain("graph.facebook.com");
    expect(sent[0].url).toContain("/100000000000001/messages");
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.type).toBe("template");
    expect(body.to).toBe("919800000001");
    expect(body.template.name).toBe("order_payment_check");
    expect(body.template.language).toEqual({ code: "en" });
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "#1042" }, { type: "text", text: "1,299" }, { type: "text", text: "Asha" }] },
    ]);
  });

  it("EACH BUTTON GETS ITS OWN PAYLOAD AT ITS OWN INDEX — buttons are addressed by position", async () => {
    metaAnswers();
    await metaTemplate("919800000001", { name: "t", variables: ["a"], buttonPayloads: ["pay_yes:o1", "pay_no:o1"] });
    expect(sent[0].body.template.components.slice(1)).toEqual([
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "pay_yes:o1" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "pay_no:o1" }] },
    ]);
  });

  it("THE SEND ITSELF SANITISES — a newline in a name never reaches Meta, and a blank never leaves", async () => {
    metaAnswers();
    await metaTemplate("919800000001", { name: "t", variables: ["Asha\nSharma"], buttonPayloads: ["pay_yes:o1\n"] });
    expect(sent[0].body.template.components[0].parameters[0].text).toBe("Asha Sharma");
    expect(sent[0].body.template.components[1].parameters[0].payload).toBe("pay_yes:o1");
    sent = [];
    await expect(metaTemplate("919800000001", { name: "t", variables: [" "] })).rejects.toThrow(/came out empty/);
    expect(sent).toEqual([]);
  });

  it("no variables, no body component — an empty parameters array is itself refused", async () => {
    metaAnswers();
    await metaTemplate("919800000001", { name: "t", variables: [] });
    expect(sent[0].body.template.components).toEqual([]);
  });

  it("A REFUSAL ARRIVES IN META'S OWN WORDS, never as a success", async () => {
    metaAnswers(400, { error: { message: "Template name does not exist in the translation", code: 132001, fbtrace_id: "AbC" } });
    await expect(metaTemplate("919800000001", { name: "t", variables: ["a"] })).rejects.toThrow(
      /Meta refused the message \[132001\]: Template name does not exist/
    );
  });
});

describe("3. THE PROVIDER IS CHOSEN, NEVER GUESSED", () => {
  it("THE FACADE SENDS THROUGH META WHEN META IS DECLARED", async () => {
    metaAnswers();
    await sendWhatsAppTemplate("919800000001", { name: "t", variables: ["a"] });
    expect(sent.length).toBe(1);
  });

  it("GUPSHUP REFUSES — it does not fall back to free-form text", async () => {
    metaAnswers();
    process.env.WHATSAPP_PROVIDER = "gupshup";
    await expect(sendWhatsAppTemplate("919800000001", { name: "t", variables: ["a"] })).rejects.toThrow(/only Meta Cloud API/);
    expect(sent).toEqual([]);
  });

  it("AN UNSET PROVIDER IS A REFUSAL, not a default", async () => {
    metaAnswers();
    delete process.env.WHATSAPP_PROVIDER;
    await expect(sendWhatsAppTemplate("919800000001", { name: "t", variables: ["a"] })).rejects.toThrow(/WHATSAPP_PROVIDER/);
    expect(sent).toEqual([]);
  });
});

describe("4. THE SELLER IS TOLD", () => {
  it("THE TEMPLATE CARRIES ORDER, AMOUNT, CUSTOMER — IN THE APPROVED BODY'S ORDER — AND BOTH BUTTONS NAME THE ORDER", async () => {
    metaAnswers();
    const r = await notifySellerOfOrder(business(VERIFIED), "d1", ORDER);
    expect(r).toEqual({ whatsapp: "sent" });
    const t = sent[0].body.template;
    expect(t.name).toBe("order_payment_check");
    expect(t.components[0].parameters.map((p: any) => p.text)).toEqual(["#1042", "1,299", "Asha"]);
    expect(t.components.slice(1).map((b: any) => b.parameters[0].payload)).toEqual([
      `pay_yes:${ORDER.orderId}`,
      `pay_no:${ORDER.orderId}`,
    ]);
  });

  it("THE IN-APP NOTIFICATION IS WRITTEN FIRST, and once per order", async () => {
    metaAnswers();
    await notifySellerOfOrder(business(VERIFIED), "d1", ORDER);
    expect(events).toEqual(["notification", "send"]);
    expect(notifications[0]).toMatchObject({ dealershipId: "d1", kind: "dm_order_received", dedupeKey: `dm_order_received:${ORDER.orderId}` });
    expect(notifications[0].title).toContain("#1042");
    expect(notifications[0].title).toContain("₹1,299");
  });

  it("NOTHING IS SENT UNTIL A TEMPLATE IS NAMED — and the seller still sees the order", async () => {
    metaAnswers();
    delete process.env.WHATSAPP_ORDER_TEMPLATE;
    expect(orderTemplateName()).toBeNull();
    const r = await notifySellerOfOrder(business(VERIFIED), "d1", ORDER);
    expect(r.whatsapp).toBe("skipped");
    expect(r.reason).toMatch(/template isn't approved yet/);
    expect(sent).toEqual([]);
    expect(notifications.length).toBe(1);
  });

  it("AN UNVERIFIED NUMBER IS NEVER MESSAGED — its 'yes' would confirm a payment", async () => {
    metaAnswers();
    for (const row of [{ ...VERIFIED, owner_whatsapp_verified: false }, { owner_whatsapp_number: null, owner_whatsapp_verified: true }, null]) {
      const r = await notifySellerOfOrder(business(row), "d1", ORDER);
      expect(r.whatsapp, JSON.stringify(row)).toBe("skipped");
    }
    expect(sent).toEqual([]);
  });

  it("META REFUSING IS RETURNED, NEVER THROWN — the order is already placed", async () => {
    metaAnswers(400, { error: { message: "Template is paused", code: 132015 } });
    const r = await notifySellerOfOrder(business(VERIFIED), "d1", ORDER);
    expect(r.whatsapp).toBe("failed");
    expect(r.reason).toMatch(/Template is paused/);
    expect(notifications.length).toBe(1);
  });

  it("A NUMBER THAT CAN'T BE READ IS A FAILURE, not a skip that looks deliberate", async () => {
    metaAnswers();
    const r = await notifySellerOfOrder(business(null, { message: "boom" }), "d1", ORDER);
    expect(r).toEqual({ whatsapp: "failed", reason: expect.stringContaining("boom") });
    expect(sent).toEqual([]);
  });

  it("A CUSTOMER WITH NO NAME IS 'a customer', never a blank Meta would refuse", async () => {
    metaAnswers();
    await notifySellerOfOrder(business(VERIFIED), "d1", { ...ORDER, customerName: "  " });
    expect(sent[0].body.template.components[0].parameters[2].text).toBe("a customer");
  });

  it("IT IS IN THE REGISTRY (Rule 6): a send, low risk, automatic — to the business's own number", async () => {
    const { getActionPolicy } = await import("@/lib/executionPolicy");
    expect(getActionPolicy("notify_seller_order")).toMatchObject({ actionType: "send", riskLevel: "low", requiresApproval: false });
  });

  it("RUPEES ARE WRITTEN THE INDIAN WAY", () => {
    expect(formatRupees(1299)).toBe("1,299");
    expect(formatRupees(125000)).toBe("1,25,000");
    expect(formatRupees(499.5)).toBe("499.5");
    expect(paymentButtonPayloads("o1")).toEqual(["pay_yes:o1", "pay_no:o1"]);
  });
});

// ---------------------------------------------------------------------
// 5. THE TEMPLATE'S OWN LIST — H3-c's rule, restored 28 November 2026.
//
// channelRules holds FREE-FORM sends to the inbound webhook, and names
// those senders by hand — so a template sender is invisible to it. The
// two rules are different and must stay separate: free-form only INSIDE
// the 24-hour window (the webhook can know someone just messaged);
// a template is what makes an unprompted notice legal at all (and its
// caller is therefore NOT the webhook). One list of both would allow
// the union. Read with comments stripped (Rule 8).
// ---------------------------------------------------------------------
describe("5. ONE FILE MAY SEND A WHATSAPP TEMPLATE", () => {
  const SRC = join(__dirname, "../src");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  const all = walk(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: code(p) }));
  const callers = (files: { path: string; text: string }[]) =>
    files
      .map((f) => ({ path: f.path, text: f.text.replace(/export\s+(?:async\s+)?function\s+sendWhatsAppTemplate\s*\(/g, "«declaration»(") }))
      .filter((f) => /\bsendWhatsAppTemplate\s*\(/.test(f.text))
      .map((f) => f.path);

  it("THE SELLER'S ORDER NOTICE, AND NOTHING ELSE", () => {
    // A hand-written list on purpose: a reviewer reads the line that let
    // a new caller in, the same reason TRANSPORTS is not a folder glob.
    expect(callers(all)).toEqual(["lib/dm/sellerOrderNotice.ts"]);
  });

  it("NOR DOES ANYTHING REACH THE PROVIDER TABLE'S TEMPLATE DOOR AROUND THE FACADE", () => {
    const around = all.filter((f) => f.path !== "lib/whatsapp/client.ts" && /\.sendTemplate\s*\(/.test(f.text)).map((f) => f.path);
    expect(around).toEqual([]);
  });

  it("AND THE NOTICE SENDS NO FREE-FORM MESSAGE — the other half of the rule", () => {
    const notice = all.find((f) => f.path === "lib/dm/sellerOrderNotice.ts");
    expect(notice, "the seller's order notice is gone").toBeTruthy();
    expect(notice!.text).not.toMatch(/\bsendWhatsApp(?:Text|Image)\s*\(/);
  });

  it("THE MEASURE WOULD SEE A CALLER IF THERE WERE ONE, and does not mistake a declaration for one", () => {
    const probe = [
      { path: "fake/caller.ts", text: "await sendWhatsAppTemplate(phone, { name: 'x', variables: [] });" },
      { path: "fake/declarer.ts", text: "export async function sendWhatsAppTemplate(destination: string) {}" },
    ];
    expect(callers(probe)).toEqual(["fake/caller.ts"]);
  });

  it("and both transports really declare it, so the list means something", () => {
    for (const path of ["lib/whatsapp/metaClient.ts", "lib/whatsapp/client.ts"]) {
      const f = all.find((x) => x.path === path);
      expect(f, path).toBeTruthy();
      expect(f!.text, path).toMatch(/export async function sendWhatsAppTemplate\s*\(/);
    }
  });
});
