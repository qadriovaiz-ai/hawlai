// The business's own storefront as a publish platform.
//
// THE GAP THIS CLOSES: chat listed "Lavender candle — ₹550" from the
// products table, then propose_price_change searched SHOPIFY, found
// nothing, and told the owner to go and edit it by hand. The store
// nearly every Hawlai business actually sells from had no write path at
// all.
//
// The contract is the Shopify module's, for the same reasons: preview
// reads what is really there, execute RE-READS before writing and
// refuses if the value moved since the preview, and already-at-target is
// checked BEFORE staleness so a retry after a timeout reports success
// rather than demanding re-approval.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHawlaiShopPlatform } from "@/lib/publish/platforms/hawlaiShop";
import { createPlatformRegistry } from "@/lib/publish/registry";
import type { PublishActionRecord } from "@/lib/publish/types";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let writes: { table: string; values: Row; filters: [string, any][] }[];
let failing: Set<string>;
/** Rows an update matches — 0 reproduces Supabase's "success with error: null". */
let updateMatches = 1;

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const answer = (data: any) => (failing.has(table) ? { data: null, error: { message: `${table} is down` } } : { data, error: null });
    const api: any = {
      select: () => api, order: () => api, limit: () => api, is: () => api, in: () => api, gte: () => api, not: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      update: (v: Row) => ((op = "update"), (values = v), api),
      maybeSingle: async () => {
        if (op === "update") {
          writes.push({ table, values, filters: [...filters] });
          const hit = rows();
          hit.forEach((r) => Object.assign(r, values));
          return answer(updateMatches > 0 && hit.length ? { id: hit[0].id } : null);
        }
        return answer(rows()[0] ?? null);
      },
      then: (res: any, rej: any) => Promise.resolve(answer(rows())).then(res, rej),
    };
    return api;
  };
  return { from };
}

const PRODUCT = () => ({
  id: "p1",
  dealership_id: "d1",
  name: "Lavender candle",
  price: 550,
  description: "Hand-poured soy wax.",
  images: ["https://cdn.example/lavender.jpg"],
  is_active: true,
});

const platform = () => createHawlaiShopPlatform({ supabase: db() });

function action(over: Partial<PublishActionRecord> = {}): PublishActionRecord {
  return {
    id: "act1",
    dealershipId: "d1",
    platform: "hawlai_shop",
    connectionRef: null,
    actionKey: "update_product_price",
    targetRef: "p1",
    targetLabel: "Lavender candle",
    requestedChanges: { price: "999" },
    preview: null,
    previewedAt: null,
    status: "draft",
    idempotencyKey: "k1",
    ...over,
  } as PublishActionRecord;
}

/** An action as it exists at approval time: previewed, with its before-values recorded. */
const previewed = (over: Partial<PublishActionRecord>, changes: { field: string; before: string | null; after: string }[]) =>
  action({ ...over, preview: { summary: "", changes, warnings: [] }, status: "awaiting_approval" });

beforeEach(() => {
  tables = { products: [PRODUCT()] };
  writes = [];
  failing = new Set();
  updateMatches = 1;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the preview shows what is really in the store", () => {
  it("current price beside the proposed one, with the product it resolved to", async () => {
    const result = await platform().preview(action());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.preview.summary).toBe('"Lavender candle" — Price: ₹550.00 → ₹999.00');
    expect(result.preview.changes).toEqual([{ field: "price", before: "550", after: "999" }]);
    expect(result.preview.target).toMatchObject({
      title: "Lavender candle",
      currentPrice: "₹550.00",
      currency: "INR",
      imageUrl: "https://cdn.example/lavender.jpg",
    });
  });

  it("warns about a big move, and about making it free — without blocking either", async () => {
    const big = await platform().preview(action({ requestedChanges: { price: "999" } }));
    expect(big.ok && big.preview.warnings).toContain("Increase of 82%.");

    const free = await platform().preview(action({ requestedChanges: { price: "0" } }));
    expect(free.ok && free.preview.warnings).toContain("This makes the product free.");
  });

  it("says when the product isn't published, since customers won't see the change", async () => {
    tables.products = [{ ...PRODUCT(), is_active: false }];
    const r = await platform().preview(action());
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/unpublished.*Website Builder → Products/);
  });

  it("says when the value is already what was asked for", async () => {
    const r = await platform().preview(action({ requestedChanges: { price: "550" } }));
    expect(r.ok && r.preview.warnings).toContain("The price is already this value — approving will change nothing.");
  });

  it("a currency the storefront doesn't use is a warning, never a conversion", async () => {
    const r = await platform().preview(action({ requestedChanges: { price: "999", statedCurrency: "USD" } }));
    expect(r.ok && r.preview.warnings.join(" ")).toMatch(/You said USD.*prices in rupees.*not converted/);
  });

  it("previews a rename and a new description too", async () => {
    const rename = await platform().preview(action({ actionKey: "update_product_name", requestedChanges: { name: "Lavender Nights candle" } }));
    expect(rename.ok && rename.preview.changes).toEqual([{ field: "name", before: "Lavender candle", after: "Lavender Nights candle" }]);

    const described = await platform().preview(
      action({ actionKey: "update_product_description", requestedChanges: { description: "Soy wax, 40 hour burn." } })
    );
    expect(described.ok && described.preview.changes[0].before).toBe("Hand-poured soy wax.");
  });

  it("refuses an amount that isn't one, and an empty name", async () => {
    expect(await platform().preview(action({ requestedChanges: { price: "cheap" } }))).toEqual({ ok: false, reason: "That price isn't a valid amount." });
    expect(await platform().preview(action({ actionKey: "update_product_name", requestedChanges: { name: "  " } }))).toEqual({ ok: false, reason: "That name is empty." });
  });

  it("a deleted product and an unreadable store are different answers", async () => {
    tables.products = [];
    expect(await platform().preview(action())).toEqual({ ok: false, reason: "That product is no longer in your store." });

    tables.products = [PRODUCT()];
    failing.add("products");
    expect(await platform().preview(action())).toEqual({ ok: false, reason: "Couldn't read your store just now — nothing was changed. Try again in a moment." });
  });
});

