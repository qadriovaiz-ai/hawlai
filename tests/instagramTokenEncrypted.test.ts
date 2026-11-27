// THE INSTAGRAM TOKEN, ENCRYPTED AND KEPT ALIVE — 28 November 2026, F3 of
// docs/PLAN-INSTAGRAM-SELLER-MODE.md.
//
// It was the last Meta credential in the clear (oauthSecrets.ts deferred
// it "to the next pass"), and it now answers customers with nobody
// watching. And it expired after ~60 days with nothing refreshing it, so
// every connection went silent on a schedule.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/source";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const recorded: any[] = [];
vi.mock("@/lib/integrations/health", () => ({
  recordHealth: async (_s: any, d: string, key: string, health: any) => {
    recorded.push({ d, key, health });
    return { recorded: true, notified: false };
  },
}));

import {
  INSTAGRAM_TOKEN_SELECT,
  readInstagramToken,
  hasInstagramToken,
  instagramTokenWrite,
  instagramTokenClear,
} from "@/lib/crypto/oauthSecrets";
import { refreshInstagramToken, refreshDue, REFRESH_WITHIN_MS } from "@/lib/instagram/tokenRefresh";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";
import { GROUPS } from "@/lib/automation/cronGroups";

const NOW = new Date("2026-11-28T12:00:00Z");
const DAY = 86_400_000;

describe("1. STORED ENCRYPTED — the Page token's rule", () => {
  it("A WRITE ENCRYPTS, NULLS THE PLAINTEXT, AND KEEPS THE EXPIRY", () => {
    const w = instagramTokenWrite("IGQ-secret", 5_184_000, NOW.getTime());
    expect(w.instagram_access_token).toBeNull();
    expect(w.instagram_access_token_encrypted).toBeTruthy();
    expect(w.instagram_access_token_encrypted).not.toContain("IGQ-secret");
    expect(w.instagram_token_expires_at).toBe(new Date(NOW.getTime() + 5_184_000_000).toISOString());
  });

  it("A READ DECRYPTS FIRST, and falls back to the plaintext column for an unmigrated row", () => {
    const w = instagramTokenWrite("IGQ-secret", null, NOW.getTime());
    expect(readInstagramToken(w, NOW.getTime())).toBe("IGQ-secret");
    expect(readInstagramToken({ instagram_access_token: "legacy-plain" }, NOW.getTime())).toBe("legacy-plain");
  });

  it("PAST A KNOWN EXPIRY IS NO TOKEN AT ALL; an unknown expiry is still read", () => {
    const w = instagramTokenWrite("IGQ-secret", 60, NOW.getTime());
    expect(readInstagramToken(w, NOW.getTime() + 61_000)).toBeNull();
    expect(readInstagramToken({ instagram_access_token: "legacy-plain", instagram_token_expires_at: null }, NOW.getTime())).toBe("legacy-plain");
  });

  it("'is it stored?' never decrypts, and disconnecting clears all three columns", () => {
    expect(hasInstagramToken({ instagram_access_token_encrypted: "not-decryptable" })).toBe(true);
    expect(instagramTokenClear()).toEqual({ instagram_access_token: null, instagram_access_token_encrypted: null, instagram_token_expires_at: null });
  });

  it("THE SELECT NAMES ALL THREE", () => {
    expect(INSTAGRAM_TOKEN_SELECT.split(/,\s*/).sort()).toEqual(["instagram_access_token", "instagram_access_token_encrypted", "instagram_token_expires_at"]);
  });
});

// ---------------------------------------------------------------------
// The guard the Page token's comment promised and nothing provided.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

describe("2. NOTHING READS OR WRITES THE PLAINTEXT COLUMN BY NAME BUT THE HELPER", () => {
  it("NO FILE OUTSIDE oauthSecrets NAMES instagram_access_token — every read is encrypted-first", () => {
    const offenders = sourceFiles("src")
      .filter((f) => !f.endsWith("src/lib/crypto/oauthSecrets.ts"))
      .filter((f) => /\binstagram_access_token\b/.test(code(f)));
    expect(offenders, `these name the plaintext column directly: ${offenders.join(", ")}`).toEqual([]);
  });

  it("THE CALLBACK WRITES THROUGH THE HELPER, WITH THE EXPIRY INSTAGRAM GAVE", () => {
    const src = code("src/app/api/auth/instagram/callback/route.ts");
    expect(src).toMatch(/\.\.\.instagramTokenWrite\(finalToken, expiresIn\)/);
  });
});

