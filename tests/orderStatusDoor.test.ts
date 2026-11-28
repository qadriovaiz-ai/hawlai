// THE ORDERS TAB CANNOT MARK AN INSTAGRAM ORDER PAID — Seller Mode O2, 28
// November 2026.
//
// For an Instagram order, the seller confirming the UPI payment is the
// moment stock moves (applyOrderSideEffects). PATCH /api/orders/[id] only
// flips a status, so letting it mark one paid or confirmed would record a
// paid order whose stock never left the shelf. Website orders keep the
// button exactly as before.

import { describe, it, expect, vi, beforeEach } from "vitest";

let channel: string | null;
let readError: any;
let updates: Record<string, any>[];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        single: async () => (table === "profiles" ? { data: { dealership_id: "d1" }, error: null } : { data: { id: "o1" }, error: null }),
        maybeSingle: async () => ({ data: channel === null ? null : { channel }, error: readError }),
        update: (u: Record<string, any>) => {
          updates.push(u);
          return api;
        },
      };
      return api;
    },
  }),
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
});

describe("an Instagram order's payment is confirmed by the payment check, not this button", () => {
  it("MARK AS PAID IS REFUSED, SAYS WHY, AND CHANGES NOTHING", async () => {
    const r = await patch({ paymentStatus: "paid" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/confirmed when you confirm the payment/);
    expect(updates).toEqual([]);
  });

  it("SO IS MOVING IT TO 'confirmed'", async () => {
    expect((await patch({ status: "confirmed" })).status).toBe(409);
    expect(updates).toEqual([]);
  });

  it("OTHER CHANGES STILL WORK — a note, or cancelling it", async () => {
    expect((await patch({ notes: "called her" })).status).toBe(200);
    expect((await patch({ status: "cancelled" })).status).toBe(200);
    expect(updates).toEqual([{ notes: "called her" }, { status: "cancelled" }]);
  });

  it("A WEBSITE ORDER IS MARKED PAID EXACTLY AS BEFORE", async () => {
    channel = "website";
    expect((await patch({ paymentStatus: "paid" })).status).toBe(200);
    expect((await patch({ status: "confirmed" })).status).toBe(200);
    expect(updates).toEqual([{ payment_status: "paid" }, { status: "confirmed" }]);
  });

  it("A CHANNEL THAT CAN'T BE READ IS A 500, never a guess that lets it through", async () => {
    readError = { message: "boom" };
    expect((await patch({ paymentStatus: "paid" })).status).toBe(500);
    expect(updates).toEqual([]);
  });
});
