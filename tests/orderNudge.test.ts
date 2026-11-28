// ONE NUDGE TO A CUSTOMER WHO WAS QUOTED AND WENT QUIET — FU1 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// Scheduled when an order is read back; when it runs it re-checks
// everything and sends ONE message, only inside Meta's 24-hour window,
// at most one a day per customer, claimed before it sends.

import { describe, it, expect, vi, beforeEach } from "vitest";

let lastCustomerAt: string | null;
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt }) }));
const sends: any[] = [];
let sendFails = false;
vi.mock("@/lib/instagram/dm", () => ({
  sendInstagramDmReply: async (...a: any[]) => {
    if (sendFails) throw new Error("(#10) outside the allowed window");
    sends.push(a);
  },
}));
vi.mock("@/lib/crypto/oauthSecrets", () => ({
  INSTAGRAM_TOKEN_SELECT: "instagram_access_token",
  readInstagramToken: (d: any) => d?.instagram_access_token ?? null,
}));

import { scheduleOrderNudge, runOrderNudge, nudgeText, NUDGE_AFTER_MS, NUDGE_ACTION } from "@/lib/dm/orderNudge";
import { handleOrderTurn, type Extraction, type OrderTurnDeps } from "@/lib/dm/orderConversation";
import { getActionPolicy } from "@/lib/executionPolicy";

type Q = { table: string; op: string; filters: Record<string, any>; range: Record<string, any>; payload?: any };
let queries: Q[];
let recent: any[];
let recentError: any;
let claimed: any[];
let business: any;
let draft: any;
let language: string | null;

function db() {
  return {
    from: (table: string) => {
      const q: Q = { table, op: "select", filters: {}, range: {} };
      const answer = () => {
        if (table === "agent_tasks" && q.op === "update") return { data: claimed, error: null };
        if (table === "agent_tasks") return { data: recent, error: recentError };
        if (table === "dealerships") return { data: business, error: null };
        if (table === "dm_order_drafts") return { data: draft, error: null };
        if (table === "brand_profiles") return { data: { preferred_language: language }, error: null };
        return { data: null, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: any) => ((q.op = "update"), (q.payload = p), api),
        insert: async (p: any) => (queries.push({ table, op: "insert", filters: {}, range: {}, payload: p }), { error: null }),
        eq: (c: string, v: any) => ((q.filters[c] = v), api),
        gte: (c: string, v: any) => ((q.range[`${c}>=`] = v), api),
        limit: () => api,
        maybeSingle: async () => (queries.push(q), answer()),
        then: (res: any) => (queries.push(q), Promise.resolve(answer()).then(res)),
      };
      return api;
    },
  };
}

const NOW = new Date("2026-11-28T16:00:00Z");
const QUOTED = "2026-11-28T12:00:00.000Z";
const TASK = { id: "t1", dealership_id: "d1", action_details: { sender_id: "cust-1", readback_sent_at: QUOTED } };

beforeEach(() => {
  queries = [];
  sends.length = 0;
  sendFails = false;
  recent = [];
  recentError = null;
  claimed = [{ id: "t1" }];
  business = { instagram_selling_enabled: true, seller_upi_vpa: "shop@okhdfcbank", instagram_business_id: "ig-1", instagram_access_token: "tok" };
  draft = { status: "open", readback: { total: 950 }, readback_sent_at: QUOTED };
  language = "english";
  lastCustomerAt = "2026-11-28T11:59:00Z";
});

