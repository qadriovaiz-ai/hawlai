// Canva token lifecycle — R2.3 revenue-path coverage.
//
// WHY THIS ONE MATTERS MOST of the Canva work: Canva's refresh tokens
// are SINGLE USE and rotate on every refresh. That makes two failure
// modes possible which do not exist with ordinary tokens:
//
//   1. A refresh succeeds but the new token fails to save. Canva has
//      already invalidated the old one, so the connection works for
//      four more hours and is then permanently dead — with the failure
//      appearing long after the code that caused it.
//   2. A refresh fails because the stored token was already spent.
//      Retrying can never work, so leaving the row in place makes the
//      UI claim "Connected" over credentials that authenticate nothing.
//
// Both are asserted below against an injected fake Supabase client and
// a stubbed fetch.
//
// WHAT THESE DO NOT COVER: the real Canva token endpoint, the OAuth
// callback route, and design/export calls. Those need live credentials
// (deferred with R9). What is covered is our own logic around the
// boundary — which is where the rotation hazard lives.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.CANVA_TOKEN_ENCRYPTION_KEY = "c".repeat(64);
process.env.CANVA_CLIENT_ID = "cid";
process.env.CANVA_CLIENT_SECRET = "csecret";
process.env.CANVA_REDIRECT_URI = "https://example.test/cb";

import { getValidAccessToken } from "@/lib/canva/client";
import { encryptToken } from "@/lib/canva/tokenCrypto";

/** Records what happened to the connection row so tests can assert on it. */
function fakeSupabase(row: any | null, opts: { updateError?: string } = {}) {
  const calls = { updated: null as any, deleted: false };
  return {
    calls,
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row }) };
            },
          };
        },
        update(payload: any) {
          calls.updated = payload;
          return {
            eq: async () => ({ error: opts.updateError ? { message: opts.updateError } : null }),
          };
        },
        delete() {
          calls.deleted = true;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as any;
}

function connectionRow(expiresInMs: number) {
  return {
    access_token_encrypted: encryptToken("current-access-token"),
    refresh_token_encrypted: encryptToken("current-refresh-token"),
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  };
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("no connection", () => {
  it("returns null rather than throwing when the user has never connected", async () => {
    const db = fakeSupabase(null);
    expect(await getValidAccessToken(db, "user-1")).toBeNull();
  });
});

describe("token still valid", () => {
  it("returns the stored token without contacting Canva", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const db = fakeSupabase(connectionRow(3 * HOUR));
    expect(await getValidAccessToken(db, "user-1")).toBe("current-access-token");
    // Refreshing a still-valid token would spend the single-use
    // refresh token for no reason.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("refresh near expiry", () => {
  it("refreshes when the token is inside the safety margin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 14400,
            token_type: "Bearer",
          }),
      }))
    );

    // Two minutes left — inside the five-minute margin, so a long
    // export started now would otherwise die mid-flight.
    const db = fakeSupabase(connectionRow(2 * 60 * 1000));
    expect(await getValidAccessToken(db, "user-1")).toBe("new-access-token");
  });

  it("PERSISTS the rotated refresh token, not just the access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 14400,
            token_type: "Bearer",
          }),
      }))
    );

    const db = fakeSupabase(connectionRow(-HOUR));
    await getValidAccessToken(db, "user-1");

    // Failing to store the rotated refresh token is the bug that only
    // surfaces four hours later, when the next refresh presents a
    // token Canva already invalidated.
    expect(db.calls.updated).toBeTruthy();
    expect(db.calls.updated.refresh_token_encrypted).toBeTruthy();
    expect(db.calls.updated.access_token_encrypted).toBeTruthy();
  });

  it("stores tokens encrypted, never in plaintext", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 14400,
            token_type: "Bearer",
          }),
      }))
    );

    const db = fakeSupabase(connectionRow(-HOUR));
    await getValidAccessToken(db, "user-1");

    const written = JSON.stringify(db.calls.updated);
    expect(written).not.toContain("new-access-token");
    expect(written).not.toContain("new-refresh-token");
    expect(db.calls.updated.access_token_encrypted.startsWith("v1:")).toBe(true);
  });
});

describe("failure paths", () => {
  it("THROWS when the refreshed token cannot be saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 14400,
            token_type: "Bearer",
          }),
      }))
    );

    // Canva has already invalidated the old refresh token by this
    // point. Returning the working access token would hand back
    // something usable for four hours attached to a connection that
    // is already unrecoverable. Loud failure is correct.
    const db = fakeSupabase(connectionRow(-HOUR), { updateError: "write failed" });
    await expect(getValidAccessToken(db, "user-1")).rejects.toThrow(/Reconnect Canva/);
  });

  it("DELETES the connection when the refresh itself is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, text: async () => '{"error":"invalid_grant"}' }))
    );

    const db = fakeSupabase(connectionRow(-HOUR));
    expect(await getValidAccessToken(db, "user-1")).toBeNull();
    // A spent refresh token will never work again, so keeping the row
    // would leave the UI showing "Connected" forever over dead
    // credentials.
    expect(db.calls.deleted).toBe(true);
  });

  it("deletes the connection when the stored token cannot be decrypted", async () => {
    const db = fakeSupabase({
      access_token_encrypted: "v1:corrupt:corrupt:corrupt",
      refresh_token_encrypted: "v1:corrupt:corrupt:corrupt",
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    });
    // Happens if the encryption key changed. Unrecoverable here, so
    // the honest outcome is "reconnect", not a crash.
    expect(await getValidAccessToken(db, "user-1")).toBeNull();
    expect(db.calls.deleted).toBe(true);
  });

  it("never returns a token when Canva responds without one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ token_type: "Bearer" }) }))
    );

    const db = fakeSupabase(connectionRow(-HOUR));
    expect(await getValidAccessToken(db, "user-1")).toBeNull();
    expect(db.calls.deleted).toBe(true);
  });
});
