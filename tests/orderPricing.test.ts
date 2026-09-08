// resolveOrderPricing — the server-side recomputation of what a
// customer is charged.
//
// THE BIGGEST UNCOVERED MONEY PATH, found while writing the Razorpay
// order-creation tests. Order creation at least had the signature half
// covered; this module had nothing, and it is the one that decides the
// amount that reaches Razorpay in the first place.
//
// Its whole reason for existing is that the CLIENT CANNOT BE TRUSTED.
// The browser posts a cart, and this recomputes every rupee of it from
// the live products and discount_codes tables — price, quantity bounds,
// inventory, discount, shipping. Both Razorpay steps call it (initiate
// and verify), so it must also agree with itself across two separate
// requests, or a customer pays one amount and is recorded as owing
// another.
//
// The tests are grouped by what an attacker or a bug would try:
// send your own price, send a quantity that isn't a quantity, buy
// something that isn't yours, buy stock that doesn't exist, stack a
// discount past zero.

import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveOrderPricing } from "@/lib/orderPricing";

// Lets ONE test force a discount larger than the subtotal. Everything
// else runs the real validator — see the floor test for why this is
// needed rather than optional.
const forcedDiscount: { value: any } = { value: null };
vi.mock("@/lib/discounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/discounts")>();
  return {
    ...actual,
    validateDiscountCode: async (...args: any[]) =>
      forcedDiscount.value ?? (actual.validateDiscountCode as any)(...args),
  };
});

afterEach(() => {
  forcedDiscount.value = null;
});

const DEALERSHIP = "d-1";

const website = (over: Record<string, unknown> = {}) => ({
  id: "w-1",
  slug: "myshop",
  dealership_id: DEALERSHIP,
  published: true,
  shipping_mode: "free",
  shipping_rate: 0,
  shipping_free_threshold: null,
  ...over,
});

const product = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  dealership_id: DEALERSHIP,
  name: "Blue Kurta",
  price: 1000,
  is_active: true,
  inventory_count: null,
  ...over,
});

/**
 * Fake Supabase for the three tables this module reads.
 *
 * Honours .eq() and .in() rather than returning a fixed row: the
 * cross-tenant guard IS an .eq("dealership_id"), so a double that
 * ignores filters cannot test the property that matters most here.
 */
function fakeDb(opts: {
  websites?: any[];
  products?: any[];
  discounts?: any[];
  productsError?: boolean;
}) {
  const tables: Record<string, any[]> = {
    websites: opts.websites ?? [website()],
    products: opts.products ?? [product()],
    discount_codes: opts.discounts ?? [],
  };

  return {
    from(table: string) {
      const eqs: [string, any][] = [];
      let inFilter: [string, any[]] | null = null;

      const rows = () =>
        (tables[table] ?? []).filter(
          (r) => eqs.every(([c, v]) => r[c] === v) && (!inFilter || inFilter[1].includes(r[inFilter[0]]))
        );

      const result = () =>
        table === "products" && opts.productsError
          ? { data: null, error: { message: "connection lost" } }
          : { data: rows(), error: null };

      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => { eqs.push([c, v]); return api; },
        in: (c: string, v: any[]) => { inFilter = [c, v]; return api; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: any) => resolve(result()),
      };
      return api;
    },
  };
}

const cart = (over: Record<string, unknown> = {}) => [{ productId: "p-1", quantity: 2, ...over }];

/** Narrows to the success shape so tests read as assertions, not type gymnastics. */
async function priced(db: any, items: any[] = cart(), code?: string | null) {
  const r = await resolveOrderPricing(db, "myshop", items, code);
  if (!r.ok) throw new Error(`expected pricing to succeed, got ${r.status}: ${r.error}`);
  return r;
}

