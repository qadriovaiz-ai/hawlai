// A STORE THAT REFUSES THE CALL IS NOT "CONNECTED" — 27 November 2026,
// H0 of docs/AUDIT-INTEGRATION-HEALTH.md.
//
// The Shopify and WooCommerce status routes already made a real call to
// the store — and on failure each said, in its own comment, "still report
// connected: true, just no products". A dead store therefore read as
// Connected with an empty catalog, the same shape that left Search
// Console "connected" on a token dead for 23 days and Instagram
// "connected" on an invalidated one.
//
// `connected` keeps its meaning — a connection is STORED — because other
// code asks exactly that. `health` is new and says whether it WORKS.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";

let row: Record<string, any> | null;
let tokenResult: any;
let shopifyFetch: () => Promise<any[]>;
let wooFetch: () => Promise<any[]>;
let wooSecret: string | null;
const wooCalls: number[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      const api: any = {
        select: () => api,
        eq: () => api,
        single: async () => ({ data: table === "profiles" ? { dealership_id: "d1" } : row, error: null }),
      };
      return api;
    },
  }),
}));
vi.mock("@/lib/crypto/commerceSecrets", () => ({
  SHOPIFY_TOKEN_SELECT: "shopify_access_token",
  WOOCOMMERCE_SECRET_SELECT: "woocommerce_consumer_secret",
  shopifyAccessToken: (r: any) => (r?.shopify_store_url ? "stored-token" : null),
  woocommerceConsumerSecret: () => wooSecret,
  clearedWrite: () => ({}),
}));
vi.mock("@/lib/commerce/shopifyToken", () => ({ getValidShopifyAccessToken: async () => tokenResult }));
vi.mock("@/lib/agents/shopifyAgent", () => ({ fetchShopifyProducts: () => shopifyFetch() }));
vi.mock("@/lib/agents/woocommerceAgent", () => ({
  fetchWooCommerceProducts: () => {
    wooCalls.push(1);
    return wooFetch();
  },
}));

import { GET as shopifyGET } from "@/app/api/integrations/shopify/route";
import { GET as wooGET } from "@/app/api/integrations/woocommerce/route";
import { healthFromFailure } from "@/lib/integrations/healthState";

beforeEach(() => {
  row = null;
  tokenResult = { ok: true, accessToken: "fresh" };
  shopifyFetch = async () => [{ id: "p1" }];
  wooFetch = async () => [{ id: 1 }];
  wooSecret = "cs_secret";
  wooCalls.length = 0;
});

const shopify = async () => (await shopifyGET()).json();
const woo = async () => (await wooGET()).json();

describe("1. SHOPIFY SAYS WHAT ITS CALL FOUND", () => {
  beforeEach(() => {
    row = { id: "d1", shopify_store_url: "a-shop.myshopify.com" };
  });

  it("A STORE THAT ANSWERS IS WORKING, with its products", async () => {
    const r = await shopify();
    expect(r.connected).toBe(true);
    expect(r.health).toEqual({ state: "working", reason: null });
    expect(r.products).toHaveLength(1);
  });

  it("A REFUSED TOKEN IS 'NEEDS RECONNECT' — and still stored, so `connected` stays true", async () => {
    shopifyFetch = async () => {
      throw new Error("[API] Invalid API key or access token (unrecognized login or wrong password)");
    };
    const r = await shopify();
    expect(r.connected).toBe(true);
    expect(r.health.state).toBe("needs_reconnect");
    expect(r.health.reason).toContain("Invalid API key");
  });

  it("A STORE THAT IS DOWN IS 'NOT RESPONDING' — reconnecting would not help", async () => {
    shopifyFetch = async () => {
      throw new Error("Shopify returned 503");
    };
    expect((await shopify()).health).toEqual({ state: "not_responding", reason: "Shopify returned 503" });
  });

  it("A TOKEN THAT CANNOT BE RENEWED IS 'NEEDS RECONNECT', with the reason", async () => {
    tokenResult = { ok: false, reason: "reconnect_required", detail: "Shopify refresh returned 401" };
    expect((await shopify()).health).toEqual({ state: "needs_reconnect", reason: "Shopify refresh returned 401" });
  });

  it("A TOKEN BEING REFRESHED ELSEWHERE IS NOT BROKEN — it is unchecked", async () => {
    tokenResult = { ok: false, reason: "busy" };
    expect((await shopify()).health.state).toBe("unchecked");
  });

  it("NOT CONNECTED HAS NO HEALTH AT ALL", async () => {
    row = { id: "d1", shopify_store_url: null };
    const r = await shopify();
    expect(r.connected).toBe(false);
    expect(r.health).toBeNull();
  });
});

describe("2. WOOCOMMERCE, THE SAME", () => {
  beforeEach(() => {
    row = { woocommerce_store_url: "https://shop.example", woocommerce_consumer_key: "ck_1" };
  });

  it("WORKING when the store answers", async () => {
    expect((await woo()).health).toEqual({ state: "working", reason: null });
  });

  it("A 401 IS 'NEEDS RECONNECT'", async () => {
    wooFetch = async () => {
      throw new Error("WooCommerce returned 401");
    };
    const r = await woo();
    expect(r.connected).toBe(true);
    expect(r.health).toEqual({ state: "needs_reconnect", reason: "WooCommerce returned 401" });
  });

  it("A NETWORK FAILURE IS 'NOT RESPONDING'", async () => {
    wooFetch = async () => {
      throw new Error("fetch failed");
    };
    expect((await woo()).health.state).toBe("not_responding");
  });

  it("A SECRET THAT CANNOT BE READ NEEDS RECONNECTING — and the store is not called with nothing", async () => {
    wooSecret = null;
    expect((await woo()).health.state).toBe("needs_reconnect");
    expect(wooCalls).toEqual([]);
  });
});

describe("3. READING A PROVIDER'S REFUSAL", () => {
  it("THE CREDENTIAL REFUSALS SEEN IN THIS PRODUCT ARE ALL 'NEEDS RECONNECT'", () => {
    for (const msg of [
      "invalid_grant: Bad Request",
      "Error validating access token: The session has been invalidated because the user changed their password",
      "OAuthException",
      "invalid_client: The OAuth client was not found.",
      "Request failed with 403",
    ]) {
      expect(healthFromFailure(msg).state, msg).toBe("needs_reconnect");
    }
  });

  it("ANYTHING ELSE IS 'NOT RESPONDING', and the reason is never empty", () => {
    expect(healthFromFailure("ETIMEDOUT").state).toBe("not_responding");
    expect(healthFromFailure("").reason).toBeTruthy();
    expect(healthFromFailure(undefined).reason).toBeTruthy();
  });
});

describe("4. THE CARDS DRAW WHAT THE CALL FOUND, NOT A GREEN TICK ON A ROW", () => {
  for (const file of ["src/components/settings/ShopifyConnect.tsx", "src/components/settings/WooCommerceConnect.tsx"]) {
    it(`${file.split("/").pop()} shows the shared health line and no hand-drawn "Connected"`, () => {
      const src = code(file);
      expect(src).toMatch(/<IntegrationHealthLine[\s\S]*?health=\{health\s*\?\?/);
      // The old line was an icon followed by the word: `<Check … /> Connected`.
      expect(src).not.toMatch(/\/>\s*Connected\b/);
    });
  }
});
