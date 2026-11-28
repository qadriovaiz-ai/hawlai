// THE SELLER SAYS THE UPI PAYMENT ARRIVED — O3 + O4′ of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md, 28 November 2026.
//
// One function behind four doors. It claims the order (only an unpaid,
// new Instagram order of THIS business), moves stock HERE and nowhere
// earlier, and sends the customer a text invoice only inside Meta's
// 24-hour window.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sideEffects: any[] = [];
let sideEffectsThrow = false;
vi.mock("@/lib/orderFulfillment", () => ({
  applyOrderSideEffects: async (_s: any, opts: any) => {
    if (sideEffectsThrow) throw new Error("inventory write failed");
    sideEffects.push(opts);
  },
}));
let lastCustomerAt: string | null;
vi.mock("@/lib/dm/thread", async (orig) => ({ ...(await orig<any>()), readDmThread: async () => ({ turns: [], lastCustomerAt }) }));
const dms: any[] = [];
let dmFails = false;
vi.mock("@/lib/instagram/dm", () => ({
  sendInstagramDmReply: async (...a: any[]) => {
    if (dmFails) throw new Error("(#10) outside the allowed window");
    dms.push(a);
  },
}));
vi.mock("@/lib/crypto/oauthSecrets", () => ({
  INSTAGRAM_TOKEN_SELECT: "instagram_access_token",
  readInstagramToken: (d: any) => d?.instagram_access_token ?? null,
}));

import { confirmDmPayment, invoiceText } from "@/lib/orders/confirmDmPayment";
import { dispatcherFor } from "@/lib/dispatch/registry";
import { code } from "./helpers/source";
import { getActionPolicy } from "@/lib/executionPolicy";

type Q = { table: string; op: string; filters: Record<string, any>; payload?: any };
let queries: Q[];
let claimRows: any[];
let claimError: any;
let current: any;
let products: any[] | null;
let productsError: any;
let business: any;
let language: string | null;

function db() {
  return {
    from: (table: string) => {
      const q: Q = { table, op: "select", filters: {} };
      const answer = () => {
        if (table === "orders" && q.op === "update") return { data: claimRows, error: claimError };
        if (table === "orders") return { data: current, error: null };
        if (table === "products") return { data: products, error: productsError };
        if (table === "dealerships") return { data: business, error: null };
        if (table === "brand_profiles") return { data: { preferred_language: language }, error: null };
        return { data: null, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: any) => ((q.op = "update"), (q.payload = p), api),
        insert: async (p: any) => (queries.push({ table, op: "insert", filters: {}, payload: p }), { error: null }),
        eq: (c: string, v: any) => ((q.filters[c] = v), api),
        in: (c: string, v: any) => ((q.filters[c] = v), api),
        maybeSingle: async () => (queries.push(q), answer()),
        then: (res: any) => (queries.push(q), Promise.resolve(answer()).then(res)),
      };
      return api;
    },
  };
}

const NOW = new Date("2026-11-28T12:00:00Z");
const ORDER = {
  id: "6b1f0c2e-0000-4000-8000-000000000042",
  customer_name: "Asha",
  customer_phone: "9800000001",
  customer_email: null,
  shipping_address: "12 Lake Road, Pune",
  items: [{ product_id: "p1", name: "Clay Mug", price: 450, quantity: 2 }],
  subtotal: 900,
  discount_amount: 0,
  shipping_amount: 50,
  total: 950,
  instagram_sender_id: "cust-1",
  upi_reference: "#6B1F0C",
  created_at: "2026-11-28T11:50:00Z",
};

beforeEach(() => {
  queries = [];
  sideEffects.length = 0;
  sideEffectsThrow = false;
  dms.length = 0;
  dmFails = false;
  claimRows = [ORDER];
  claimError = null;
  current = null;
  products = [{ id: "p1", inventory_count: 5 }];
  productsError = null;
  business = { dealership_name: "asha_crafts", instagram_business_id: "ig-1", instagram_access_token: "tok" };
  language = "english";
  lastCustomerAt = "2026-11-28T11:58:00Z";
});

