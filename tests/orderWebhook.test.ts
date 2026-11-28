// THE WEBHOOK'S HALF OF O1 — Seller Mode, 28 November 2026.
//
// The order conversation decides what to say; the webhook sends it, in
// order, and records what happened. Two things matter most: the payment
// request's TEXT goes first (it carries the UPI ID, so a refused QR image
// costs one way to pay, not the payment), and an order whose payment
// request never arrived is told to the seller.
//
// SELLER_MODE_TAKES_ORDERS is false in the product until O3/O4′. It is
// switched on HERE ONLY, through a mock, to drive the path that will run.

import { describe, it, expect, vi, beforeEach } from "vitest";

let turn: any;
let turnThrows: boolean;
let depsCtx: any[];
let replies: any[];
let health: any[];
let told: any[];
let sends: { url: string; body: any }[];
let failText: boolean;
let failImage: boolean;
let logRows: any[];
let business: any;

vi.mock("@/lib/dm/sellerMode", async (orig) => ({ ...(await orig<any>()), SELLER_MODE_TAKES_ORDERS: true }));
vi.mock("@/lib/dm/orderConversation", () => ({
  handleOrderTurn: async () => {
    if (turnThrows) throw new Error("drafts table unreadable");
    return turn;
  },
}));
vi.mock("@/lib/dm/orderTurnDeps", () => ({ buildOrderTurnDeps: (_s: any, ctx: any) => (depsCtx.push(ctx), {}) }));
vi.mock("@/lib/agents/socialManagementAgent", () => ({
  generateAutoReply: async (...a: any[]) => (replies.push(a[1]), { reply: "Ordinary reply." }),
}));
vi.mock("@/lib/integrations/health", () => ({ recordHealth: async (_s: any, _d: any, key: string, h: any) => (health.push([key, h.state]), { recorded: true, notified: false }) }));
vi.mock("@/lib/dm/escalation", async (orig) => ({
  ...(await orig<any>()),
  tellSellerCustomerIsWaiting: async (_s: any, input: any) => told.push(input),
}));
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt: null }) }));
vi.mock("@/lib/businessBrain", () => ({
  getBusinessContext: async () => ({ toneOfVoice: null, facts: { brand: { language: "english" } }, knowledgeFacts: null }),
}));
vi.mock("@/lib/agents/personas", () => ({ resolvePersona: async () => ({ goals: [] }) }));
vi.mock("@/lib/claims/businessFacts", () => ({ fetchCatalog: async () => [{ id: "p1", name: "Clay Mug", price: 450, kind: "product", active: true }] }));
vi.mock("@/lib/email/consent", () => ({ siteUrl: () => "https://example.test" }));
vi.mock("@/lib/leads/dmLeadLinking", () => ({ resolveDmLead: async () => "lead-1" }));
vi.mock("@/lib/businessMemory/getLeadMemory", () => ({ getLeadMemory: async () => [] }));
vi.mock("@/lib/webhooks/deliveryLog", () => ({ recordDelivery: async () => {} }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({
  readMetaPageToken: () => null,
  INSTAGRAM_TOKEN_SELECT: "instagram_access_token",
  readInstagramToken: (d: any) => d?.instagram_access_token ?? null,
}));

function db() {
  return {
    from: (table: string) => {
      const filters: Record<string, any> = {};
      const api: any = {
        select: () => api,
        eq: (col: string, val: any) => ((filters[col] = val), api),
        maybeSingle: async () => ({ data: table === "dealerships" && filters.instagram_business_id ? business : null, error: null }),
        insert: async (row: any) => {
          if (table === "auto_reply_log") logRows.push(row);
          return { error: null };
        },
      };
      return api;
    },
  } as any;
}

import { handleAutoReplyEntry } from "@/lib/webhooks/autoReplyHandler";

const entry = { id: "ig-business-1", messaging: [{ sender: { id: "cust-1" }, message: { text: "yes" } }] };

beforeEach(() => {
  turn = { handled: false };
  turnThrows = false;
  depsCtx = [];
  replies = [];
  health = [];
  told = [];
  sends = [];
  failText = false;
  failImage = false;
  logRows = [];
  business = {
    id: "d1",
    dealership_name: "Asha Crafts",
    business_category: "crafts",
    instagram_access_token: "tok-ig-9",
    dm_auto_reply_enabled: true,
    comment_auto_reply_enabled: false,
    instagram_selling_enabled: true,
    seller_upi_vpa: "shop@okhdfcbank",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      sends.push({ url: String(url), body });
      const isImage = !!body.message?.attachment;
      const fail = isImage ? failImage : failText;
      return { ok: !fail, status: fail ? 400 : 200, json: async () => (fail ? { error: { message: isImage ? "image refused" : "text refused" } } : {}) };
    })
  );
});

