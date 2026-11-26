// A SEARCH READ THAT WORKED AND A WRITE THAT DID NOT IS A FAILED RUN —
// 26 November 2026.
//
// `runAndLog` decides a subsystem's success with one test:
// `"error" in result`. Everything else is a good run. `syncSearchQueries`
// returned its upsert failure under `skipped`, the same key it uses for
// "Google had no searches for this window" — so a lost write and a quiet
// window were the same row in `automation_run_log`, and Automation Health
// would have shown a clean run for a subsystem that stored nothing.
//
// THIS IS THE FAULT runAndLog ITSELF WAS WRITTEN TO STOP, arriving
// through a different door. Its own comment names the incident: "how the
// health panel showed Social Media Auto-Posting at 100% success while
// almost nothing reached Facebook".
//
// AND IT IS WHY THE RUN LOG COULD NOT ANSWER "IS THE SYNC WRITING?"
// That question was asked on 26 November and the log could not settle
// it, which is the whole reason this distinction now exists.
//
// THE SKIPS STAY SKIPS. Most businesses have not connected Search
// Console, and a window Google has no data for is not a fault. Turning
// those red would make the subsystem permanently and uninformatively
// broken — so the tests below hold BOTH directions at once.

import { describe, it, expect, vi } from "vitest";

const SITE = "sc-domain:example.com";

/**
 * A service client whose `search_queries` upsert fails and whose
 * `dealerships` row carries a live connection.
 */
function db(opts: { upsertError: string | null }) {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      order: () => api,
      limit: async () => ({ data: [], error: null }),
      update: () => api,
      insert: async () => ({ data: null, error: null }),
      maybeSingle: async () => {
        if (table === "dealerships") {
          return {
            data: {
              search_console_access_token: "live-access",
              search_console_refresh_token: "live-refresh",
              // Far in the future, so no refresh is attempted and the
              // token path is not what this file is about.
              search_console_token_expiry: new Date(Date.now() + 86_400_000).toISOString(),
              search_console_site_url: SITE,
              search_console_email: "owner@example.com",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      upsert: async () => ({ error: opts.upsertError ? { message: opts.upsertError } : null }),
    };
    return api;
  };
  return { from };
}

vi.mock("@/lib/seo/searchConsole", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // A domain property, so no page filter is needed and the privacy
    // branch is not what is under test here.
    isPlatformProperty: () => false,
    validAccessToken: async () => ({ accessToken: "live-access" }),
    fetchQueries: async () => [
      { query: "soy candle", clicks: 2, impressions: 40, ctr: 0.05, position: 8.1 },
    ],
  };
});

import { syncSearchQueries } from "@/lib/seo/searchQueries";

describe("1. A LOST WRITE IS AN ERROR, so runAndLog records a failure", () => {
  it("THE UPSERT FAILURE COMES BACK UNDER `error`, not `skipped`", async () => {
    const r: any = await syncSearchQueries(db({ upsertError: "permission denied for table search_queries" }), "d1");

    expect(r.error).toContain("couldn't store the searches");
    expect(r.error).toContain("permission denied");
    expect(r.stored).toBe(0);
    // The key runAndLog actually tests. Under `skipped` this run would
    // have been logged as a success.
    expect("error" in r).toBe(true);
  });

  it("AND runAndLog'S OWN RULE SEES IT — `\"error\" in result` is the whole test", async () => {
    const r: any = await syncSearchQueries(db({ upsertError: "deadlock detected" }), "d1");
    const reportedError = r && typeof r === "object" && "error" in r && r.error;
    expect(Boolean(reportedError)).toBe(true);
  });
});

describe("2. AND A GOOD RUN IS STILL A GOOD RUN", () => {
  it("a successful store reports no error at all", async () => {
    const r: any = await syncSearchQueries(db({ upsertError: null }), "d1");
    expect(r.error).toBeUndefined();
    expect(r.stored).toBe(1);
  });
});

describe("3. the skips that are not faults stay skips", () => {
  // Turning these red would leave the subsystem permanently broken for
  // every business that has not connected Search Console, which is all
  // of them.
  it("NOT CONNECTED IS NOT A FAILURE", async () => {
    const bare = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }) }) }) };
    const r: any = await syncSearchQueries(bare, "d1");
    expect(r.skipped).toContain("isn't connected");
    expect(r.error).toBeUndefined();
  });
});
