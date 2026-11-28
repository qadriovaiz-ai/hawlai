// THE ORDERS TAB AND AN INSTAGRAM ORDER — Seller Mode O2 and O3, 28
// November 2026.
//
// For an Instagram order, the seller confirming the UPI payment is the
// moment stock moves (applyOrderSideEffects). PATCH /api/orders/[id] used
// to only flip a status, so O2 refused paid/confirmed outright "until O3".
// O3 is this: "Mark as paid" on an Instagram order now RUNS the seller's
// confirmation — the same function the WhatsApp button and the approval
// card run. A bare "confirmed" is still refused. Website orders keep the
// button exactly as before.

import { describe, it, expect, vi, beforeEach } from "vitest";

let channel: string | null;
let readError: any;
let updates: Record<string, any>[];
let confirms: any[];
let confirmResult: any;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        single: async () => (table === "profiles" ? { data: { dealership_id: "d1" }, error: null } : { data: { id: "o1" }, error: null }),
        maybeSingle: async () => ({ data: channel === null ? null : { channel, id: "o1", status: "confirmed" }, error: readError }),
        update: (u: Record<string, any>) => {
          updates.push(u);
          return api;
        },
      };
      return api;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ service: true }) }));
vi.mock("@/lib/orders/confirmDmPayment", () => ({
  confirmDmPayment: async (...a: any[]) => (confirms.push(a), confirmResult),
}));

import { PATCH } from "@/app/api/orders/[id]/route";

const patch = async (body: any) => {
  const res = await PATCH(new Request("https://hawlai.online/api/orders/o1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "o1" }),
  });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  channel = "instagram";
  readError = null;
  updates = [];
  confirms = [];
  confirmResult = { ok: true, note: "Order #ABC confirmed as paid (₹950). Stock updated.", reference: "#ABC", invoice: "sent" };
});

describe("an Instagram order is confirmed by confirming its payment", () => {
  it("MARK AS PAID RUNS THE SELLER'S CONFIRMATION — for THIS business, closing its card as THIS user", async () => {
    const r = await patch({ paymentStatus: "paid" });
    expect(r.status).toBe(200);
    expect(confirms).toEqual([[{ service: true }, "d1", "o1", { resolveApproval: { userId: "u1" } }]]);
    expect(r.body.note).toMatch(/confirmed as paid/);
    // NOT a bare status flip: the route itself writes nothing.
    expect(updates).toEqual([]);
  });

  it("A CONFIRMATION THAT FAILS IS SAID, with its own status", async () => {
    confirmResult = { ok: false, error: "Order #ABC is already confirmed as paid, so nothing was done again.", status: 409 };
    const r = await patch({ paymentStatus: "paid" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already confirmed/);
  });

  it("'CONFIRMED' WITHOUT THE PAYMENT IS STILL REFUSED, AND CHANGES NOTHING", async () => {
    const r = await patch({ status: "confirmed" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/confirmed by confirming its payment/);
    expect(updates).toEqual([]);
    expect(confirms).toEqual([]);
  });

  it("PAID BUNDLED WITH ANOTHER CHANGE IS REFUSED — the confirmation is its own act", async () => {
    expect((await patch({ paymentStatus: "paid", notes: "x" })).status).toBe(409);
    expect(confirms).toEqual([]);
  });

  it("OTHER CHANGES STILL WORK — a note, or cancelling it", async () => {
    expect((await patch({ notes: "called her" })).status).toBe(200);
    expect((await patch({ status: "cancelled" })).status).toBe(200);
    expect(updates).toEqual([{ notes: "called her" }, { status: "cancelled" }]);
    expect(confirms).toEqual([]);
  });

  it("A WEBSITE ORDER IS MARKED PAID EXACTLY AS BEFORE", async () => {
    channel = "website";
    expect((await patch({ paymentStatus: "paid" })).status).toBe(200);
    expect((await patch({ status: "confirmed" })).status).toBe(200);
    expect(updates).toEqual([{ payment_status: "paid" }, { status: "confirmed" }]);
    expect(confirms).toEqual([]);
  });

  it("A CHANNEL THAT CAN'T BE READ IS A 500, never a guess that lets it through", async () => {
    readError = { message: "boom" };
    expect((await patch({ paymentStatus: "paid" })).status).toBe(500);
    expect(updates).toEqual([]);
    expect(confirms).toEqual([]);
  });
});
