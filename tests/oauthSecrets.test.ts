// Marketing OAuth token encryption — deferred gap 3, step 1.
//
// WHAT THESE COVER: the read/write helpers every call site goes
// through. The cutover property that matters is dual-read — a database
// where some accounts are encrypted and some are not must keep every
// integration working, because eight of these twelve columns will
// never migrate on their own (four platforms are inactive, so their
// refresh code never runs).
//
// WHAT THESE DO NOT COVER: the 15 call sites executing. Those need a
// Supabase client and live provider APIs.

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.MARKETING_ENCRYPTION_KEY = "d".repeat(64);
  process.env.CANVA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.COMMERCE_ENCRYPTION_KEY = "b".repeat(64);
});

async function mod() {
  return import("@/lib/crypto/oauthSecrets");
}

describe("dual read during cutover", () => {
  it("prefers the encrypted column", async () => {
    const { readToken, tokenWrite } = await mod();
    const row = { ...tokenWrite("gmail", "access_token", "fresh"), gmail_access_token: "stale" };
    expect(readToken(row, "gmail", "access_token")).toBe("fresh");
  });

  it("falls back to plaintext for a not-yet-migrated account", async () => {
    const { readToken } = await mod();
    // The state most accounts will be in until the backfill runs.
    expect(readToken({ gmail_refresh_token: "legacy" }, "gmail", "refresh_token")).toBe("legacy");
  });

  it("returns null when neither column holds anything", async () => {
    const { readToken } = await mod();
    expect(readToken({}, "youtube", "access_token")).toBeNull();
  });

  it("keeps a mixed database working — one provider migrated, another not", async () => {
    const { readToken, tokenWrite } = await mod();
    const row = { ...tokenWrite("gmail", "access_token", "gmail-new"), youtube_access_token: "yt-legacy" };
    expect(readToken(row, "gmail", "access_token")).toBe("gmail-new");
    expect(readToken(row, "youtube", "access_token")).toBe("yt-legacy");
  });
});

describe("writes", () => {
  it("encrypts and NULLS the plaintext column in the same statement", async () => {
    const { tokenWrite } = await mod();
    const payload = tokenWrite("linkedin", "refresh_token", "secret-value") as Record<string, unknown>;
    // So a refreshed token is never stored in the clear again,
    // whenever the backfill happens to run.
    expect(payload.linkedin_refresh_token).toBeNull();
    expect(String(payload.linkedin_refresh_token_encrypted).startsWith("v1:")).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("secret-value");
  });

  it("clears both columns on disconnect", async () => {
    const { tokenClear } = await mod();
    const payload = tokenClear("pinterest") as Record<string, unknown>;
    // Clearing only the plaintext one would leave the encrypted token
    // live after the user disconnected.
    expect(payload.pinterest_access_token).toBeNull();
    expect(payload.pinterest_access_token_encrypted).toBeNull();
    expect(payload.pinterest_refresh_token).toBeNull();
    expect(payload.pinterest_refresh_token_encrypted).toBeNull();
  });
});

describe("connection checks", () => {
  it("reports connected from either column without decrypting", async () => {
    const { hasToken, tokenWrite } = await mod();
    expect(hasToken({ snapchat_access_token: "legacy" }, "snapchat")).toBe(true);
    expect(hasToken(tokenWrite("snapchat", "access_token", "x"), "snapchat")).toBe(true);
    expect(hasToken({}, "snapchat")).toBe(false);
  });

  it("does not confuse one provider's connection for another's", async () => {
    const { hasToken } = await mod();
    expect(hasToken({ gmail_access_token: "x" }, "youtube")).toBe(false);
  });
});

describe("ring isolation", () => {
  it("a marketing token cannot be read with the commerce key", async () => {
    const { tokenWrite } = await mod();
    const { decryptSecret } = await import("@/lib/crypto/secretCrypto");
    const payload = tokenWrite("gmail", "access_token", "marketing-only") as Record<string, string>;
    // Rotating the commerce key must not touch marketing tokens.
    expect(() => decryptSecret(payload.gmail_access_token_encrypted, "commerce")).toThrow();
  });
});

describe("scope", () => {
  it("does NOT cover the deferred Meta columns", async () => {
    const m = await mod();
    // fb_page_access_token and instagram_access_token are deliberately
    // out of scope until after live testing. If someone adds them
    // here without doing the 13-file Meta migration, this fails.
    const providers = ["gmail", "youtube", "google_ads", "linkedin", "pinterest", "snapchat"];
    for (const p of providers) expect(() => m.tokenWrite(p as any, "access_token", "x")).not.toThrow();
    expect(String(m.tokenSelect("gmail"))).not.toContain("fb_page");
    expect(String(m.tokenSelect("gmail"))).not.toContain("instagram");
  });
});
