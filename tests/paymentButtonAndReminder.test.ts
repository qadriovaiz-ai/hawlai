// THE SELLER'S WHATSAPP ANSWER, AND THE ONE REMINDER — O3 + O4′ of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// A tap on the payment-check template names its order in the payload
// WA-T put there. "Yes, received" confirms through the order's own
// approval card; "Not yet" changes nothing but stops the reminder.
// The reminder goes once, 15 minutes after an unanswered notice.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";

const decisions: any[] = [];
let decisionResponse: { ok: boolean; body: any };
vi.mock("@/lib/approvals/decide", () => ({
  applyApprovalDecision: async (...a: any[]) => (decisions.push(a), { ok: decisionResponse.ok, json: async () => decisionResponse.body }),
}));
const confirms: any[] = [];
vi.mock("@/lib/orders/confirmDmPayment", () => ({
  confirmDmPayment: async (...a: any[]) => (confirms.push(a), { ok: true, note: "Order #6B1F0C confirmed as paid (₹950).", reference: "#6B1F0C", invoice: "sent" }),
}));
const notices: any[] = [];
let noticeResult: any;
vi.mock("@/lib/dm/sellerOrderNotice", () => ({ notifySellerOfOrder: async (...a: any[]) => (notices.push(a), noticeResult) }));

import { readButtonTaps, parsePaymentPayload, handlePaymentTap } from "@/lib/whatsapp/paymentButton";
import { remindUnconfirmedPayments, REMINDER_AFTER_MS } from "@/lib/orders/paymentReminders";

type Q = { table: string; op: string; filters: Record<string, any>; is: Record<string, any>; range: Record<string, any>; payload?: any };
let queries: Q[];
let card: any;
let order: any;
let waiting: any[];
let claimed: any[];
let readFails: boolean;

function db() {
  return {
    from: (table: string) => {
      const q: Q = { table, op: "select", filters: {}, is: {}, range: {} };
      const answer = () => {
        if (readFails) return { data: null, error: { message: "boom" } };
        if (table === "pending_approvals") return { data: card, error: null };
        if (table === "orders" && q.op === "update") return { data: claimed, error: null };
        if (table === "orders" && q.filters.channel) return { data: waiting, error: null };
        return { data: order, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: any) => ((q.op = "update"), (q.payload = p), api),
        eq: (c: string, v: any) => ((q.filters[c] = v), api),
        is: (c: string, v: any) => ((q.is[c] = v), api),
        lte: (c: string, v: any) => ((q.range[`${c}<=`] = v), api),
        gte: (c: string, v: any) => ((q.range[`${c}>=`] = v), api),
        order: () => api,
        limit: () => api,
        maybeSingle: async () => (queries.push(q), answer()),
        then: (res: any) => (queries.push(q), Promise.resolve(answer()).then(res)),
      };
      return api;
    },
  };
}

const ORDER_ID = "6b1f0c2e-0000-4000-8000-000000000042";
const NOW = new Date("2026-11-28T12:00:00Z");
const BUSINESS = { id: "d1", owner_id: "owner-1" };

beforeEach(() => {
  queries = [];
  decisions.length = 0;
  confirms.length = 0;
  notices.length = 0;
  decisionResponse = { ok: true, body: { produced: { note: "Order #6B1F0C confirmed as paid (₹950). Stock updated." } } };
  card = { id: "ap-1" };
  order = { id: ORDER_ID };
  waiting = [];
  claimed = [{ id: "x" }];
  readFails = false;
  noticeResult = { whatsapp: "sent" };
});

describe("1. READING A TAP", () => {
  const delivery = (messages: any[], field = "messages") => ({ entry: [{ changes: [{ field, value: { messages } }] }] });

  it("A QUICK-REPLY TAP IS READ WITH ITS PAYLOAD AND ITS SENDER", () => {
    const taps = readButtonTaps(delivery([{ from: "919800000001", type: "button", button: { payload: `pay_yes:${ORDER_ID}`, text: "Yes, received" } }]));
    expect(taps).toEqual([{ phone: "919800000001", payload: `pay_yes:${ORDER_ID}` }]);
  });

  it("TEXT, OTHER TYPES, OTHER FIELDS, AND A TAP WITH NO PAYLOAD ARE NOT TAPS", () => {
    expect(readButtonTaps(delivery([{ from: "91", type: "text", text: { body: "haan" } }, { from: "91", type: "image" }, { from: "91", type: "button", button: { text: "Yes" } }]))).toEqual([]);
    expect(readButtonTaps(delivery([{ from: "91", type: "button", button: { payload: "x" } }], "account_update"))).toEqual([]);
    expect(readButtonTaps(null)).toEqual([]);
  });

  it("ONLY OUR OWN PAYLOAD SHAPE IS AN ANSWER — anything else is not guessed at", () => {
    expect(parsePaymentPayload(`pay_yes:${ORDER_ID}`)).toEqual({ answer: "yes", orderId: ORDER_ID });
    expect(parsePaymentPayload(`PAY_NO:${ORDER_ID.toUpperCase()}`)).toEqual({ answer: "no", orderId: ORDER_ID });
    for (const bad of ["pay_yes", "pay_maybe:" + ORDER_ID, `pay_yes:${ORDER_ID}x`, "approve:abc", ""]) expect(parsePaymentPayload(bad), bad).toBeNull();
  });
});

