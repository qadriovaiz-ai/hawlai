// ASKING A CUSTOMER TO PAY THE SELLER BY UPI — the UPI piece of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md (UPI-direct revision), 28 November
// 2026.
//
// Hawlai never holds money: the payee is the seller's own saved UPI ID.
// The DM carries three ways to pay so one always works — the UPI ID as
// text, a upi://pay link, and a QR image served by a public API route.
//
// UNVERIFIED LIVE: whether Instagram makes a upi:// link tappable in a
// DM, and how UPI apps read this exact link, are not tested against a
// real phone yet. What IS pinned here is the link's shape, the words,
// and every refusal the QR route makes.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- the QR route's database -------------------------------------------
let orderRow: Record<string, any> | null;
let orderError: any;
let businessRow: Record<string, any> | null;
let businessError: any;
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () =>
          table === "orders" ? { data: orderRow, error: orderError } : { data: businessRow, error: businessError },
      };
      return api;
    },
  }),
}));

// The real encoder, with the text it was asked to encode recorded — so
// the test knows WHAT the QR says, not only that a PNG came back.
const encoded: string[] = [];
vi.mock("qrcode", async (importOriginal) => {
  const real: any = await importOriginal();
  const lib = real.default ?? real;
  return {
    default: {
      toBuffer: async (text: string, opts: any) => {
        encoded.push(text);
        return lib.toBuffer(text, opts);
      },
    },
  };
});

import { orderReference, upiAmount, upiPayLink, upiQrPath, upiRequestText, formatRupees } from "@/lib/payments/upiRequest";
import { GET } from "@/app/api/public/pay/upi-qr/[orderId]/route";

const ORDER_ID = "6b1f0c2e-0000-4000-8000-000000000042";
const PAY = { vpa: "shop.name@okhdfcbank", payeeName: "Asha Crafts", amount: 1299, orderId: ORDER_ID };

beforeEach(() => {
  encoded.length = 0;
  orderRow = { id: ORDER_ID, dealership_id: "d1", total: 1299, channel: "instagram", payment_status: "pending", status: "new" };
  orderError = null;
  businessRow = { dealership_name: "asha_crafts", seller_upi_vpa: "shop.name@okhdfcbank", instagram_selling_enabled: true };
  businessError = null;
});

describe("1. THE ORDER'S NAME AND THE AMOUNT", () => {
  it("THE REFERENCE IS '#' AND THE ID'S FIRST SIX, UPPER-CASED — derived, so no migration", () => {
    expect(orderReference(ORDER_ID)).toBe("#6B1F0C");
    expect(() => orderReference("")).toThrow();
  });

  it("THE AMOUNT HAS TWO DECIMALS, as UPI expects", () => {
    expect(upiAmount(1299)).toBe("1299.00");
    expect(upiAmount(499.5)).toBe("499.50");
  });

  it("ZERO, NEGATIVE OR NOT-A-NUMBER IS REFUSED, never rounded into a request", () => {
    for (const bad of [0, -1, NaN, Infinity, "1299" as any]) {
      expect(() => upiAmount(bad), String(bad)).toThrow(/above zero/);
    }
  });

  it("RUPEES READ THE INDIAN WAY", () => {
    expect(formatRupees(125000)).toBe("1,25,000");
  });
});

