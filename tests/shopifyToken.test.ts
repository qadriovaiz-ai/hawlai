// Shopify expiring offline tokens.
//
// FROM SHOPIFY'S OWN ERROR TEXT, read out of the logs added in
// 867e557:
//
//   "[API] Non-expiring access tokens are no longer accepted for the
//    Admin API. Start using expiring offline tokens."
//
// The OAuth exchange never sent `expiring=1`, so Shopify issued a
// non-expiring token — accepted at issue time, refused on every Admin
// API call. That is why three rounds of diagnosis all read it as a
// permissions problem: OAuth completed, a token existed, and nothing
// failed until the token was USED.
//
// The rotation hazard is what most of this file is about. Every
// refresh returns a NEW refresh token and invalidates the old, and
// Shopify keeps one current expiring offline token per app+store — so
// two concurrent refreshes destroy each other's credentials at
// Shopify before either writes anything locally.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A throwaway commerce key, set BEFORE the module under test is
// imported — secretCrypto reads the ring at first use. Same pattern as
// secretCrypto.test.ts and oauthSecrets.test.ts.
process.env.COMMERCE_ENCRYPTION_KEY = process.env.COMMERCE_ENCRYPTION_KEY ?? "b".repeat(64);

import {
  isTokenFresh,
  isRefreshTokenExpired,
  isLockStale,
  refreshedWrite,
  requestRefresh,
  REFRESH_LOCK_MS,
} from "@/lib/commerce/shopifyToken";

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe("isTokenFresh", () => {
  it("accepts a token comfortably inside its hour", () => {
    expect(isTokenFresh(inMinutes(55), NOW)).toBe(true);
  });

  it("treats a token inside the 5-minute margin as stale", () => {
    // Refreshing early rather than at the boundary, matching
    // getValidGoogleAdsAccessToken.
    expect(isTokenFresh(inMinutes(4), NOW)).toBe(false);
    expect(isTokenFresh(inMinutes(6), NOW)).toBe(true);
  });

  it("treats an expired token as stale", () => {
    expect(isTokenFresh(inMinutes(-1), NOW)).toBe(false);
  });

  it("treats a MISSING expiry as stale, not as fresh", () => {
    // THE LOAD-BEARING ONE. A row with no expiry is a pre-169
    // non-expiring token — precisely what Shopify refuses. Reading
    // "no expiry" as "never expires" would reinstate the original
    // bug, and it is the natural way to write this check.
    expect(isTokenFresh(null, NOW)).toBe(false);
    expect(isTokenFresh(undefined, NOW)).toBe(false);
    expect(isTokenFresh("", NOW)).toBe(false);
    expect(isTokenFresh("not-a-date", NOW)).toBe(false);
  });
});

describe("isRefreshTokenExpired", () => {
  it("is false while the 90-day window is open", () => {
    expect(isRefreshTokenExpired(inMinutes(60 * 24 * 30), NOW)).toBe(false);
  });

  it("is true once it lapses, and for junk", () => {
    // Past this point no automated recovery exists — the merchant has
    // to reconnect — so an unreadable value must fail this way round.
    expect(isRefreshTokenExpired(inMinutes(-1), NOW)).toBe(true);
    expect(isRefreshTokenExpired(null, NOW)).toBe(true);
    expect(isRefreshTokenExpired("nonsense", NOW)).toBe(true);
  });
});

describe("isLockStale", () => {
  it("holds a fresh claim", () => {
    expect(isLockStale(new Date(NOW - 30_000).toISOString(), NOW)).toBe(false);
  });

  it("releases a claim older than the hold window", () => {
    // So a process that crashes mid-refresh cannot wedge the
    // connection permanently.
    expect(isLockStale(new Date(NOW - REFRESH_LOCK_MS - 1).toISOString(), NOW)).toBe(true);
  });

  it("treats no claim as free", () => {
    expect(isLockStale(null, NOW)).toBe(true);
    expect(isLockStale("garbage", NOW)).toBe(true);
  });
});