const PAYMENT = { handled: true, orderId: "o1", messages: [{ text: "To pay for order #ABC: ₹950" }, { imageUrl: "https://example.test/api/public/pay/upi-qr/o1" }] };

describe("the webhook sends an order turn", () => {
  it("TEXT FIRST, THEN THE QR IMAGE — and the ordinary reply is NOT also sent", async () => {
    turn = PAYMENT;
    await handleAutoReplyEntry(entry, db());
    expect(sends.map((s) => (s.body.message.attachment ? `image:${s.body.message.attachment.payload.url}` : `text:${s.body.message.text}`))).toEqual([
      "text:To pay for order #ABC: ₹950",
      "image:https://example.test/api/public/pay/upi-qr/o1",
    ]);
    expect(sends.every((s) => s.url.includes("graph.instagram.com") && s.url.includes("/ig-business-1/messages"))).toBe(true);
    expect(sends[0].body.recipient).toEqual({ id: "cust-1" });
    expect(replies).toEqual([]);
  });

  it("WHAT WAS SENT IS LOGGED — so the next turn's memory has the read-back", async () => {
    turn = PAYMENT;
    await handleAutoReplyEntry(entry, db());
    expect(logRows).toEqual([
      expect.objectContaining({ channel: "dm_instagram", source_id: "cust-1", incoming_text: "yes", reply_text: "To pay for order #ABC: ₹950\n\n[UPI QR code]", success: true, error: null }),
    ]);
    expect(health).toEqual([["instagram", "working"]]);
  });

  it("A REFUSED QR IMAGE IS RECORDED, AND THE ORDER STANDS — the text already carried the UPI ID", async () => {
    turn = PAYMENT;
    failImage = true;
    await handleAutoReplyEntry(entry, db());
    expect(logRows[0]).toMatchObject({ success: true, reply_text: "To pay for order #ABC: ₹950" });
    expect(logRows[0].error).toMatch(/QR image wasn't sent: image refused/);
    expect(told).toEqual([]);
  });

  it("A PAYMENT REQUEST THAT NEVER ARRIVED IS TOLD TO THE SELLER — the customer is waiting for a UPI ID", async () => {
    turn = PAYMENT;
    failText = true;
    await handleAutoReplyEntry(entry, db());
    expect(logRows[0]).toMatchObject({ success: false, reply_text: null });
    expect(told).toEqual([expect.objectContaining({ dealershipId: "d1", senderId: "cust-1", why: expect.stringMatching(/payment request couldn't be sent/) })]);
    expect(health).toEqual([["instagram", expect.not.stringMatching(/^working$/)]]);
  });

  it("A FAILED QUESTION (NO ORDER YET) IS RECORDED, BUT NOBODY IS TOLD AN ORDER IS WAITING", async () => {
    turn = { handled: true, messages: [{ text: "What name should the order be under?" }] };
    failText = true;
    await handleAutoReplyEntry(entry, db());
    expect(logRows[0]).toMatchObject({ success: false });
    expect(told).toEqual([]);
  });

  it("THE SAME YES DELIVERED TWICE SENDS NOTHING, and says why in the log", async () => {
    turn = { handled: true, messages: [], note: "this yes was already taken by another delivery" };
    await handleAutoReplyEntry(entry, db());
    expect(sends).toEqual([]);
    expect(logRows[0]).toMatchObject({ reply_text: null, error: "this yes was already taken by another delivery" });
  });
});

describe("when the order step stands aside", () => {
  it("NOT AN ORDER: THE ORDINARY REPLY ANSWERS", async () => {
    await handleAutoReplyEntry(entry, db());
    expect(replies).toEqual(["yes"]);
    expect(sends.map((s) => s.body.message.text)).toEqual(["Ordinary reply."]);
  });

  it("THE ORDER STEP FAILING FALLS BACK TO THE ORDINARY REPLY, never to silence", async () => {
    turnThrows = true;
    turn = PAYMENT;
    await handleAutoReplyEntry(entry, db());
    expect(replies).toEqual(["yes"]);
  });

  it("SELLER MODE OFF, OR NO UPI ID: THE ORDER STEP IS NEVER ASKED", async () => {
    turn = PAYMENT;
    business.instagram_selling_enabled = false;
    await handleAutoReplyEntry(entry, db());
    business.instagram_selling_enabled = true;
    business.seller_upi_vpa = null;
    await handleAutoReplyEntry(entry, db());
    expect(depsCtx).toEqual([]);
    expect(replies).toEqual(["yes", "yes"]);
  });

  it("IT IS GIVEN THE SELLER'S UPI ID, THE OWNER'S LANGUAGE AND THIS CUSTOMER", async () => {
    await handleAutoReplyEntry(entry, db());
    expect(depsCtx[0]).toMatchObject({ dealershipId: "d1", dealershipName: "Asha Crafts", upiVpa: "shop@okhdfcbank", senderId: "cust-1", language: "english" });
  });
});