describe("2. THE upi://pay LINK", () => {
  it("THE SHAPE NPCI DOCUMENTS: pa, pn, am, cu=INR, tn — and no tr", () => {
    expect(upiPayLink(PAY)).toBe(
      "upi://pay?pa=shop.name@okhdfcbank&pn=Asha%20Crafts&am=1299.00&cu=INR&tn=Order%20%236B1F0C"
    );
  });

  it("THE UPI ID IS NOT PERCENT-ENCODED — some apps fail to read %40 back as @", () => {
    expect(upiPayLink(PAY)).toContain("pa=shop.name@okhdfcbank&");
    expect(upiPayLink(PAY)).not.toContain("%40");
  });

  it("SPACES ARE %20, NEVER '+', which some apps show literally", () => {
    expect(upiPayLink(PAY)).not.toContain("+");
  });

  it("THE '#' IN THE NOTE IS ENCODED — unencoded, everything after it is a fragment and the note is lost", () => {
    const parsed = new URL(upiPayLink(PAY));
    expect(parsed.hash).toBe("");
    expect(parsed.searchParams.get("tn")).toBe("Order #6B1F0C");
    expect(parsed.searchParams.get("pn")).toBe("Asha Crafts");
    expect(parsed.searchParams.get("am")).toBe("1299.00");
    expect(parsed.searchParams.has("tr")).toBe(false);
  });

  it("THE UPI ID IS CHECKED AGAIN, AND NORMALISED — a bad one throws rather than sending money somewhere", () => {
    expect(upiPayLink({ ...PAY, vpa: " Shop.Name@OKHDFCBANK " })).toContain("pa=shop.name@okhdfcbank&");
    expect(() => upiPayLink({ ...PAY, vpa: "shop name@ybl" })).toThrow(/UPI ID can't be used/);
    expect(() => upiPayLink({ ...PAY, vpa: "" })).toThrow(/UPI ID can't be used/);
  });

  it("NO PAYEE NAME, NO LINK", () => {
    expect(() => upiPayLink({ ...PAY, payeeName: "  " })).toThrow(/payee's name/);
  });

  it("THE QR IS AN API ROUTE, NOT A PAGE (Rule 5)", () => {
    expect(upiQrPath(ORDER_ID)).toBe(`/api/public/pay/upi-qr/${ORDER_ID}`);
  });
});

describe("3. WHAT THE CUSTOMER READS", () => {
  it("THREE WAYS TO PAY, THE AMOUNT AND THE ORDER", () => {
    const t = upiRequestText({ ...PAY, language: "english", withQr: true });
    expect(t).toContain("#6B1F0C");
    expect(t).toContain("₹1,299");
    expect(t).toContain("UPI ID: shop.name@okhdfcbank (Asha Crafts)");
    expect(t).toContain(upiPayLink(PAY));
    expect(t).toMatch(/QR code/);
  });

  it("NO QR LINE WHEN NO QR IS COMING", () => {
    expect(upiRequestText({ ...PAY, language: "english", withQr: false })).not.toMatch(/QR/);
    expect(upiRequestText({ ...PAY, language: "hinglish", withQr: false })).not.toMatch(/QR/);
    expect(upiRequestText({ ...PAY, language: "hindi", withQr: false })).not.toMatch(/QR/);
  });

  it("IT NEVER SAYS THE PAYMENT ARRIVED — only the seller can, and the seller confirms", () => {
    const t = upiRequestText({ ...PAY, language: "english" });
    expect(t).toMatch(/Asha Crafts will check the payment and confirm your order/);
    expect(t).not.toMatch(/received|payment (?:is )?confirmed|successful/i);
  });

  it("IN THE OWNER'S LANGUAGE — and the payment details are identical in each", () => {
    const hinglish = upiRequestText({ ...PAY, language: "hinglish" });
    const hindi = upiRequestText({ ...PAY, language: "hindi" });
    expect(hinglish).toMatch(/pay karein/);
    expect(hindi).toMatch(/भुगतान/);
    for (const t of [hinglish, hindi]) {
      expect(t).toContain("shop.name@okhdfcbank");
      expect(t).toContain("₹1,299");
      expect(t).toContain(upiPayLink(PAY));
    }
    expect(upiRequestText({ ...PAY, language: "english" })).toMatch(/^To pay for order/);
    // Unset or unknown is HINGLISH — the product's default (brand_profiles),
    // the same one the DM holding line uses.
    expect(upiRequestText({ ...PAY, language: "klingon" })).toMatch(/pay karein/);
    expect(upiRequestText(PAY)).toMatch(/pay karein/);
  });
});

describe("4. THE QR ROUTE", () => {
  const get = (id = ORDER_ID) => GET(new Request(`https://hawlai.online/api/public/pay/upi-qr/${id}`), { params: Promise.resolve({ orderId: id }) });

  it("AN UNPAID DM ORDER GETS A PNG OF EXACTLY THE LINK THE DM CARRIES, NOT CACHED", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    // The business name as a person reads it, not the signup handle.
    expect(encoded).toEqual([upiPayLink({ ...PAY, payeeName: "Asha Crafts" })]);
  });

  const refusals: [string, () => void][] = [
    ["an order that does not exist", () => (orderRow = null)],
    ["a website order — it pays at checkout", () => (orderRow!.channel = "website")],
    ["an order already paid — no second way to pay", () => (orderRow!.payment_status = "paid")],
    ["a cancelled order", () => (orderRow!.status = "cancelled")],
    ["a business that switched Seller Mode off", () => (businessRow!.instagram_selling_enabled = false)],
    ["a business that cleared its UPI ID", () => (businessRow!.seller_upi_vpa = null)],
    ["a total of zero", () => (orderRow!.total = 0)],
  ];
  for (const [what, arrange] of refusals) {
    it(`404, THE SAME ANSWER, FOR ${what.toUpperCase()}`, async () => {
      arrange();
      const res = await get();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
      expect(encoded).toEqual([]);
    });
  }

  it("AN ID THAT IS NOT A UUID NEVER REACHES THE DATABASE", async () => {
    orderRow = null;
    const res = await get("../../etc");
    expect(res.status).toBe(404);
  });

  it("A FAILED READ IS A 500, never 'no such order'", async () => {
    orderError = { message: "boom" };
    expect((await get()).status).toBe(500);
    orderError = null;
    businessError = { message: "boom" };
    expect((await get()).status).toBe(500);
    expect(encoded).toEqual([]);
  });
});