describe("2. 'YES, RECEIVED'", () => {
  it("GOES THROUGH THE ORDER'S OWN CARD, AS THE OWNER, LABELLED WHATSAPP — and says what happened", async () => {
    const reply = await handlePaymentTap(db(), BUSINESS, "919800000001", `pay_yes:${ORDER_ID}`, NOW);
    expect(queries[0].filters).toEqual({ dealership_id: "d1", action_type: "confirm_dm_payment", status: "pending", "action_details->>order_id": ORDER_ID });
    expect(decisions).toEqual([["ap-1", { status: "approved" }, { userId: "owner-1", role: "owner", label: "whatsapp:919800000001" }]]);
    expect(reply).toBe("Order #6B1F0C confirmed as paid (₹950). Stock updated.");
    expect(confirms).toEqual([]);
  });

  it("A CARD THAT WAS ALREADY DECIDED IS SAID, not reported as done", async () => {
    decisionResponse = { ok: false, body: { error: "You already approved this one and it was carried out then, so nothing was done again." } };
    expect(await handlePaymentTap(db(), BUSINESS, "91", `pay_yes:${ORDER_ID}`, NOW)).toMatch(/Couldn't confirm order #6B1F0C: You already approved/);
  });

  it("NO CARD (IT COULDN'T BE MADE): THE SAME CONFIRMATION, DIRECTLY, FOR THIS BUSINESS", async () => {
    card = null;
    const reply = await handlePaymentTap(db(), BUSINESS, "91", `pay_yes:${ORDER_ID}`, NOW);
    expect(confirms).toEqual([[expect.anything(), "d1", ORDER_ID, { now: NOW }]]);
    expect(reply).toMatch(/confirmed as paid/);
  });

  it("A CARD THAT CAN'T BE READ CONFIRMS NOTHING", async () => {
    readFails = true;
    expect(await handlePaymentTap(db(), BUSINESS, "91", `pay_yes:${ORDER_ID}`, NOW)).toMatch(/Couldn't read order #6B1F0C's payment check/);
    expect(decisions).toEqual([]);
    expect(confirms).toEqual([]);
  });
});

describe("3. 'NOT YET'", () => {
  it("CHANGES NOTHING ABOUT THE ORDER, BUT IS AN ANSWER — so no reminder follows", async () => {
    const reply = await handlePaymentTap(db(), BUSINESS, "91", `pay_no:${ORDER_ID}`, NOW);
    const mark = queries.find((q) => q.op === "update")!;
    expect(mark.payload).toEqual({ payment_reminder_sent_at: NOW.toISOString() });
    expect(mark.filters).toEqual({ id: ORDER_ID, dealership_id: "d1" });
    expect(mark.is).toEqual({ payment_reminder_sent_at: null });
    expect(reply).toMatch(/stays unpaid for now/);
    expect(decisions).toEqual([]);
    expect(confirms).toEqual([]);
  });

  it("ANOTHER BUSINESS'S ORDER IS NOT TOUCHED", async () => {
    order = null;
    expect(await handlePaymentTap(db(), BUSINESS, "91", `pay_no:${ORDER_ID}`, NOW)).toMatch(/isn't one of yours/);
    expect(queries.some((q) => q.op === "update")).toBe(false);
  });

  it("A PAYLOAD THAT ISN'T A PAYMENT ANSWER GETS NO REPLY AND DOES NOTHING", async () => {
    expect(await handlePaymentTap(db(), BUSINESS, "91", "something_else", NOW)).toBeNull();
    expect(queries).toEqual([]);
  });
});

describe("4. THE WEBHOOK READS TAPS SEPARATELY, FROM A VERIFIED OWNER ONLY — comments stripped", () => {
  const src = code("src/app/api/webhooks/whatsapp/route.ts");

  it("TAPS ARE READ BY THEIR OWN PARSER, META ONLY, AND EACH IS HANDLED", () => {
    expect(src).toMatch(/const taps = provider === "meta" \? readButtonTaps\(body\) : \[\];\s*for \(const tap of taps\) \{\s*await handleOneTap\(tap\.phone, tap\.payload, supabase\);/);
  });

  it("THE TAPPER MUST BE THIS BUSINESS'S VERIFIED NUMBER", () => {
    const start = src.indexOf("async function handleOneTap(");
    const end = src.indexOf("export async function GET(", start);
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, end);
    expect(fn).toMatch(/\.eq\("owner_whatsapp_number", phone\)\s*\.eq\("owner_whatsapp_verified", true\)/);
    expect(fn).toMatch(/if \(!dealership\) \{[\s\S]*?return;\s*\}\s*const reply = await handlePaymentTap\(/);
  });

  it("A DELIVERY OF ONLY TAPS IS NOT LOGGED AS 'NOTHING ACTIONABLE'", () => {
    // W1 (28 Nov 2026) added photos to the same rule: a delivery of only photos isn't "nothing" either.
    expect(src).toMatch(/if \(!read\.messages\.length && !taps\.length && !photos\.length && read\.skipped\.length\)/);
  });

  it("AND THE DISPATCHER RUNS THE REMINDER SWEEP AS A FUNCTION, not a fetch", () => {
    expect(code("src/app/api/events/dispatch/route.ts")).toMatch(/const paymentReminders = await remindUnconfirmedPayments\(supabase\);/);
  });
});

describe("5. THE ONE REMINDER", () => {
  it("UNPAID, NEW, INSTAGRAM, NOT YET REMINDED, BETWEEN 15 MINUTES AND A DAY OLD", async () => {
    await remindUnconfirmedPayments(db(), NOW);
    const read = queries[0];
    expect(read.filters).toEqual({ channel: "instagram", payment_status: "pending", status: "new" });
    expect(read.is).toEqual({ payment_reminder_sent_at: null });
    expect(read.range["created_at<="]).toBe(new Date(NOW.getTime() - REMINDER_AFTER_MS).toISOString());
    expect(read.range["created_at>="]).toBe(new Date(NOW.getTime() - 24 * 3600_000).toISOString());
  });

  it("CLAIMED BEFORE THE SELLER IS MESSAGED, THEN SENT ONCE", async () => {
    waiting = [{ id: "o1", dealership_id: "d1", total: 950, customer_name: "Asha", upi_reference: "#6B1F0C" }];
    const r = await remindUnconfirmedPayments(db(), NOW);
    const claim = queries.find((q) => q.op === "update")!;
    expect(claim.payload).toEqual({ payment_reminder_sent_at: NOW.toISOString() });
    expect(claim.is).toEqual({ payment_reminder_sent_at: null });
    expect(notices).toEqual([[expect.anything(), "d1", { orderId: "o1", orderRef: "#6B1F0C", amount: 950, customerName: "Asha" }]]);
    expect(r).toEqual({ reminded: 1, failed: 0 });
  });

  it("ANOTHER RUN HAS IT: NOTHING SENT", async () => {
    waiting = [{ id: "o1", dealership_id: "d1", total: 950, customer_name: "Asha", upi_reference: null }];
    claimed = [];
    expect(await remindUnconfirmedPayments(db(), NOW)).toEqual({ reminded: 0, failed: 0 });
    expect(notices).toEqual([]);
  });

  it("A FAILED WHATSAPP SEND IS COUNTED — and the reminder is not retried into a stream", async () => {
    waiting = [{ id: "o1", dealership_id: "d1", total: 950, customer_name: "Asha", upi_reference: null }];
    noticeResult = { whatsapp: "failed", reason: "template paused" };
    expect(await remindUnconfirmedPayments(db(), NOW)).toEqual({ reminded: 0, failed: 1 });
  });

  it("IT NEVER THROWS — the dispatcher has other work", async () => {
    readFails = true;
    await expect(remindUnconfirmedPayments(db(), NOW)).resolves.toEqual({ reminded: 0, failed: 1 });
    const broken = { from: () => { throw new Error("client gone"); } };
    await expect(remindUnconfirmedPayments(broken, NOW)).resolves.toEqual({ reminded: 0, failed: 1 });
  });
});
