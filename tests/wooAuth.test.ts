// A6 — the dealer never types a WooCommerce key or secret.
//
// They used to open wp-admin, add a REST API key, choose Read access,
// generate it, and copy a ck_... and a cs_... back into a form. Now
// they enter their store address and approve on their own site.
//
// These tests carry more weight than the usual mapping checks, because
// the callback that receives the credentials CANNOT be authenticated —
// WooCommerce posts server-to-server with no session and no signature,
// since the flow has no app registration and therefore no shared
// secret. The nonce is the entire authenticator, and normaliseStoreUrl
// is the only thing standing between a text field and an SSRF.

import { describe, it, expect } from "vitest";
import {
  createWooNonce,
  normaliseStoreUrl,
  buildAuthorizeUrl,
  validateCallbackPayload,
  isPendingFresh,
  WOO_NONCE_TTL_MS,
} from "@/lib/commerce/wooAuth";

describe("createWooNonce", () => {
  it("is 64 hex chars and does not repeat", () => {
    const a = createWooNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const many = new Set(Array.from({ length: 50 }, () => createWooNonce()));
    expect(many.size).toBe(50);
  });

  it("produces something validateCallbackPayload accepts", () => {
    // The two halves have to agree on the format — a mismatch here
    // would reject every real callback while looking correct in both
    // files on its own.
    const result = validateCallbackPayload({ user_id: createWooNonce(), consumer_key: "ck_x", consumer_secret: "cs_x" });
    expect(result.ok).toBe(true);
  });
});

describe("normaliseStoreUrl", () => {
  it("adds https to a bare domain", () => {
    const result = normaliseStoreUrl("mystore.com");
    expect(result).toEqual({ ok: true, origin: "https://mystore.com", host: "mystore.com" });
  });

  it("keeps a subdirectory install but drops query and hash", () => {
    // WordPress is often at /shop; the path matters. A query string
    // never does, and would end up inside the authorize URL.
    const result = normaliseStoreUrl("https://mystore.com/shop/?utm=x#frag");
    expect(result.ok && result.origin).toBe("https://mystore.com/shop");
  });

  it("strips trailing slashes", () => {
    expect(normaliseStoreUrl("https://mystore.com///")).toMatchObject({ origin: "https://mystore.com" });
  });

  it("refuses http", () => {
    // WooCommerce itself refuses a non-HTTPS callback, and we should
    // not push a dealer's keys over plaintext either.
    const result = normaliseStoreUrl("http://mystore.com");
    expect(result.ok).toBe(false);
  });

  it("REFUSES loopback, private and link-local hosts", () => {
    // THE LOAD-BEARING ONE. The callback path fetches this host from
    // our servers. Without these, a text field is an SSRF primitive —
    // 169.254.169.254 is the cloud metadata endpoint.
    const hostile = [
      "localhost",
      "http://localhost:6379",
      "https://localhost:8080",
      "https://foo.localhost",
      "https://printer.local",
      "https://db.internal",
      "https://127.0.0.1",
      "https://127.1.1.1",
      "https://10.0.0.5",
      "https://192.168.1.1",
      "https://169.254.169.254",
      "https://172.16.0.1",
      "https://172.31.255.255",
      "https://0.0.0.0",
    ];
    for (const input of hostile) {
      expect(normaliseStoreUrl(input).ok, `${input} must be refused`).toBe(false);
    }
  });

  it("still allows public addresses that merely look similar", () => {
    // The guard must not be so broad it rejects real stores. 172.32
    // is outside the private range; 1.2.3.4 is public.
    for (const input of ["https://172.32.0.1", "https://11.0.0.1", "https://1.2.3.4", "https://shop.mylocalstore.com"]) {
      expect(normaliseStoreUrl(input).ok, `${input} must be allowed`).toBe(true);
    }
  });

  it("rejects empty, junk and hostnames with no dot", () => {
    for (const input of ["", "   ", null, undefined, "not a url at all", "https://intranet"]) {
      expect(normaliseStoreUrl(input as any).ok, `${String(input)} must be refused`).toBe(false);
    }
  });
});