// ---------------------------------------------------------------------
let row: Record<string, any> | null;
let writes: any[];
let fetched: string[];
let reply: { status: number; body: any };

function service() {
  return {
    from: () => {
      const api: any = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: row, error: null }),
        update: (v: any) => {
          writes.push(v);
          return { eq: async () => ({ error: null }) };
        },
      };
      return api;
    },
  };
}

describe("3. KEPT ALIVE: refreshed when due, and a refusal is said", () => {
  beforeEach(() => {
    recorded.length = 0;
    writes = [];
    fetched = [];
    reply = { status: 200, body: { access_token: "IGQ-new", token_type: "bearer", expires_in: 5_184_000 } };
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      fetched.push(String(input));
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("DUE: an unknown expiry, or less than ten days left; NOT due with thirty", () => {
    expect(refreshDue(null, NOW)).toBe(true);
    expect(refreshDue(new Date(NOW.getTime() + REFRESH_WITHIN_MS - DAY).toISOString(), NOW)).toBe(true);
    expect(refreshDue(new Date(NOW.getTime() + 30 * DAY).toISOString(), NOW)).toBe(false);
  });

  it("A DUE LEGACY ROW IS REFRESHED — and that write is what moves it out of the clear", async () => {
    row = { instagram_business_id: "17841", instagram_access_token: "legacy-plain", instagram_token_expires_at: null };
    const r = await refreshInstagramToken(service(), "d1", NOW);
    expect(r).toMatchObject({ refreshed: true });
    expect(fetched[0]).toMatch(/^https:\/\/graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token&access_token=legacy-plain$/);
    expect(writes[0].instagram_access_token).toBeNull();
    expect(readInstagramToken(writes[0], NOW.getTime())).toBe("IGQ-new");
    expect(writes[0].instagram_token_expires_at).toBe(new Date(NOW.getTime() + 5_184_000_000).toISOString());
  });

  it("NOT DUE IS LEFT ALONE — no call", async () => {
    row = { ...instagramTokenWrite("IGQ-fresh", 30 * 86_400, NOW.getTime()), instagram_business_id: "17841" };
    expect(await refreshInstagramToken(service(), "d1", NOW)).toEqual({ skipped: "not due yet" });
    expect(fetched).toEqual([]);
  });

  it("A REFUSAL IS RECORDED AS 'NEEDS RECONNECT' — and the token never appears in what is said", async () => {
    row = { instagram_business_id: "17841", instagram_access_token: "legacy-plain" };
    reply = { status: 400, body: { error: { type: "OAuthException", code: 190, message: "Error validating access token: session has been invalidated" } } };
    const r: any = await refreshInstagramToken(service(), "d1", NOW);
    expect(r.error).toMatch(/code 190/);
    expect(r.error).not.toContain("legacy-plain");
    expect(recorded[0]).toMatchObject({ d: "d1", key: "instagram", health: { state: "needs_reconnect" } });
    expect(String(recorded[0].health.reason)).not.toContain("legacy-plain");
    expect(writes).toEqual([]);
  });

  it("PAST ITS KNOWN EXPIRY IS 'NEEDS RECONNECT' without asking — Instagram won't refresh a dead token", async () => {
    row = { ...instagramTokenWrite("IGQ-dead", 60, NOW.getTime() - 120_000), instagram_business_id: "17841" };
    const r: any = await refreshInstagramToken(service(), "d1", NOW);
    expect(r.error).toMatch(/expired/);
    expect(fetched).toEqual([]);
    expect(recorded[0].health.state).toBe("needs_reconnect");
  });

  it("NOT CONNECTED IS A SKIP", async () => {
    row = { instagram_business_id: null };
    expect(await refreshInstagramToken(service(), "d1", NOW)).toEqual({ skipped: "Instagram isn't connected" });
  });

  it("IT RUNS EVERY DAY, in the heavy group — a network call", () => {
    expect(GROUPS.heavy).toContain("instagram_token_refresh");
    expect(GROUPS.signals).not.toContain("instagram_token_refresh");
    expect(typeof DAILY_RUNNERS.instagram_token_refresh).toBe("function");
  });
});