describe("refreshedWrite", () => {
  const data = {
    access_token: "shpat_new",
    refresh_token: "shprt_new",
    expires_in: 3600,
    refresh_token_expires_in: 7776000,
  };

  it("writes BOTH tokens together", () => {
    // Persisting the access token without the rotated refresh token
    // would strand the connection at the next refresh, holding a
    // refresh token Shopify has already retired.
    const w = refreshedWrite(data, NOW) as Record<string, any>;
    expect(w.shopify_access_token_encrypted).toBeTruthy();
    expect(w.shopify_refresh_token_encrypted).toBeTruthy();
  });

  it("stores ABSOLUTE expiry timestamps, not the raw durations", () => {
    // A stored duration is meaningless without its issue time, and
    // that pairing is what goes stale.
    const w = refreshedWrite(data, NOW) as Record<string, any>;
    expect(w.shopify_token_expires_at).toBe(new Date(NOW + 3600_000).toISOString());
    expect(w.shopify_refresh_token_expires_at).toBe(new Date(NOW + 7776000_000).toISOString());
  });

  it("releases the refresh claim in the same write", () => {
    expect((refreshedWrite(data, NOW) as Record<string, any>).shopify_refresh_lock_at).toBeNull();
  });

  it("encrypts rather than storing either token in the clear", () => {
    const w = refreshedWrite(data, NOW) as Record<string, any>;
    expect(w.shopify_access_token_encrypted).not.toContain("shpat_new");
    expect(w.shopify_refresh_token_encrypted).not.toContain("shprt_new");
  });
});

describe("requestRefresh", () => {
  const OLD_ID = process.env.SHOPIFY_CLIENT_ID;
  const OLD_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  beforeEach(() => {
    process.env.SHOPIFY_CLIENT_ID = "cid";
    process.env.SHOPIFY_CLIENT_SECRET = "csec";
  });
  afterEach(() => {
    if (OLD_ID === undefined) delete process.env.SHOPIFY_CLIENT_ID; else process.env.SHOPIFY_CLIENT_ID = OLD_ID;
    if (OLD_SECRET === undefined) delete process.env.SHOPIFY_CLIENT_SECRET; else process.env.SHOPIFY_CLIENT_SECRET = OLD_SECRET;
  });

  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch;

  it("posts grant_type=refresh_token to the shop's token endpoint", () => {
    // Shape is from Shopify's OAuth documentation, not assumed.
    const fetchImpl = ok({ access_token: "a", refresh_token: "r", expires_in: 3600, refresh_token_expires_in: 7776000 });
    return requestRefresh("acme.myshopify.com", "shprt_old", fetchImpl).then(() => {
      const [url, init] = (fetchImpl as any).mock.calls[0];
      expect(url).toBe("https://acme.myshopify.com/admin/oauth/access_token");
      const body = JSON.parse(init.body);
      expect(body.grant_type).toBe("refresh_token");
      expect(body.refresh_token).toBe("shprt_old");
      expect(body.client_id).toBe("cid");
      expect(body.client_secret).toBe("csec");
    });
  });

  it("rejects a response missing the ROTATED refresh token", async () => {
    // A refresh that returns only an access token means we would lose
    // the ability to refresh again. Treating it as success would
    // strand the connection an hour later.
    const fetchImpl = ok({ access_token: "a", expires_in: 3600 });
    const result = await requestRefresh("acme.myshopify.com", "r", fetchImpl);
    expect(result.ok).toBe(false);
  });

  it("reports a non-2xx and a network error rather than throwing", async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
    expect((await requestRefresh("acme.myshopify.com", "r", bad)).ok).toBe(false);

    const boom = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    const result = await requestRefresh("acme.myshopify.com", "r", boom);
    expect(result).toEqual({ ok: false, detail: "ECONNRESET" });
  });

  it("does not call Shopify when the app is not configured", async () => {
    delete process.env.SHOPIFY_CLIENT_SECRET;
    const fetchImpl = ok({});
    const result = await requestRefresh("acme.myshopify.com", "r", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
