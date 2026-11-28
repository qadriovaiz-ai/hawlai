// TAKING AN ORDER IN AN INSTAGRAM DM — O1 of docs/PLAN-INSTAGRAM-SELLER-MODE.md
// (UPI-direct revision), 28 November 2026.
//
// The model only READS the customer's words into fields. Every message in
// the order flow is written here from the records, and only the
// customer's own "yes" to a read-back of the exact quote places an order
// and sends the UPI payment request.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";
import {
  handleOrderTurn,
  isYes,
  isNo,
  readbackText,
  readExtraction,
  EMPTY_DRAFT,
  type DraftRow,
  type Extraction,
  type OrderTurnDeps,
  type Readback,
} from "@/lib/dm/orderConversation";

const NOW = new Date("2026-11-28T12:00:00Z");
const MUG = { product_id: "p1", name: "Clay Mug", price: 450, quantity: 2 };

let row: DraftRow | null;
let saves: any[];
let extraction: Extraction | null;
let priceTotal: number;
let claimed: boolean;
let placed: any;
let calls: string[];

const extracted = (e: Partial<Extraction>): Extraction => ({ intent: "order", items: null, name: null, phone: null, address: null, ...e });

function deps(over: Partial<OrderTurnDeps> = {}): OrderTurnDeps {
  return {
    now: NOW,
    language: "english",
    catalog: [{ id: "p1", name: "Clay Mug" }, { id: "p2", name: "Tea Cup" }],
    loadDraft: async () => row,
    saveDraft: async (patch) => {
      saves.push(patch);
    },
    claimReadback: async () => {
      calls.push("claim");
      return claimed;
    },
    extract: async () => {
      calls.push("extract");
      return extraction;
    },
    price: async (lines) => {
      calls.push("price");
      const items = lines.map((l) => ({ product_id: l.productId, name: l.productId === "p1" ? "Clay Mug" : "Tea Cup", price: 450, quantity: l.quantity }));
      const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
      return { ok: true, resolvedItems: items, productMap: new Map(), subtotal, discountAmount: 0, appliedDiscountId: null, shippingAmount: priceTotal - subtotal, total: priceTotal } as any;
    },
    placeOrder: async (rb) => {
      calls.push(`place:${rb.total}`);
      return placed;
    },
    paymentRequest: (o) => ({ text: `PAY ${o.reference} ₹${o.total}`, qrUrl: `https://x/qr/${o.orderId}` }),
    notifySeller: async (o) => {
      calls.push(`notify:${o.orderId}:${o.customerName}`);
    },
    ...over,
  };
}

const READBACK: Readback = {
  lines: [{ productId: "p1", quantity: 2 }],
  items: [MUG],
  subtotal: 900,
  shippingAmount: 50,
  total: 950,
  name: "Asha",
  phone: "9800000001",
  address: "12 Lake Road, Pune 411001",
};