describe("buildAuthorizeUrl", () => {
  const url = () =>
    new URL(
      buildAuthorizeUrl({
        storeOrigin: "https://mystore.com",
        appName: "Hawlai",
        nonce: "a".repeat(64),
        returnUrl: "https://app.example/dashboard/settings/integrations?woo=done",
        callbackUrl: "https://app.example/api/integrations/woocommerce/callback",
      })
    );

  it("targets the store's own wc-auth endpoint", () => {
    expect(url().origin + url().pathname).toBe("https://mystore.com/wc-auth/v1/authorize");
  });

  it("asks for read access only", () => {
    // Nothing in this product writes to a dealer's store. Requesting
    // read_write would mean a scarier approval screen and a worse
    // credential to leak.
    expect(url().searchParams.get("scope")).toBe("read");
  });

  it("carries the nonce as user_id, never a dealership id", () => {
    // user_id is the ONLY value WooCommerce echoes back, so it is what
    // decides which business receives the credentials. A dealership id
    // there would let anyone who learned one repoint that business's
    // product feed at a store they control.
    expect(url().searchParams.get("user_id")).toBe("a".repeat(64));
  });

  it("encodes the return and callback URLs intact", () => {
    expect(url().searchParams.get("callback_url")).toBe("https://app.example/api/integrations/woocommerce/callback");
    expect(url().searchParams.get("return_url")).toBe("https://app.example/dashboard/settings/integrations?woo=done");
  });
});

describe("validateCallbackPayload", () => {
  const nonce = "b".repeat(64);

  it("accepts a well-formed callback", () => {
    expect(validateCallbackPayload({ user_id: nonce, consumer_key: " ck_1 ", consumer_secret: " cs_1 " })).toEqual({
      ok: true,
      payload: { nonce, consumerKey: "ck_1", consumerSecret: "cs_1" },
    });
  });

  it("rejects a malformed nonce before any database lookup", () => {
    // Shape-checked first so probing traffic never reaches the DB.
    for (const bad of ["", "short", "B".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65), 12345, null, undefined, {}]) {
      expect(validateCallbackPayload({ user_id: bad, consumer_key: "ck", consumer_secret: "cs" }).ok, `${String(bad)}`).toBe(false);
    }
  });

  it("rejects a callback carrying no credentials", () => {
    expect(validateCallbackPayload({ user_id: nonce, consumer_key: "", consumer_secret: "cs" }).ok).toBe(false);
    expect(validateCallbackPayload({ user_id: nonce, consumer_key: "ck", consumer_secret: "  " }).ok).toBe(false);
    expect(validateCallbackPayload({ user_id: nonce }).ok).toBe(false);
  });

  it("rejects junk bodies rather than throwing", () => {
    for (const body of [null, undefined, "", 0, [], "a string"]) {
      expect(validateCallbackPayload(body as any).ok).toBe(false);
    }
  });
});

describe("isPendingFresh", () => {
  const now = Date.UTC(2026, 8, 4, 12, 0, 0);
  const at = (ms: number) => new Date(now - ms).toISOString();

  it("accepts a handshake inside the TTL", () => {
    expect(isPendingFresh(at(0), now)).toBe(true);
    expect(isPendingFresh(at(WOO_NONCE_TTL_MS - 1000), now)).toBe(true);
  });

  it("rejects one past the TTL", () => {
    expect(isPendingFresh(at(WOO_NONCE_TTL_MS + 1), now)).toBe(false);
    expect(isPendingFresh(at(24 * 60 * 60 * 1000), now)).toBe(false);
  });

  it("treats a future timestamp as stale, not as valid forever", () => {
    // Clock skew must not extend a credential window.
    expect(isPendingFresh(new Date(now + 60_000).toISOString(), now)).toBe(false);
  });

  it("rejects missing or unparseable timestamps", () => {
    for (const bad of [null, undefined, "", "not-a-date"]) {
      expect(isPendingFresh(bad as any, now)).toBe(false);
    }
  });
});