describe("1. SCHEDULED WITH THE READ-BACK — at most one a day per customer", () => {
  it("FOUR HOURS AFTER THE QUOTE, NAMING THE CUSTOMER AND THE QUOTE", async () => {
    expect(await scheduleOrderNudge(db(), { dealershipId: "d1", senderId: "cust-1", readbackSentAt: QUOTED, now: new Date(QUOTED) })).toBe("scheduled");
    const ins = queries.find((q) => q.op === "insert")!;
    expect(ins.payload[0]).toMatchObject({
      dealership_id: "d1",
      action_type: NUDGE_ACTION,
      action_details: { sender_id: "cust-1", readback_sent_at: QUOTED },
      scheduled_for: new Date(new Date(QUOTED).getTime() + NUDGE_AFTER_MS).toISOString(),
    });
    expect(NUDGE_AFTER_MS).toBeLessThan(24 * 3600_000);
    // FU2 rides along (28 Nov 2026): a CARD a day and an hour later.
    expect(ins.payload[1]).toMatchObject({
      dealership_id: "d1",
      action_type: "dm_quote_followup",
      action_details: { sender_id: "cust-1", readback_sent_at: QUOTED },
      scheduled_for: new Date(new Date(QUOTED).getTime() + 25 * 3600_000).toISOString(),
    });
    expect(ins.payload).toHaveLength(2);
  });

  it("NOT AGAIN WHILE ANOTHER FOR THIS CUSTOMER WAS SCHEDULED IN THE LAST DAY", async () => {
    recent = [{ id: "t0" }];
    expect(await scheduleOrderNudge(db(), { dealershipId: "d1", senderId: "cust-1", readbackSentAt: QUOTED, now: NOW })).toBe("skipped");
    const check = queries[0];
    expect(check.filters).toEqual({ dealership_id: "d1", action_type: NUDGE_ACTION, "action_details->>sender_id": "cust-1" });
    expect(check.range["created_at>="]).toBe(new Date(NOW.getTime() - 24 * 3600_000).toISOString());
    expect(queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("IF EARLIER NUDGES CAN'T BE READ, NO SECOND ONE IS RISKED — and it never throws", async () => {
    recentError = { message: "boom" };
    expect(await scheduleOrderNudge(db(), { dealershipId: "d1", senderId: "cust-1", readbackSentAt: QUOTED, now: NOW })).toBe("skipped");
    const broken = { from: () => { throw new Error("gone"); } };
    await expect(scheduleOrderNudge(broken, { dealershipId: "d1", senderId: "cust-1", readbackSentAt: QUOTED, now: NOW })).resolves.toBe("skipped");
  });

  it("THE ORDER FLOW SCHEDULES ONE WITH EVERY READ-BACK, AND ONLY THEN", async () => {
    const scheduled: string[] = [];
    const base = (ex: Partial<Extraction>): OrderTurnDeps =>
      ({
        now: new Date(QUOTED),
        language: "english",
        catalog: [{ id: "p1", name: "Clay Mug" }],
        loadDraft: async () => null,
        saveDraft: async () => {},
        claimReadback: async () => true,
        extract: async () => ({ intent: "order", items: null, name: null, phone: null, address: null, ...ex }),
        price: async () => ({ ok: true, resolvedItems: [{ product_id: "p1", name: "Clay Mug", price: 450, quantity: 1 }], productMap: new Map(), subtotal: 450, discountAmount: 0, appliedDiscountId: null, shippingAmount: 0, total: 450 }),
        placeOrder: async () => ({ ok: false, error: "x" }),
        paymentRequest: () => ({ text: "", qrUrl: "" }),
        notifySeller: async () => {},
        scheduleNudge: async (at: string) => void scheduled.push(at),
      }) as any;
    await handleOrderTurn("…", base({ items: [{ product: "Clay Mug", quantity: 1 }], name: "Asha", phone: "9800000001", address: "12 Lake Road" }));
    expect(scheduled).toEqual([QUOTED]);
    await handleOrderTurn("…", base({ items: [{ product: "Clay Mug", quantity: 1 }] }));
    expect(scheduled).toEqual([QUOTED]);
  });
});

describe("2. WHEN IT RUNS — every condition re-checked", () => {
  it("ALL STILL TRUE: ONE MESSAGE, WITH THE QUOTE'S OWN TOTAL, LOGGED WITHOUT INCOMING TEXT", async () => {
    expect(await runOrderNudge(db(), TASK, NOW)).toEqual({ sent: true, why: "sent" });
    expect(sends).toEqual([["tok", "ig-1", "cust-1", nudgeText(950, "english")]]);
    expect(nudgeText(950, "english")).toBe("Just checking in — your order (₹950) is ready to place. Reply YES to place it, or tell me what to change.");
    const log = queries.find((q) => q.table === "auto_reply_log")!;
    expect(log.payload).toMatchObject({ channel: "dm_instagram", source_id: "cust-1", incoming_text: null, success: true });
  });

  it("CLAIMED FIRST — the run that doesn't move it from pending sends nothing", async () => {
    claimed = [];
    expect(await runOrderNudge(db(), TASK, NOW)).toEqual({ sent: false, why: "another run has it" });
    expect(sends).toEqual([]);
    const claim = queries.find((q) => q.table === "agent_tasks" && q.op === "update")!;
    expect(claim.payload).toEqual({ status: "processing" });
    expect(claim.filters).toEqual({ id: "t1", status: "pending" });
  });

  const skips: [string, () => void, RegExp][] = [
    ["Seller Mode switched off", () => (business.instagram_selling_enabled = false), /Seller Mode is off/],
    ["the UPI ID cleared", () => (business.seller_upi_vpa = null), /Seller Mode is off/],
    ["the order already placed", () => (draft.status = "ordered"), /nothing is waiting/],
    ["the read-back answered", () => ((draft.readback = null), (draft.readback_sent_at = null)), /nothing is waiting/],
    ["a newer quote", () => (draft.readback_sent_at = "2026-11-28T13:00:00.000Z"), /quote has changed/],
    ["the customer wrote since", () => (lastCustomerAt = "2026-11-28T12:30:00Z"), /written since/],
    ["Meta's window closed", () => (lastCustomerAt = "2026-11-27T15:00:00Z"), /24-hour window has closed/],
    ["Instagram disconnected", () => (business.instagram_access_token = null), /isn't connected/],
  ];
  for (const [what, arrange, why] of skips) {
    it(`NOTHING SENT WHEN ${what.toUpperCase()}`, async () => {
      arrange();
      const r = await runOrderNudge(db(), TASK, NOW);
      expect(r.sent).toBe(false);
      expect(r.why).toMatch(why);
      expect(sends).toEqual([]);
    });
  }

  it("A SEND META REFUSES THROWS — the dispatcher retries, and the retry re-checks everything", async () => {
    sendFails = true;
    await expect(runOrderNudge(db(), TASK, NOW)).rejects.toThrow(/outside the allowed window/);
  });

  it("IN THE OWNER'S LANGUAGE", () => {
    expect(nudgeText(1299, "hinglish")).toMatch(/^Bas check kar rahe the — aapka order \(₹1,299\)/);
    expect(nudgeText(1299, "hindi")).toMatch(/₹1,299/);
  });
});

describe("3. REGISTERED (Rule 6), AND RUN BY THE DISPATCHER", () => {
  it("A SEND, MEDIUM RISK, AUTOMATIC — one message inside Meta's window", () => {
    expect(getActionPolicy(NUDGE_ACTION)).toMatchObject({ actionType: "send", riskLevel: "medium", requiresApproval: false });
  });

  it("THE DISPATCHER HAS AN EXECUTOR FOR IT", async () => {
    const { TASK_EXECUTORS } = await import("@/lib/tasks/taskExecutors");
    expect(typeof TASK_EXECUTORS[NUDGE_ACTION]).toBe("function");
  });
});