const openRow = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: "r1",
  draft: { items: [{ product: "Clay Mug", quantity: 2 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune 411001" },
  readback: null,
  readback_sent_at: null,
  status: "open",
  updated_at: new Date(NOW.getTime() - 60_000).toISOString(),
  ...over,
});
const awaitingYes = () => openRow({ readback: READBACK, readback_sent_at: new Date(NOW.getTime() - 30_000).toISOString() });

beforeEach(() => {
  row = null;
  saves = [];
  extraction = null;
  priceTotal = 950;
  claimed = true;
  placed = { ok: true, orderId: "o1", reference: "#ABC123", items: [MUG], subtotal: 900, discountAmount: 0, shippingAmount: 50, total: 950 };
  calls = [];
});

describe("1. WHAT COUNTS AS YES AND NO", () => {
  it("THE WHOLE MESSAGE, IN THE WAYS CUSTOMERS SAY IT", () => {
    for (const y of ["yes", "YES", "Yes!", "haan", "haa", "ha", "ji", "ok", "okay", "confirm", "1", "👍", "हाँ", " yes. "]) expect(isYes(y), y).toBe(true);
    for (const n of ["no", "nahi", "Nahin", "2", "not yet", "नहीं"]) expect(isNo(n), n).toBe(true);
  });

  it("'yes but…' IS NOT A YES — it is a change, and goes to the reader", () => {
    for (const s of ["yes but in blue", "yes 3 please", "ok what about delivery", "haan lekin kal"]) expect(isYes(s), s).toBe(false);
  });
});

describe("2. GATHERING THE ORDER — every question written here, not by the model", () => {
  it("NOT ABOUT AN ORDER: handed to the ordinary reply", async () => {
    extraction = extracted({ intent: "other" });
    expect(await handleOrderTurn("is it microwave safe?", deps())).toEqual({ handled: false });
    expect(saves).toEqual([]);
  });

  it("THE AI CAN'T BE READ: handed to the ordinary reply, never guessed", async () => {
    extraction = null;
    expect(await handleOrderTurn("2 mugs please", deps())).toEqual({ handled: false });
  });

  it("ASKS FOR WHAT IS MISSING, IN ORDER: product, name, phone, address", async () => {
    extraction = extracted({});
    expect((await handleOrderTurn("I want to order", deps())) as any).toMatchObject({ messages: [{ text: expect.stringMatching(/What would you like to order/) }] });
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 2 }] });
    expect((await handleOrderTurn("2 clay mugs", deps())) as any).toMatchObject({ messages: [{ text: expect.stringMatching(/What name/) }] });
    row = openRow({ draft: { ...EMPTY_DRAFT, items: [{ product: "Clay Mug", quantity: 2 }], name: "Asha" } });
    extraction = extracted({});
    expect((await handleOrderTurn("Asha", deps())) as any).toMatchObject({ messages: [{ text: expect.stringMatching(/phone number/) }] });
    row = openRow({ draft: { ...EMPTY_DRAFT, items: [{ product: "Clay Mug", quantity: 2 }], name: "Asha", phone: "9800000001" } });
    expect((await handleOrderTurn("9800000001", deps())) as any).toMatchObject({ messages: [{ text: expect.stringMatching(/delivery address/) }] });
  });

  it("A PRODUCT NOT IN THE CATALOG IS ASKED ABOUT — never matched to the nearest", async () => {
    extraction = extracted({ items: [{ product: "Clay Mugs XL", quantity: 1 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune" });
    const t: any = await handleOrderTurn("clay mugs xl", deps());
    expect(t.messages[0].text).toMatch(/couldn't find "Clay Mugs XL"/);
    expect(calls).not.toContain("price");
    expect(saves.at(-1).readback).toBeNull();
  });

  it("TWO PRODUCTS WITH THE SAME NAME ARE ASKED ABOUT — never the first one picked", async () => {
    // Added after mutation M4 survived (28 Nov 2026): "exactly one match"
    // and "the first match" passed the same tests until two products
    // shared a name.
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 1 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune" });
    const t: any = await handleOrderTurn("…", deps({ catalog: [{ id: "p1", name: "Clay Mug" }, { id: "p9", name: "clay mug" }] }));
    expect(t.messages[0].text).toMatch(/more than one "Clay Mug"/);
    expect(t.note).toMatch(/more than one product is named "Clay Mug"/);
    expect(calls).not.toContain("price");
  });

  it("A PRODUCT MATCHES ITS CATALOG NAME WHATEVER THE CASE", async () => {
    extraction = extracted({ items: [{ product: "clay mug", quantity: 2 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune" });
    const t: any = await handleOrderTurn("…", deps());
    expect(t.messages[0].text).toMatch(/Please check your order/);
  });

  it("A SHORT PHONE NUMBER IS ASKED FOR AGAIN, and not kept", async () => {
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 1 }], name: "Asha", phone: "98000" });
    const t: any = await handleOrderTurn("98000", deps());
    expect(t.messages[0].text).toMatch(/too short/);
    expect(saves.at(-1).draft.phone).toBeNull();
  });

  it("A CONVERSATION QUIET FOR A DAY STARTS OVER — but the name, phone and address are kept to read back", async () => {
    row = openRow({ updated_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString(), readback: READBACK, readback_sent_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString() });
    extraction = extracted({});
    const t: any = await handleOrderTurn("yes", deps());
    // An old read-back is NOT answered by today's "yes".
    expect(calls).not.toContain("claim");
    expect(t.messages[0].text).toMatch(/What would you like to order/);
    expect(saves.at(-1).draft).toMatchObject({ items: [], name: "Asha", phone: "9800000001" });
  });
});

describe("3. THE READ-BACK — every number from the records", () => {
  it("COMPLETE DETAILS ARE PRICED AND READ BACK, AND THE QUOTE IS STORED AS SHOWN", async () => {
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 2 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune 411001" });
    const t: any = await handleOrderTurn("…", deps());
    expect(t.messages[0].text).toBe(readbackText(READBACK, "english"));
    expect(saves.at(-1).readback).toEqual(READBACK);
    expect(saves.at(-1).readback_sent_at).toBe(NOW.toISOString());
  });

  it("THE WORDS: items with line totals, delivery, total, the details, and how to say yes", () => {
    const t = readbackText(READBACK, "english");
    expect(t).toContain("• 2 × Clay Mug — ₹900");
    expect(t).toContain("Delivery: ₹50");
    expect(t).toContain("Total: ₹950");
    expect(t).toContain("Address: 12 Lake Road, Pune 411001");
    expect(t).toMatch(/Reply YES/);
    expect(readbackText({ ...READBACK, shippingAmount: 0, total: 900 }, "english")).toContain("Delivery: Free");
    expect(readbackText(READBACK, "hinglish")).toMatch(/YES likhiye/);
    expect(readbackText(READBACK, "hindi")).toMatch(/कुल: ₹950/);
  });

  it("A PRICING REFUSAL (STOCK) IS SAID, AND NOTHING IS READ BACK", async () => {
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 9 }], name: "Asha", phone: "9800000001", address: "12 Lake Road, Pune" });
    const t: any = await handleOrderTurn("9 mugs", deps({ price: async () => ({ ok: false, status: 400, error: 'Only 5 of "Clay Mug" left in stock' }) }));
    expect(t.messages[0].text).toBe('Only 5 of "Clay Mug" left in stock');
    expect(saves.at(-1).readback).toBeNull();
  });
});