describe("1. THE CLAIM — only an unpaid, new Instagram order of this business", () => {
  it("PAID AND CONFIRMED IN ONE CONDITIONAL UPDATE", async () => {
    const r = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(r).toMatchObject({ ok: true, reference: "#6B1F0C", invoice: "sent" });
    const claim = queries.find((q) => q.table === "orders" && q.op === "update")!;
    expect(claim.payload).toMatchObject({ payment_status: "paid", status: "confirmed" });
    expect(claim.filters).toEqual({ id: ORDER.id, dealership_id: "d1", channel: "instagram", payment_status: "pending", status: "new" });
  });

  const misses: [string, any, number, RegExp][] = [
    ["already paid", { channel: "instagram", payment_status: "paid", status: "confirmed" }, 409, /already confirmed as paid/],
    ["cancelled", { channel: "instagram", payment_status: "pending", status: "cancelled" }, 409, /was cancelled/],
    ["a website order", { channel: "website", payment_status: "pending", status: "new" }, 400, /isn't an Instagram order/],
    ["another business's", null, 404, /isn't one of yours/],
  ];
  for (const [what, row, status, why] of misses) {
    it(`NOTHING HAPPENS TO ${what.toUpperCase()}, AND IT SAYS WHY`, async () => {
      claimRows = [];
      current = row;
      const r = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
      expect(r).toMatchObject({ ok: false, status });
      expect((r as any).error).toMatch(why);
      expect(sideEffects).toEqual([]);
      expect(dms).toEqual([]);
    });
  }
});

describe("2. STOCK MOVES HERE, AT THE SELLER'S WORD", () => {
  it("THE SIDE EFFECTS RUN ONCE, AS A UPI PAYMENT ON AN INSTAGRAM ORDER, WITH TODAY'S STOCK", async () => {
    await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(sideEffects.length).toBe(1);
    expect(sideEffects[0]).toMatchObject({ orderId: ORDER.id, dealershipId: "d1", paymentMethod: "upi", channel: "instagram", total: 950, resolvedItems: ORDER.items });
    expect(sideEffects[0].productMap.get("p1")).toEqual({ inventory_count: 5 });
    // Stock read for THIS business only.
    expect(queries.find((q) => q.table === "products")!.filters).toEqual({ id: ["p1"], dealership_id: "d1" });
  });

  it("A STOCK READ THAT FAILED IS SAID — never 'stock updated'", async () => {
    products = null;
    productsError = { message: "boom" };
    const r: any = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.note).toMatch(/stock couldn't be read, so it wasn't reduced/);
    expect(r.note).not.toMatch(/Stock updated/);
  });

  it("A SIDE-EFFECT FAILURE IS SAID — the order stays confirmed", async () => {
    sideEffectsThrow = true;
    const r: any = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.note).toMatch(/updating stock hit a problem/);
  });
});

describe("3. THE INVOICE — inside Meta's window only", () => {
  it("SENT TO THE CUSTOMER WHO ORDERED, FROM THE SHOP'S INSTAGRAM, AND LOGGED", async () => {
    await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(dms.length).toBe(1);
    const [token, igId, recipient, text] = dms[0];
    expect([token, igId, recipient]).toEqual(["tok", "ig-1", "cust-1"]);
    expect(text).toBe(invoiceText(ORDER, "Asha Crafts", "english", NOW));
    const log = queries.find((q) => q.table === "auto_reply_log")!;
    expect(log.payload).toMatchObject({ channel: "dm_instagram", source_id: "cust-1", incoming_text: null, reply_text: text, success: true });
  });

  it("OUTSIDE 24 HOURS OF THE CUSTOMER'S LAST MESSAGE: NOT SENT, AND THE SELLER IS TOLD TO SEND IT", async () => {
    lastCustomerAt = "2026-11-27T11:00:00Z";
    const r: any = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(dms).toEqual([]);
    expect(r.invoice).toBe("not_sent");
    expect(r.note).toMatch(/more than 24 hours ago.*send it to them yourself/);
    // The payment is still confirmed and stock still moved.
    expect(sideEffects.length).toBe(1);
  });

  it("NO RECORDED CUSTOMER, OR NO INSTAGRAM CONNECTION: NOT SENT, AND SAID", async () => {
    claimRows = [{ ...ORDER, instagram_sender_id: null }];
    expect(((await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW })) as any).note).toMatch(/doesn't record which Instagram customer/);
    claimRows = [ORDER];
    business = { dealership_name: "x", instagram_business_id: "ig-1", instagram_access_token: null };
    expect(((await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW })) as any).note).toMatch(/Instagram isn't connected/);
    expect(dms).toEqual([]);
  });

  it("A SEND META REFUSES IS SAID, NEVER THROWN — the confirmation stands", async () => {
    dmFails = true;
    const r: any = await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(r).toMatchObject({ ok: true, invoice: "not_sent" });
    expect(r.note).toMatch(/couldn't be sent \(\(#10\)/);
  });

  it("THE WORDS: payment received, the order, the date in India, each line, delivery, total, the shop", () => {
    const t = invoiceText(ORDER, "Asha Crafts", "english", NOW);
    expect(t.split("\n")).toEqual([
      "Payment received — thank you!",
      "Invoice — order #6B1F0C",
      "Date: 28 Nov 2026",
      "• 2 × Clay Mug — ₹900",
      "Delivery: ₹50",
      "Total paid: ₹950",
      "Asha Crafts",
    ]);
    expect(invoiceText({ ...ORDER, shipping_amount: 0 }, "Asha Crafts", "hinglish", NOW)).toMatch(/Payment mil gaya[\s\S]*Delivery: Free/);
    expect(invoiceText(ORDER, "Asha Crafts", "hindi", NOW)).toMatch(/कुल भुगतान: ₹950/);
  });

  it("IN THE OWNER'S LANGUAGE — Hinglish is the default", async () => {
    language = null;
    await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(dms[0][3]).toMatch(/^Payment mil gaya/);
  });
});

