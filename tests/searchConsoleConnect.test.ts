// Connecting Google Search Console (Brain, Phase 4, migration 200).
//
// WHY THIS INTEGRATION AND NOT ANOTHER: Hawlai's SEO work is guessed.
// The toolkit asks a model for "10 keywords competitors are PROBABLY
// ranking for", and the Search Opportunity Graph and every demand-gap
// idea in the plan sit on top of that guess. Search Console is the
// owner's own real search data, free, from an account they already have.
//
// Reuses the Google OAuth app Gmail, YouTube and Ads already use, so
// there are no new credentials — one more read-only scope.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Same as every other test that touches stored secrets: a throwaway key,
// so encryption is exercised for real rather than stubbed out.
process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { matchProperty, readConnection, validAccessToken, fetchQueries, searchConsoleSelect } from "@/lib/seo/searchConsole";
import { tokenWrite, tokenClear, hasToken } from "@/lib/crypto/oauthSecrets";

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("what Hawlai asks Google for", () => {
  const connect = readFileSync("src/app/api/auth/search-console/connect/route.ts", "utf8");

  it("READ-ONLY, and nothing else", () => {
    expect(connect).toContain("webmasters.readonly");
    // Write access to someone's Search Console property has no use here,
    // so it is never requested.
    expect(connect).not.toContain("auth/webmasters\"");
    expect(connect).not.toMatch(/webmasters['"]\s*,/);
  });

  it("asks for offline access, so the daily read keeps working", () => {
    expect(connect).toContain('"access_type", "offline"');
    expect(connect).toContain('"prompt", "consent"');
  });

  it("reuses the existing Google app rather than needing new credentials", () => {
    expect(connect).toContain("GOOGLE_CLIENT_ID");
    expect(readFileSync(".env.example", "utf8")).toContain("GOOGLE_CLIENT_ID");
  });

  it("says plainly when Google sign-in isn't configured, instead of bouncing to a broken screen", () => {
    expect(connect).toContain("isn%27t%20configured");
  });
});

describe("choosing which property to read", () => {
  const sites = [
    { siteUrl: "https://someoneelse.in/", permissionLevel: "siteOwner" },
    { siteUrl: "https://hawlai.online/", permissionLevel: "siteOwner" },
  ];

  it("matches this business's own site", () => {
    expect(matchProperty(sites, "https://hawlai.online/site/candle-by-qaaf")).toBe("https://hawlai.online/");
  });

  it("A DOMAIN PROPERTY COVERS ITS SUBDOMAINS", () => {
    const domain = [{ siteUrl: "sc-domain:hawlai.online", permissionLevel: "siteOwner" }];
    expect(matchProperty(domain, "https://shop.hawlai.online/x")).toBe("sc-domain:hawlai.online");
    expect(matchProperty(domain, "https://hawlai.online/site/x")).toBe("sc-domain:hawlai.online");
    // A different domain that merely ends similarly is not a match.
    expect(matchProperty(domain, "https://nothawlai.online/x")).toBeNull();
  });

  it("A SINGLE PROPERTY IS NOT ASSUMED TO BE THE RIGHT ONE — reading another client's search data would be a privacy failure", () => {
    const agency = [{ siteUrl: "https://someoneelse.in/", permissionLevel: "siteOwner" }];
    expect(matchProperty(agency, "https://hawlai.online/site/candle-by-qaaf")).toBeNull();
  });

  it("a property the account can't actually read is skipped", () => {
    const unverified = [{ siteUrl: "https://hawlai.online/", permissionLevel: "siteUnverifiedUser" }];
    expect(matchProperty(unverified, "https://hawlai.online/site/x")).toBeNull();
  });

  it("nothing to match against is null, never a guess", () => {
    expect(matchProperty(sites, null)).toBeNull();
    expect(matchProperty([], "https://hawlai.online/x")).toBeNull();
  });
});

describe("the stored connection", () => {
  it("tokens are written ENCRYPTED, and the plaintext column is nulled", () => {
    const write = tokenWrite("search_console", "access_token", "ya29.secret") as Record<string, unknown>;
    expect(write.search_console_access_token).toBeNull();
    expect(String(write.search_console_access_token_encrypted ?? "")).not.toContain("ya29.secret");
    expect(write.search_console_access_token_encrypted).toBeTruthy();
  });

  it("reads back only when both halves are there — half a connection is not a connection", () => {
    const full = { ...tokenWrite("search_console", "access_token", "a"), ...tokenWrite("search_console", "refresh_token", "r"), search_console_site_url: "sc-domain:x.in" };
    expect(readConnection(full)?.siteUrl).toBe("sc-domain:x.in");
    expect(readConnection({ ...tokenWrite("search_console", "access_token", "a") })).toBeNull();
    expect(readConnection(null)).toBeNull();
  });

  it("disconnecting clears both halves and both columns", () => {
    const cleared = tokenClear("search_console") as Record<string, unknown>;
    expect(Object.keys(cleared).sort()).toEqual([
      "search_console_access_token",
      "search_console_access_token_encrypted",
      "search_console_refresh_token",
      "search_console_refresh_token_encrypted",
    ]);
    expect(hasToken(cleared, "search_console")).toBe(false);
  });

  it("the select asks for everything the connection needs", () => {
    for (const col of ["search_console_access_token_encrypted", "search_console_refresh_token_encrypted", "search_console_token_expiry", "search_console_site_url"]) {
      expect(searchConsoleSelect()).toContain(col);
    }
  });

  it("migration 200 creates every column the code reads", () => {
    const sql = readFileSync("supabase/migrations/200_search_console.sql", "utf8");
    for (const col of searchConsoleSelect().split(",").map((c) => c.trim())) {
      expect(sql, col).toContain(col);
    }
  });
});

describe("keeping access alive", () => {
  const conn = { accessToken: "old", refreshToken: "r", tokenExpiry: null, siteUrl: "sc-domain:x.in", email: null };

  it("a token with time left is used as it is — no needless round trip", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const good = { ...conn, tokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    expect((await validAccessToken(good)).accessToken).toBe("old");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("an expired one is refreshed, and handed back for the caller to persist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), { status: 200 })));
    const r = await validAccessToken(conn);
    expect(r.accessToken).toBe("new");
    expect(r.refreshed?.accessToken).toBe("new");
    expect(new Date(r.refreshed!.expiry).getTime()).toBeGreaterThan(Date.now());
    vi.unstubAllGlobals();
  });

  it("a refusal from Google says what to do about it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    // Google's bare "invalid_grant" tells an owner nothing, so the
    // instruction is always attached to it.
    await expect(validAccessToken(conn)).rejects.toThrow(/invalid_grant/);
    await expect(validAccessToken(conn)).rejects.toThrow(/reconnect it in Integrations/i);
    vi.unstubAllGlobals();
  });
});

describe("reading the real searches", () => {
  it("rows come back as Google reported them, with nothing added", async () => {
    let body: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ rows: [{ keys: ["candle making workshop shahjahanpur"], clicks: 3, impressions: 41, ctr: 0.0731, position: 8.4 }, { keys: [""], clicks: 1, impressions: 1, ctr: 1, position: 1 }] }),
        { status: 200 }
      );
    }));

    const rows = await fetchQueries("tok", "sc-domain:x.in", { from: "2026-08-28", to: "2026-09-24" });
    expect(rows).toEqual([{ query: "candle making workshop shahjahanpur", clicks: 3, impressions: 41, ctr: 0.0731, position: 8.4 }]);
    // Only finalised data, so numbers don't move under the owner later.
    expect(body.dataState).toBe("final");
    expect(body.dimensions).toEqual(["query"]);
    vi.unstubAllGlobals();
  });

  it("an error from Google is passed on, not swallowed into an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "User does not have sufficient permission" } }), { status: 403 })));
    await expect(fetchQueries("tok", "sc-domain:x.in", { from: "a", to: "b" })).rejects.toThrow(/sufficient permission/);
    vi.unstubAllGlobals();
  });
});