describe("4. THE YES — exactly what was shown, once", () => {
  it("PLACES THE ORDER AT THE READ-BACK'S TOTAL, SENDS THE PAYMENT REQUEST AND THE QR, AND TELLS THE SELLER", async () => {
    row = awaitingYes();
    const t: any = await handleOrderTurn("yes", deps());
    expect(calls).toEqual(["claim", "price", "place:950", "notify:o1:Asha"]);
    expect(t).toEqual({ handled: true, orderId: "o1", messages: [{ text: "PAY #ABC123 ₹950" }, { imageUrl: "https://x/qr/o1" }] });
    expect(saves.at(-1)).toMatchObject({ status: "ordered", order_id: "o1", readback: null });
  });

  it("THE MODEL IS NOT ASKED ABOUT A YES — the customer's own word is the approval", async () => {
    row = awaitingYes();
    await handleOrderTurn("haan", deps());
    expect(calls).not.toContain("extract");
  });

  it("THE SAME YES DELIVERED TWICE PLACES NOTHING THE SECOND TIME", async () => {
    row = awaitingYes();
    claimed = false;
    const t: any = await handleOrderTurn("yes", deps());
    expect(t).toMatchObject({ handled: true, messages: [] });
    expect(calls).toEqual(["claim"]);
  });

  it("THE PRICE MOVED SINCE THE READ-BACK: NOTHING PLACED, THE NEW QUOTE IS SHOWN", async () => {
    row = awaitingYes();
    priceTotal = 1000;
    const t: any = await handleOrderTurn("yes", deps());
    expect(calls.some((c) => c.startsWith("place"))).toBe(false);
    expect(t.messages[0].text).toMatch(/price changed/);
    expect(t.messages[0].text).toMatch(/Total: ₹1,000/);
    expect(saves.at(-1).readback.total).toBe(1000);
  });

  it("AN ORDER THAT CAN'T BE PLACED IS SAID HONESTLY — no payment request, no seller notice", async () => {
    row = awaitingYes();
    placed = { ok: false, error: "Seller Mode is off" };
    const t: any = await handleOrderTurn("yes", deps());
    expect(t.messages).toEqual([{ text: expect.stringMatching(/couldn't place this order/) }]);
    expect(calls.some((c) => c.startsWith("notify"))).toBe(false);
    expect(t.note).toMatch(/Seller Mode is off/);
  });

  it("A NO TO THE READ-BACK ASKS WHAT TO CHANGE, AND CLEARS IT", async () => {
    row = awaitingYes();
    const t: any = await handleOrderTurn("no", deps());
    expect(t.messages[0].text).toMatch(/what would you like to change/);
    expect(saves.at(-1)).toMatchObject({ readback: null, status: "open" });
    expect(calls).toEqual([]);
  });

  it("A CHANGE INSTEAD OF A YES IS READ, AND READ BACK AGAIN — it never places the old quote", async () => {
    row = awaitingYes();
    extraction = extracted({ items: [{ product: "Clay Mug", quantity: 3 }] });
    priceTotal = 1400;
    const t: any = await handleOrderTurn("make it 3", deps());
    expect(calls.some((c) => c.startsWith("place"))).toBe(false);
    expect(t.messages[0].text).toMatch(/3 × Clay Mug/);
  });

  it("CANCEL ENDS IT", async () => {
    row = openRow();
    extraction = extracted({ intent: "cancel" });
    const t: any = await handleOrderTurn("cancel it", deps());
    expect(t.messages[0].text).toMatch(/cancelled/);
    expect(saves.at(-1)).toMatchObject({ status: "cancelled", readback: null });
  });
});

describe("5. THE MODEL'S ANSWER IS ACCEPTED ONLY IN ITS EXACT SHAPE", () => {
  it("A WELL-FORMED ANSWER", () => {
    expect(readExtraction({ intent: "order", items: [{ product: "Clay Mug", quantity: 2 }], name: " Asha ", phone: null, address: "" })).toEqual({
      intent: "order",
      items: [{ product: "Clay Mug", quantity: 2 }],
      name: "Asha",
      phone: null,
      address: null,
    });
    expect(readExtraction({ intent: "order", items: [{ product: "Clay Mug" }] })?.items).toEqual([{ product: "Clay Mug", quantity: 1 }]);
  });

  it("ANYTHING ELSE IS NULL — a bad intent, a fractional or huge quantity, a nameless item", () => {
    for (const bad of [null, "yes", { intent: "buy" }, { intent: "order", items: [{ product: "Mug", quantity: 1.5 }] }, { intent: "order", items: [{ product: "Mug", quantity: 500 }] }, { intent: "order", items: [{ quantity: 1 }] }]) {
      expect(readExtraction(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("6. THE WEBHOOK RUNS IT ONLY WHEN ORDER-TAKING IS LIVE — read with comments stripped", () => {
  it("THE GATE: Instagram, the global switch, this business's Seller Mode, and a UPI ID — all four", () => {
    const src = code("src/lib/webhooks/autoReplyHandler.ts");
    expect(src).toMatch(
      /if \(channel === "instagram" && SELLER_MODE_TAKES_ORDERS && dealership\.instagram_selling_enabled && dealership\.seller_upi_vpa\) \{\s*let turn: OrderTurn = \{ handled: false \};\s*try \{\s*turn = await handleOrderTurn\(/
    );
  });

  it("IT COMES BEFORE THE ORDINARY REPLY, and a handled turn does not also get one", () => {
    const src = code("src/lib/webhooks/autoReplyHandler.ts");
    const gate = src.indexOf("SELLER_MODE_TAKES_ORDERS && dealership.instagram_selling_enabled");
    const reply = src.indexOf('await generateAutoReply("dm"');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(reply);
    const block = src.slice(gate, reply);
    expect(block).toMatch(/if \(turn\.handled\) \{\s*await sendOrderTurn\(supabase, \{[^}]*turn \}\);\s*handledSomething = true;\s*continue;\s*\}/);
  });

  it("ORDER-TAKING IS ON — switched on 28 Nov 2026 once the seller could confirm payments (O3/O4′)", async () => {
    // The global switch alone takes no orders: the gate above still needs
    // this business's Seller Mode, its UPI ID and Instagram.
    const { SELLER_MODE_TAKES_ORDERS } = await import("@/lib/dm/sellerMode");
    expect(SELLER_MODE_TAKES_ORDERS).toBe(true);
  });
});