describe("4. THE CARD IS CLOSED BEHIND ANOTHER DOOR", () => {
  it("WHEN ASKED: this order's pending payment card, as the user who decided", async () => {
    await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW, resolveApproval: { userId: "u1" } });
    const card = queries.find((q) => q.table === "pending_approvals")!;
    expect(card.payload).toMatchObject({ status: "approved", reviewed_by: "u1" });
    expect(card.filters).toEqual({ dealership_id: "d1", action_type: "confirm_dm_payment", status: "pending", "action_details->>order_id": ORDER.id });
  });

  it("NOT WHEN THE CARD ITSELF IS THE DOOR — decide.ts closes it", async () => {
    await confirmDmPayment(db(), "d1", ORDER.id, { now: NOW });
    expect(queries.some((q) => q.table === "pending_approvals")).toBe(false);
  });
});

describe("5. THE APPROVAL CARD — a decide.ts branch, read with comments stripped and bounded (Rule 8)", () => {
  it("APPROVAL-GATED, HIGH RISK, AND NOT A DISPATCHER — it is an edit, not an outbound send", () => {
    expect(getActionPolicy("confirm_dm_payment")).toMatchObject({ actionType: "edit", riskLevel: "high", requiresApproval: true });
    expect(dispatcherFor("confirm_dm_payment")).toBeNull();
  });

  it("APPROVED: THE CARD'S OWN ORDER IS CONFIRMED FOR THE CARD'S OWN BUSINESS, AND A MISS IS AN ERROR WITH ITS STATUS", () => {
    const src = code("src/lib/approvals/decide.ts");
    const start = src.indexOf('if (approval?.action_type === "confirm_dm_payment") {');
    const end = src.indexOf('if (approval?.action_type === "create_page_draft") {', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = src.slice(start, end);
    expect(branch).toMatch(/const done = await confirmDmPayment\(service, approval\.dealership_id, String\(\(approval\.action_details as any\)\?\.order_id \?\? ""\)\);/);
    expect(branch).toMatch(/if \(!done\.ok\) return NextResponse\.json\(\{ error: done\.error \}, \{ status: done\.status \}\);/);
    // What it did travels back to WhatsApp as produced.note.
    expect(branch).toMatch(/record\(\{ note: done\.note,/);
  });

  it("AND ONLY ON APPROVAL — the branch sits inside the approved block", () => {
    const src = code("src/lib/approvals/decide.ts");
    const branch = src.indexOf('if (approval?.action_type === "confirm_dm_payment") {');
    const approvedBlock = src.lastIndexOf('if (status === "approved") {', branch);
    expect(approvedBlock).toBeGreaterThan(-1);
    // No other block opens between the approved check and the branch.
    expect(src.slice(approvedBlock, branch)).not.toMatch(/\n  \}\n/);
  });

  it("THE CARD SAYS WHAT CANNOT BE TAKEN BACK", () => {
    expect(code("src/lib/dm/orderTurnDeps.ts")).toMatch(/Your stock is reduced and the customer is told their payment arrived — that can't be undone/);
  });
});