describe("approving writes the change — once, and only from the state that was approved", () => {
  it("writes the new price to the product, scoped to the business", async () => {
    const r = await platform().execute(previewed({}, [{ field: "price", before: "550", after: "999" }]));
    expect(r.ok).toBe(true);
    expect(tables.products[0].price).toBe(999);
    expect(writes[0].filters).toEqual([["id", "p1"], ["dealership_id", "d1"]]);
  });

  it("writes a rename and a description the same way", async () => {
    await platform().execute(
      previewed({ actionKey: "update_product_name", requestedChanges: { name: "Lavender Nights" } }, [{ field: "name", before: "Lavender candle", after: "Lavender Nights" }])
    );
    expect(tables.products[0].name).toBe("Lavender Nights");

    await platform().execute(
      previewed({ actionKey: "update_product_description", requestedChanges: { description: "New copy." } }, [
        { field: "description", before: "Hand-poured soy wax.", after: "New copy." },
      ])
    );
    expect(tables.products[0].description).toBe("New copy.");
  });

  it("a price that already equals the target is a no-op success — so a retry after a timeout isn't 'stale'", async () => {
    tables.products = [{ ...PRODUCT(), price: 999 }];
    const r = await platform().execute(previewed({}, [{ field: "price", before: "550", after: "999" }]));
    expect(r).toEqual({ ok: true, platformResponse: { skipped: "already at the requested price" } });
    expect(writes).toEqual([]);
  });

  it("a price changed by someone else since the preview is refused, and nothing is written", async () => {
    tables.products = [{ ...PRODUCT(), price: 600 }];
    const r = await platform().execute(previewed({}, [{ field: "price", before: "550", after: "999" }]));
    expect(r).toEqual({ ok: false, stale: true, changed: [{ field: "price", before: "550", after: "600" }] });
    expect(writes).toEqual([]);
    expect(tables.products[0].price).toBe(600);
  });

  it("an update that matches no row is reported, not treated as success", async () => {
    updateMatches = 0;
    const r = await platform().execute(previewed({}, [{ field: "price", before: "550", after: "999" }]));
    expect(r).toEqual({ ok: false, reason: "The change matched no product in your store, so nothing was saved." });
  });

  it("a failed write says so", async () => {
    failing.add("products");
    const r = await platform().execute(previewed({}, [{ field: "price", before: "550", after: "999" }]));
    expect(r.ok).toBe(false);
  });

  it("an action that was never previewed cannot execute", async () => {
    const r = await platform().execute(action());
    expect(r).toEqual({ ok: false, reason: "This action was never previewed." });
  });
});

describe("what this platform claims it can do", () => {
  it("price, name and description — and nothing it hasn't built", async () => {
    expect(platform().supports).toEqual(["update_product_price", "update_product_name", "update_product_description"]);
    expect(await platform().preview(action({ actionKey: "create_discount_code" }))).toEqual({
      ok: false,
      reason: 'Your store can\'t do "create_discount_code".',
    });
  });

  it("is in the registry — the executor can only run what is registered", () => {
    // The failure this guards: a platform proposed, previewed and
    // approved, then "No platform module for ..." AFTER the human said
    // yes.
    const registry = createPlatformRegistry(db());
    expect(registry.hawlai_shop).toBeTruthy();
    expect(registry.hawlai_shop!.supports).toContain("update_product_price");
  });

  it("is connected when the business has products, and not when it has none", async () => {
    expect(await platform().isConnected("d1")).toBe(true);
    tables.products = [];
    expect(await platform().isConnected("d1")).toBe(false);
  });
});
