// Razorpay ORDER CREATION — audit item R2.3.
//
// razorpay.test.ts covers the other half thoroughly: thirteen tests on
// verifyRazorpaySignature, including cross-order replay and a
// timing-safe compare. It covers order creation with nothing at all.
// Its own header says so. This is the half where a customer is charged.
//
// The failure this file is mostly about is the paise conversion.
// Razorpay takes an integer number of paise, the store holds rupees as
// a float, and `Math.round(total * 100)` sits between them at
// api/public/orders/route.ts:49. IEEE-754 makes that conversion
// lossy in ways that do not look lossy: 1029.95 * 100 is
// 102994.99999999999. Truncating instead of rounding charges the
// customer a paisa less than the order says, forever, on a subset of
// totals nobody can predict by reading the code.
//
// WHAT THIS FILE DOES NOT COVER, stated plainly because R2.3 asks for
// that: it does not test resolveOrderPricing, which is what recomputes
// the total server-side so a client cannot post its own price. That
// module has no tests at all — see the note at the end of this file.

import { describe, it, expect, vi, afterEach } from "vitest";
import { createRazorpayOrder, createRazorpayRefund, isRazorpayConfigured, keyCredentials } from "@/lib/payments/razorpay";

const KEY_ID = "rzp_test_abc123";
const KEY_SECRET = "secret_xyz";

/** A Razorpay-shaped success, so the assertions are about our code, not a mock's shape. */
const orderOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "order_ABC123", amount: 102995, currency: "INR", ...over }),
  text: async () => "",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: any) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** The one call Razorpay received, parsed. */
function sentBody(spy: ReturnType<typeof vi.fn>) {
  return JSON.parse(spy.mock.calls[0][1].body);
}

describe("the request Razorpay actually receives", () => {
  it("posts to the orders endpoint with the amount, currency and receipt", async () => {
    const spy = stubFetch(orderOk());
    await createRazorpayOrder(102995, "site_myshop_1757000000000", keyCredentials(KEY_ID, KEY_SECRET));

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    expect(sentBody(spy)).toEqual({
      amount: 102995,
      currency: "INR",
      receipt: "site_myshop_1757000000000",
    });
  });

  it("authenticates with HTTP Basic built from the DEALERSHIP's own keys", async () => {
    // Per-dealership credentials, not a platform account — money
    // settles into the merchant's own bank. Sending the wrong pair
    // creates the order in the wrong Razorpay account, and the
    // signature check later would then fail against a secret that
    // never made the order.
    const spy = stubFetch(orderOk());
    await createRazorpayOrder(50000, "receipt_1", keyCredentials(KEY_ID, KEY_SECRET));

    const header = spy.mock.calls[0][1].headers.Authorization;
    expect(header.startsWith("Basic ")).toBe(true);
    expect(Buffer.from(header.slice(6), "base64").toString("utf8")).toBe(`${KEY_ID}:${KEY_SECRET}`);
  });

  it("never sends the key secret anywhere but the Authorization header", async () => {
    const spy = stubFetch(orderOk());
    await createRazorpayOrder(50000, "receipt_1", keyCredentials(KEY_ID, KEY_SECRET));
    expect(JSON.stringify(sentBody(spy))).not.toContain(KEY_SECRET);
  });

  it("returns the order Razorpay created, not the input", async () => {
    stubFetch(orderOk({ id: "order_REAL", amount: 102995 }));
    const order = await createRazorpayOrder(102995, "r", keyCredentials(KEY_ID, KEY_SECRET));
    expect(order.id).toBe("order_REAL");
    expect(order.amount).toBe(102995);
  });
});

