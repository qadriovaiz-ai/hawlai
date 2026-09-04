// Shopify OAuth — Group B.
//
// The dealer used to create a custom app in their store admin, grant
// it Products read access, install it, and paste an shpat_... token.
// Now they enter their store domain and approve on Shopify.
//
// These tests are weighted heavily towards two checks, because both
// are places real Shopify integrations get broken:
//
//   normaliseShopDomain — the token exchange POSTs our CLIENT SECRET
//   to https://{shop}/admin/oauth/access_token, and `shop` comes from
//   the callback query string. Trusting it hands the secret to
//   whoever asks.
//
//   verifyShopifyHmac — without it, anyone can forge a callback.

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  normaliseShopDomain,
  buildInstallUrl,
  verifyShopifyHmac,
  checkCallback,
  createShopifyNonce,
  SHOPIFY_SCOPES,
} from "@/lib/commerce/shopifyAuth";

const SECRET = "shpss_testsecret";

/** Sign params the way Shopify does, so the tests exercise the real rule. */
function sign(params: Record<string, string>, secret = SECRET): URLSearchParams {
  const message = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const hmac = crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
  return new URLSearchParams({ ...params, hmac });
}

describe("normaliseShopDomain", () => {
  it("accepts a bare myshopify domain", () => {
    expect(normaliseShopDomain("acme-store.myshopify.com")).toEqual({ ok: true, shop: "acme-store.myshopify.com" });
  });

  it("accepts a pasted URL and keeps only the host", () => {
    expect(normaliseShopDomain("https://acme.myshopify.com/admin/products?x=1")).toEqual({
      ok: true,
      shop: "acme.myshopify.com",
    });
  });

  it("lowercases and trims", () => {
    expect(normaliseShopDomain("  ACME.MyShopify.COM  ")).toEqual({ ok: true, shop: "acme.myshopify.com" });
  });

  it("REFUSES anything that is not exactly a myshopify.com host", () => {
    // THE LOAD-BEARING ONE. Each of these is a way to smuggle a
    // different host past a lazy check — and the prize is our client
    // secret, POSTed straight to the attacker.
    const hostile = [
      "evil.com",
      "evil.com/?x=.myshopify.com",
      "https://evil.com/acme.myshopify.com",
      "https://evil.com#acme.myshopify.com",
      "acme.myshopify.com.evil.com",
      "myshopify.com",
      ".myshopify.com",
      "-acme.myshopify.com",
      "acme-.myshopify.com",
      "acme.myshopify.com:8080@evil.com",
      "https://user:pass@evil.com",
      "acme.myshopify.co",
      "acme.notmyshopify.com",
      "",
      "   ",
    ];
    for (const input of hostile) {
      expect(normaliseShopDomain(input).ok, `${input} must be refused`).toBe(false);
    }
  });

  it("still accepts legitimate handles including single characters and hyphens", () => {
    for (const host of ["a.myshopify.com", "a-b-c.myshopify.com", "store123.myshopify.com"]) {
      expect(normaliseShopDomain(host).ok, `${host} must be allowed`).toBe(true);
    }
  });

  it("accepts the real test store", () => {
    // A Shopify-generated handle: digits and a hyphen mid-string. Kept
    // as a permanent case because the hostile list above is long and a
    // guard that over-tightens would fail here first — and the failure
    // a dealer sees ("that isn't a valid .myshopify.com domain" for a
    // domain that plainly is) gives them nothing to act on.
    expect(normaliseShopDomain("pg3ggw-xr.myshopify.com")).toEqual({ ok: true, shop: "pg3ggw-xr.myshopify.com" });
    expect(normaliseShopDomain("https://pg3ggw-xr.myshopify.com/admin").ok).toBe(true);
    expect(normaliseShopDomain("  PG3GGW-XR.myshopify.com ")).toEqual({ ok: true, shop: "pg3ggw-xr.myshopify.com" });
  });
});