describe("the client's numbers are never the ones charged", () => {
  it("IGNORES a price sent by the browser and uses the stored price", async () => {
    // THE LOAD-BEARING ONE. Everything else in this module is a
    // refinement of this single property: a cart is a list of ids and
    // quantities, and every rupee is looked up server-side.
    const db = fakeDb({ products: [product({ price: 1000 })] });
    const r = await priced(db, [{ productId: "p-1", quantity: 2, price: 1, name: "Free Kurta" }]);

    expect(r.subtotal).toBe(2000);
    expect(r.total).toBe(2000);
    expect(r.resolvedItems[0].price).toBe(1000);
  });

  it("ignores a name sent by the browser and uses the stored name", async () => {
    // The name is what appears on the order record the merchant ships
    // against. Taking it from the client lets the record disagree with
    // what was actually bought.
    const db = fakeDb({ products: [product({ name: "Blue Kurta" })] });
    const r = await priced(db, [{ productId: "p-1", quantity: 1, name: "Something Else" }]);
    expect(r.resolvedItems[0].name).toBe("Blue Kurta");
  });

  it("is deterministic — the same cart prices identically twice", async () => {
    // Razorpay's initiate and verify steps call this in two separate
    // requests. Any drift between them means the customer is charged
    // one amount and recorded as owing another.
    const db = fakeDb({
      products: [product({ price: 749.95 })],
      websites: [website({ shipping_mode: "flat", shipping_rate: 49 })],
    });
    const a = await priced(db, cart({ quantity: 3 }));
    const b = await priced(db, cart({ quantity: 3 }));
    expect(a.total).toBe(b.total);
    expect(a.total).toBe(749.95 * 3 + 49);
  });
});

describe("quantity is bounded before it reaches arithmetic", () => {
  it.each([
    [0, 1],
    [-5, 1],
    [1000, 99],
    ["3", 3],
    [null, 1],
    [undefined, 1],
    ["abc", 1],
    [NaN, 1],
  ])("clamps a quantity of %s to %i", async (input, expected) => {
    const db = fakeDb({ products: [product({ price: 100 })] });
    const r = await priced(db, [{ productId: "p-1", quantity: input }]);
    expect(r.resolvedItems[0].quantity).toBe(expected);
    expect(r.subtotal).toBe(100 * (expected as number));
  });

  it("DOCUMENTS a gap: a fractional quantity passes through unrounded", async () => {
    // NOT an assertion that this is correct — it is what the code does
    // today, recorded so the behaviour is visible rather than
    // discovered later on an order.
    //
    // Math.max(1, Math.min(99, 2.5)) is 2.5, so a cart posting
    // quantity 2.5 prices 2.5 units. It cannot exceed the 1..99 bounds
    // and cannot make an order cheaper per unit, so it is not a
    // pricing exploit — but "2.5 kurtas" is not a thing a merchant can
    // ship, and nothing downstream rounds it.
    const db = fakeDb({ products: [product({ price: 100 })] });
    const r = await priced(db, [{ productId: "p-1", quantity: 2.5 }]);
    expect(r.resolvedItems[0].quantity).toBe(2.5);
    expect(r.subtotal).toBe(250);
  });
});