describe("rupees → paise, the conversion that decides what is charged", () => {
  // The expression under test lives at the call site
  // (api/public/orders/route.ts:49). It is reproduced here rather than
  // imported because it is an inline expression, and a test that
  // reproduces it would go green while the route drifted — so the last
  // test in this block reads the route and asserts they still agree.
  const toPaise = (rupees: number) => Math.round(rupees * 100);

  it("converts a whole-rupee total exactly", () => {
    expect(toPaise(1000)).toBe(100000);
  });

  it.each([
    [1029.95, 102995],
    [749.95, 74995],
    [19.99, 1999],
    [0.1, 10],
    [0.29, 29],
    [8.15, 815],
  ])("converts %s rupees to %i paise despite float representation", (rupees, paise) => {
    // Every one of these has a binary representation that is not the
    // decimal it looks like. 1029.95 * 100 === 102994.99999999999, so
    // Math.trunc or a bare | 0 would charge 102994 — a paisa short,
    // silently, on a total the customer saw as ₹1,029.95.
    expect(toPaise(rupees)).toBe(paise);
  });

  it("is EXACT for every two-decimal total from ₹0.00 to ₹20,000.00", () => {
    // The real guarantee, rather than six hand-picked values that
    // could all happen to be the easy ones. Two decimals is the whole
    // reachable domain — see the invariant test below — so this is
    // the conversion's full input space at ordinary order sizes,
    // checked exhaustively.
    const mismatches: number[] = [];
    for (let paise = 0; paise <= 2_000_000; paise++) {
      if (toPaise(paise / 100) !== paise) mismatches.push(paise);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("depends on discounts being rounded to 2dp upstream, so assert that too", () => {
    // WHY THE EXHAUSTIVE TEST ABOVE IS SUFFICIENT rather than
    // optimistic. A percentage discount is the one input that could
    // introduce a third decimal, and at three decimals Math.round is
    // genuinely unreliable in both directions — 1.005*100 is
    // 100.49999999999999 (rounds DOWN to 100), while 2.675*100 is
    // exactly 267.5 (rounds UP to 268). Neither is reachable today
    // only because discounts.ts rounds the discount to 2dp first.
    //
    // That upstream rounding is load-bearing for this file's claim,
    // so it is pinned here: drop it and the exhaustive test above
    // silently stops covering the real input domain.
    const fs = require("fs") as typeof import("fs");
    const source = fs.readFileSync("src/lib/discounts.ts", "utf8");
    expect(source).toMatch(/Math\.round\(\(subtotal \* Number\(discount\.value\)\) \/ 100 \* 100\) \/ 100/);
  });

  it("always yields an integer, which is all Razorpay accepts", () => {
    for (const rupees of [1029.95, 0.1, 33.333, 12345.678]) {
      expect(Number.isInteger(toPaise(rupees))).toBe(true);
    }
  });

  it("does not silently shrink a large order", () => {
    // A ₹10,00,000 order is 10 crore paise, well inside a safe
    // integer. Worth pinning: a currency bug that only appears above
    // some threshold is the kind that reaches production.
    expect(toPaise(1_000_000)).toBe(100_000_000);
    expect(Number.isSafeInteger(toPaise(1_000_000))).toBe(true);
  });

  it("the route still uses Math.round for the conversion", async () => {
    // Guards the reproduction above. If someone rewrites the call site
    // as `total * 100` or `Math.floor(...)`, the arithmetic tests here
    // keep passing while the product starts undercharging — the exact
    // shape of a test that outlives the thing it was testing.
    const fs = await import("fs");
    const source = fs.readFileSync("src/app/api/public/orders/route.ts", "utf8");
    expect(source).toMatch(/createRazorpayOrder\(\s*Math\.round\(total \* 100\)/);
  });
});

describe("a failed order creation is never mistaken for a successful one", () => {
  it("throws, carrying Razorpay's status AND its own words", async () => {
    // The detail is the field that resolves these. A bare "order
    // creation failed" turns a five-minute fix (bad key, amount below
    // the minimum) into a guessing exercise — the lesson from the
    // Shopify OAuth rounds, applied to the payment path.
    stubFetch({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => '{"error":{"description":"Amount must be at least INR 1.00"}}',
    });

    await expect(createRazorpayOrder(50, "r", keyCredentials(KEY_ID, KEY_SECRET))).rejects.toThrow(/400/);
    await expect(createRazorpayOrder(50, "r", keyCredentials(KEY_ID, KEY_SECRET))).rejects.toThrow(/Amount must be at least/);
  });

  it("throws on a 401, rather than returning an order-shaped nothing", async () => {
    stubFetch({ ok: false, status: 401, json: async () => ({}), text: async () => "Unauthorized" });
    await expect(createRazorpayOrder(1000, "r", keyCredentials("wrong", "wrong"))).rejects.toThrow(/401/);
  });

  it("still throws when the error body cannot be read", async () => {
    // .text() rejecting must not replace an HTTP failure with a
    // different, more confusing failure.
    stubFetch({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => { throw new Error("stream already consumed"); },
    });
    await expect(createRazorpayOrder(1000, "r", keyCredentials(KEY_ID, KEY_SECRET))).rejects.toThrow(/500/);
  });

  it("lets a network error surface instead of swallowing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(createRazorpayOrder(1000, "r", keyCredentials(KEY_ID, KEY_SECRET))).rejects.toThrow(/ECONNRESET/);
  });
});

describe("an unconnected merchant cannot reach Razorpay at all", () => {
  it.each([
    ["", KEY_SECRET],
    [KEY_ID, ""],
    ["", ""],
  ])("refuses before any network call when keys are (%s, %s)", async (id, secret) => {
    // Refusing BEFORE the fetch matters: with an empty pair the Basic
    // header is `Basic Og==` (":"), a well-formed credential for
    // nobody, and Razorpay answers 401. Failing early gives the
    // merchant "not connected yet" instead of "unauthorized".
    const spy = stubFetch(orderOk());
    await expect(createRazorpayOrder(1000, "r", keyCredentials(id, secret))).rejects.toThrow(/not connected/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it("isRazorpayConfigured agrees with what createRazorpayOrder enforces", () => {
    // Two places encode "is this merchant connected". If they
    // disagree, the UI offers online payment and the order then throws.
    expect(isRazorpayConfigured(KEY_ID, KEY_SECRET)).toBe(true);
    expect(isRazorpayConfigured("", KEY_SECRET)).toBe(false);
    expect(isRazorpayConfigured(KEY_ID, "")).toBe(false);
    expect(isRazorpayConfigured(null, undefined)).toBe(false);
  });
});

// Refunds move real money OUT and had no coverage either. Same module,
// same shape, and the one function in it with no human step between a
// bug and a customer's bank account.
describe("refunds", () => {
  const refundOk = {
    ok: true,
    status: 200,
    json: async () => ({ id: "rfnd_1", payment_id: "pay_1", amount: 50000, status: "processed" }),
    text: async () => "",
  };

  it("refunds the named payment, in paise", async () => {
    const spy = stubFetch(refundOk);
    await createRazorpayRefund("pay_XYZ", 50000, keyCredentials(KEY_ID, KEY_SECRET));

    expect(spy.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_XYZ/refund");
    expect(sentBody(spy)).toEqual({ amount: 50000 });
  });

  it("throws on a declined refund rather than reporting it processed", async () => {
    // A refund that silently "succeeds" leaves a customer told they
    // were refunded and a merchant who never sent the money.
    stubFetch({ ok: false, status: 400, json: async () => ({}), text: async () => "The payment has been fully refunded already" });
    await expect(createRazorpayRefund("pay_1", 50000, keyCredentials(KEY_ID, KEY_SECRET))).rejects.toThrow(/fully refunded already/);
  });

  it("refuses without credentials, before any network call", async () => {
    const spy = stubFetch(refundOk);
    await expect(createRazorpayRefund("pay_1", 50000, keyCredentials("", ""))).rejects.toThrow(/not connected/i);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// NOT COVERED HERE, and worth naming rather than leaving implied:
//
// resolveOrderPricing (src/lib/orderPricing.ts) has NO tests. It is
// the module that recomputes subtotal, discount, shipping and total
// from the live products table so a client cannot post its own price,
// and both Razorpay steps depend on it agreeing with itself across the
// initiate and verify calls. That is a larger gap than order creation
// was, and it is not in R2.3's list.
// ---------------------------------------------------------------