describe("buildInstallUrl", () => {
  const url = () =>
    new URL(
      buildInstallUrl({
        shop: "acme.myshopify.com",
        clientId: "client-123",
        nonce: "a".repeat(64),
        redirectUri: "https://app.example/api/integrations/shopify/callback",
      })
    );

  it("targets the store's own authorize endpoint", () => {
    expect(url().origin + url().pathname).toBe("https://acme.myshopify.com/admin/oauth/authorize");
  });

  it("requests read_products only", () => {
    // Nothing in this product writes to a store. A wider scope means
    // a scarier approval screen and a worse token to leak.
    expect(url().searchParams.get("scope")).toBe(SHOPIFY_SCOPES);
    expect(SHOPIFY_SCOPES).toBe("read_products");
  });

  it("carries the nonce as state", () => {
    expect(url().searchParams.get("state")).toBe("a".repeat(64));
  });
});

describe("verifyShopifyHmac", () => {
  it("accepts a correctly signed query string", () => {
    const params = sign({ code: "abc", shop: "acme.myshopify.com", state: "x", timestamp: "1700000000" });
    expect(verifyShopifyHmac(params, SECRET)).toBe(true);
  });

  it("rejects a tampered parameter", () => {
    const params = sign({ code: "abc", shop: "acme.myshopify.com", state: "x" });
    params.set("shop", "evil.myshopify.com");
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const params = sign({ code: "abc", shop: "acme.myshopify.com" }, "wrong-secret");
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
  });

  it("rejects a missing or malformed hmac without throwing", () => {
    // timingSafeEqual throws on a length mismatch, so a short hmac
    // must be length-checked before it reaches the compare.
    const params = new URLSearchParams({ code: "abc", shop: "acme.myshopify.com" });
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
    params.set("hmac", "short");
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
    params.set("hmac", "");
    expect(verifyShopifyHmac(params, SECRET)).toBe(false);
  });

  it("excludes hmac itself from the signed message", () => {
    // If hmac were left in, no genuine callback would ever verify.
    // This asserts the rule rather than the implementation: a
    // manually built message that omits hmac must match.
    const base = { code: "abc", shop: "acme.myshopify.com", state: "s", timestamp: "1" };
    const params = sign(base);
    const manual = crypto
      .createHmac("sha256", SECRET)
      .update("code=abc&shop=acme.myshopify.com&state=s&timestamp=1", "utf8")
      .digest("hex");
    expect(params.get("hmac")).toBe(manual);
    expect(verifyShopifyHmac(params, SECRET)).toBe(true);
  });

  it("verifies regardless of the order parameters arrive in", () => {
    // Shopify's rule sorts before signing, so a differently ordered
    // query string must still verify.
    const params = sign({ shop: "acme.myshopify.com", code: "abc", state: "s" });
    const reordered = new URLSearchParams();
    reordered.set("state", params.get("state")!);
    reordered.set("hmac", params.get("hmac")!);
    reordered.set("shop", params.get("shop")!);
    reordered.set("code", params.get("code")!);
    expect(verifyShopifyHmac(reordered, SECRET)).toBe(true);
  });
});

describe("checkCallback", () => {
  const nonce = createShopifyNonce();
  const good = () => sign({ code: "authcode", shop: "acme.myshopify.com", state: nonce, timestamp: "1700000000" });

  it("accepts a genuine callback", () => {
    expect(checkCallback(good(), SECRET)).toEqual({
      ok: true,
      shop: "acme.myshopify.com",
      code: "authcode",
      nonce,
    });
  });

  it("rejects a forged callback even when every field looks right", () => {
    const forged = new URLSearchParams({
      code: "authcode",
      shop: "acme.myshopify.com",
      state: nonce,
      hmac: "0".repeat(64),
    });
    expect(checkCallback(forged, SECRET)).toEqual({ ok: false, reason: "bad_hmac" });
  });

  it("rejects a bad state before doing any crypto", () => {
    const params = sign({ code: "authcode", shop: "acme.myshopify.com", state: "not-a-nonce" });
    expect(checkCallback(params, SECRET)).toEqual({ ok: false, reason: "invalid_state" });
  });

  it("rejects a missing code", () => {
    const params = sign({ shop: "acme.myshopify.com", state: nonce });
    expect(checkCallback(params, SECRET)).toEqual({ ok: false, reason: "missing_code" });
  });

  it("rejects a non-myshopify shop EVEN WHEN correctly signed", () => {
    // The case that matters most: an attacker who somehow holds the
    // signing secret still cannot redirect the token exchange, and a
    // misconfiguration cannot either.
    const params = sign({ code: "authcode", shop: "evil.example", state: nonce });
    expect(checkCallback(params, SECRET)).toEqual({ ok: false, reason: "invalid_shop" });
  });
});