describe("you can only buy this store's live, in-stock products", () => {
  it("refuses a REAL product id that belongs to another dealership", async () => {
    // THE CROSS-TENANT GUARD. The products query is scoped by
    // dealership_id, so another business's product is not in the map —
    // and the cart is refused rather than priced from a row this store
    // does not own.
    //
    // The id requested here EXISTS and is active and in stock; the only
    // thing wrong with it is its owner. An earlier version of this test
    // asked for "p-999", an id present in no tenant at all — so it
    // proved that unknown ids are refused and said nothing about
    // ownership. Deleting the .eq("dealership_id") left it green.
    const db = fakeDb({
      products: [
        product({ id: "p-mine" }),
        product({ id: "p-theirs", dealership_id: "OTHER-BUSINESS", price: 5 }),
      ],
    });
    const r = await resolveOrderPricing(db, "myshop", [{ productId: "p-theirs", quantity: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(400);
    expect(r.ok === false && r.error).toMatch(/no longer available/i);
  });

  it("still prices this store's own product when another tenant's sits beside it", async () => {
    // The other half of the guard: scoping must not be so blunt that
    // it refuses legitimate carts.
    const db = fakeDb({
      products: [
        product({ id: "p-mine", price: 1000 }),
        product({ id: "p-theirs", dealership_id: "OTHER-BUSINESS", price: 5 }),
      ],
    });
    const r = await priced(db, [{ productId: "p-mine", quantity: 1 }]);
    expect(r.total).toBe(1000);
  });

  it("refuses an inactive product", async () => {
    const db = fakeDb({ products: [product({ is_active: false })] });
    const r = await resolveOrderPricing(db, "myshop", cart());
    expect(r.ok === false && r.error).toMatch(/no longer available/i);
  });

  it("refuses when stock is short, and says how many are left", async () => {
    const db = fakeDb({ products: [product({ inventory_count: 1 })] });
    const r = await resolveOrderPricing(db, "myshop", cart({ quantity: 2 }));
    expect(r.ok === false && r.error).toMatch(/Only 1 of "Blue Kurta" left/);
  });

  it("allows exactly the remaining stock", async () => {
    const db = fakeDb({ products: [product({ inventory_count: 2 })] });
    const r = await priced(db, cart({ quantity: 2 }));
    expect(r.subtotal).toBe(2000);
  });

  it("treats a null inventory_count as unlimited, not as zero", async () => {
    // Null means "not tracked". Reading it as 0 would refuse every
    // order on every product the merchant never set stock for.
    const db = fakeDb({ products: [product({ inventory_count: null })] });
    const r = await priced(db, cart({ quantity: 99 }));
    expect(r.resolvedItems[0].quantity).toBe(99);
  });

  it("refuses a cart mixing one valid and one invalid product", async () => {
    // The whole cart fails. Silently dropping the bad line would
    // charge for a subset of what the customer thinks they ordered.
    const db = fakeDb({ products: [product({ id: "p-1" })] });
    const r = await resolveOrderPricing(db, "myshop", [
      { productId: "p-1", quantity: 1 },
      { productId: "p-gone", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("discounts cannot push an order below zero", () => {
  const discount = (over: Record<string, unknown> = {}) => ({
    id: "disc-1",
    dealership_id: DEALERSHIP,
    code: "SAVE10",
    is_active: true,
    discount_type: "percent",
    value: 10,
    expires_at: null,
    max_uses: null,
    used_count: 0,
    min_order_value: null,
    ...over,
  });

  it("applies a percentage discount to the recomputed subtotal", async () => {
    const db = fakeDb({ products: [product({ price: 1000 })], discounts: [discount()] });
    const r = await priced(db, cart({ quantity: 2 }), "SAVE10");
    expect(r.subtotal).toBe(2000);
    expect(r.discountAmount).toBe(200);
    expect(r.total).toBe(1800);
    expect(r.appliedDiscountId).toBe("disc-1");
  });

  it("caps a fixed discount at the subtotal", async () => {
    // NOTE: this passes because discounts.ts does the capping
    // (Math.min(value, subtotal)). It exercises the validator, not
    // orderPricing's own floor — see the next test.
    const db = fakeDb({
      products: [product({ price: 100 })],
      discounts: [discount({ discount_type: "fixed", value: 99999 })],
    });
    const r = await priced(db, cart({ quantity: 1 }), "SAVE10");
    expect(r.discountAmount).toBe(100);
    expect(r.total).toBe(0);
  });

  it("floors the order value at zero even if the validator returns more than the subtotal", async () => {
    // orderPricing's OWN defence: `Math.max(0, subtotal - discount)`.
    //
    // It cannot be reached through the real validator, because that
    // already caps fixed discounts and percentages cannot exceed 100%
    // in practice. So the test above — which looks like it covers this
    // — left the floor untested: deleting Math.max(0, ...) kept the
    // whole file green.
    //
    // The validator is stubbed here precisely because the floor exists
    // to survive a CHANGE to the validator. Testing it only through
    // today's validator would mean the guard is verified by the thing
    // it is guarding against.
    forcedDiscount.value = { valid: true, discountId: "d", discountAmount: 5000 };
    const db = fakeDb({
      products: [product({ price: 100 })],
      websites: [website({ shipping_mode: "flat", shipping_rate: 60 })],
    });
    const r = await priced(db, cart({ quantity: 1 }), "ANY");

    expect(r.total).toBeGreaterThanOrEqual(0);
    // Shipping is still charged on a zero-value order; the floor stops
    // the discount going negative, it does not make the order free.
    expect(r.total).toBe(60);
  });

  it("rejects the whole order on a bad code rather than quietly charging full price", async () => {
    // Quietly ignoring an invalid code charges a customer more than
    // the page they were looking at said. Refusing lets them see why.
    const db = fakeDb({ products: [product()], discounts: [] });
    const r = await resolveOrderPricing(db, "myshop", cart(), "NOPE");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.status).toBe(400);
  });

  it("rejects an expired code", async () => {
    const db = fakeDb({ discounts: [discount({ expires_at: "2020-01-01T00:00:00Z" })] });
    const r = await resolveOrderPricing(db, "myshop", cart(), "SAVE10");
    expect(r.ok === false && r.error).toMatch(/expired/i);
  });

  it("rejects a code that has hit its usage limit", async () => {
    const db = fakeDb({ discounts: [discount({ max_uses: 5, used_count: 5 })] });
    const r = await resolveOrderPricing(db, "myshop", cart(), "SAVE10");
    expect(r.ok === false && r.error).toMatch(/usage limit/i);
  });

  it("applies no discount when no code is given", async () => {
    const db = fakeDb({ products: [product({ price: 1000 })], discounts: [discount()] });
    const r = await priced(db, cart({ quantity: 1 }));
    expect(r.discountAmount).toBe(0);
    expect(r.appliedDiscountId).toBeNull();
    expect(r.total).toBe(1000);
  });
});

describe("shipping is computed on the POST-discount value", () => {
  it("charges a flat rate on top of the discounted total", async () => {
    const db = fakeDb({
      products: [product({ price: 500 })],
      websites: [website({ shipping_mode: "flat", shipping_rate: 60 })],
    });
    const r = await priced(db, cart({ quantity: 1 }));
    expect(r.shippingAmount).toBe(60);
    expect(r.total).toBe(560);
  });

  it("waives shipping above the threshold", async () => {
    const db = fakeDb({
      products: [product({ price: 1000 })],
      websites: [website({ shipping_mode: "free_above", shipping_rate: 60, shipping_free_threshold: 999 })],
    });
    const r = await priced(db, cart({ quantity: 1 }));
    expect(r.shippingAmount).toBe(0);
    expect(r.total).toBe(1000);
  });

  it("REINSTATES shipping when a discount drops the order below the threshold", async () => {
    // The subtle one, and the reason this is worth a test rather than
    // a glance: computeShippingAmount is given orderValue AFTER the
    // discount, so a code that takes ₹1,000 to ₹900 re-triggers a
    // ₹60 charge. Correct — free shipping was earned on the amount
    // actually paid — but not obvious, and easy to "fix" wrongly.
    const db = fakeDb({
      products: [product({ price: 1000 })],
      websites: [website({ shipping_mode: "free_above", shipping_rate: 60, shipping_free_threshold: 999 })],
      discounts: [{
        id: "disc-1", dealership_id: DEALERSHIP, code: "SAVE10", is_active: true,
        discount_type: "percent", value: 10, expires_at: null, max_uses: null,
        used_count: 0, min_order_value: null,
      }],
    });
    const r = await priced(db, cart({ quantity: 1 }), "SAVE10");
    expect(r.discountAmount).toBe(100);
    expect(r.shippingAmount).toBe(60);
    expect(r.total).toBe(960);
  });
});

describe("a store that isn't open cannot take an order", () => {
  it("refuses an unpublished store", async () => {
    const db = fakeDb({ websites: [website({ published: false })] });
    const r = await resolveOrderPricing(db, "myshop", cart());
    expect(r.ok === false && r.status).toBe(404);
    expect(r.ok === false && r.error).toMatch(/isn't accepting orders/i);
  });

  it("refuses a slug that matches no store", async () => {
    const db = fakeDb({ websites: [] });
    const r = await resolveOrderPricing(db, "nope", cart());
    expect(r.ok === false && r.status).toBe(404);
  });

  it.each([
    ["", cart(), 400],
    ["myshop", [], 400],
    ["myshop", null as any, 400],
    ["myshop", "not-an-array" as any, 400],
  ])("refuses slug=%s items=%s with %i", async (slug, items, status) => {
    const r = await resolveOrderPricing(fakeDb({}), slug, items as any);
    expect(r.ok === false && r.status).toBe(status);
  });

  it("surfaces a products-table failure as a 500, not as an empty cart", async () => {
    // A database error must never be read as "none of these products
    // exist" — that would price an order against a partial catalogue.
    const db = fakeDb({ productsError: true });
    const r = await resolveOrderPricing(db, "myshop", cart());
    expect(r.ok === false && r.status).toBe(500);
    expect(r.ok === false && r.error).toMatch(/verify products/i);
  });
});
