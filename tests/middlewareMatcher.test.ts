// What the auth middleware runs on — found in PRODUCTION, not here.
//
// The WooCommerce connect flow shipped green: typecheck clean, 349
// tests passing, build fine. It was completely broken in production
// for a reason no test could see. The dealer's store POSTs the
// consumer key and secret to our callback server-to-server, with no
// browser and no session cookie, and the middleware matcher covered
// that path — so the request got a 307 to /auth/login and the
// credentials were never stored. Approve on your store, land back
// disconnected, nothing anywhere says why.
//
// Shopify's callback survived only because it is a browser redirect
// carrying the dealer's own cookie. It would still have failed in a
// private window or a different browser.
//
// This is OPEN_ITEMS item 0 exactly: a runtime failure invisible to
// tsc, to the build, and to every unit test, because nothing ever
// executed the route in its real environment. These tests are the
// narrow version of that check — they evaluate the actual matcher
// against the actual paths, so the regression cannot come back
// quietly.

import { describe, it, expect } from "vitest";
import { config } from "@/middleware";

// Next compiles the matcher with path-to-regexp; for a pattern this
// shape a direct RegExp is faithful, and building it from the real
// exported value is what makes the test meaningful.
const patterns = config.matcher.map((m) => new RegExp(`^${m}$`));
const runsMiddleware = (path: string) => patterns.some((re) => re.test(path));

describe("middleware matcher", () => {
  it("does NOT run on the OAuth callbacks", () => {
    // THE LOAD-BEARING ONE. Both routes authenticate themselves —
    // Shopify by HMAC plus a single-use nonce, WooCommerce by nonce
    // alone (its flow has no app registration, so no shared secret
    // exists to sign with). Neither can present a session cookie.
    expect(runsMiddleware("/api/integrations/woocommerce/callback")).toBe(false);
    expect(runsMiddleware("/api/integrations/shopify/callback")).toBe(false);
  });

  it("still runs on the routes that START those flows", () => {
    // These are called by a logged-in dealer from the settings page
    // and must stay protected — they write to that dealership's row.
    expect(runsMiddleware("/api/integrations/woocommerce/start")).toBe(true);
    expect(runsMiddleware("/api/integrations/shopify/start")).toBe(true);
  });

  it("still runs on the rest of the integrations API", () => {
    // The reason the exclusions are listed one by one rather than as
    // an `api/integrations` prefix: a prefix would quietly make all
    // of these public.
    for (const path of [
      "/api/integrations/woocommerce",
      "/api/integrations/shopify",
      "/api/integrations/google-reviews",
      "/api/integrations/products",
      "/api/integrations/google-ads/conversions",
    ]) {
      expect(runsMiddleware(path), `${path} must stay behind middleware`).toBe(true);
    }
  });

  it("does not accidentally exclude look-alike paths", () => {
    // A sloppier pattern would let these through on a substring.
    for (const path of [
      "/api/integrations/shopify/callback-other",
      "/api/integrations/woocommerce/callbackx",
      "/api/integrations/evil/api/integrations/shopify/callback",
    ]) {
      expect(runsMiddleware(path), `${path} must stay behind middleware`).toBe(true);
    }
  });

  it("keeps running on pages and the rest of the API", () => {
    // Guards against the opposite failure: a matcher that stops
    // matching (or is ignored by Next for not being statically
    // analysable) takes session refresh off the whole app.
    for (const path of ["/dashboard", "/dashboard/settings/integrations", "/api/settings/tracking", "/auth/login", "/"]) {
      expect(runsMiddleware(path), `${path} must run middleware`).toBe(true);
    }
  });

  it("still skips webhooks, static assets and the privacy policy", () => {
    for (const path of [
      "/api/webhooks/meta-leads",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/privacy-policy",
      "/logo.png",
    ]) {
      expect(runsMiddleware(path), `${path} must skip middleware`).toBe(false);
    }
  });

  it("is a plain string literal Next can statically analyse", () => {
    // Next IGNORES a matcher it cannot read at build time — it does
    // not error. Composing this from a constant would silently
    // disable the middleware everywhere, which is worse than the bug
    // being fixed. Asserting the shape is the only cheap guard.
    for (const entry of config.matcher) {
      expect(typeof entry).toBe("string");
      expect(entry.startsWith("/")).toBe(true);
    }
  });
});
