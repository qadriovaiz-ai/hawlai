// Social Media Auto-Posting must report what reached the Page — not
// whether a cron job ran.
//
// THE LIVE CASE (2026-09-13): the Automation Health panel showed
// "Social Media Auto-Posting — 100% success (7d)". The business's real
// Facebook Page had ONE post in 28 days, and it had no caption. Three
// separate failures, each invisible:
//
//   1. runAndLog recorded "success" whenever the subsystem didn't THROW.
//      The autopilot catches every failure itself and returns
//      { posted: false }, so every failed or empty run counted as a
//      success.
//   2. The caption was `output.text ?? Object.values(output)[0]` — the
//      first value the model happened to return, cast to a string. An
//      array of hashtags, or a nested object, is truthy, so "no caption"
//      never fired and the image went out without usable text.
//   3. Auto-posting ran AFTER the slowest subsystem in a 60-second cron
//      invocation. A function killed at the limit writes nothing, so the
//      runs that never reached auto-posting left no trace at all.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let inserts: { table: string; values: Row }[];
let updates: { table: string; values: Row }[];

function db() {
  const from = (table: string) => {
    let op = "select";
    let values: Row = {};
    const filters: [string, any][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === undefined || r[k] === v));
    const api: any = {
      select: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api, not: () => api, is: () => api, in: () => api, or: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (v: Row) => ((op = "insert"), (values = v), inserts.push({ table, values: v }), api),
      update: (v: Row) => ((op = "update"), (values = v), updates.push({ table, values: v }), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: op === "select" ? rows() : [], error: null }).then(res, rej),
    };
    return api;
  };
  return {
    from,
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://cdn.example/post.png" } }) }) },
  };
}

// What the model returns for the caption, per test.
let generated: any;
// What Facebook shows on the post when asked back: a string, "" (no text), or undefined (couldn't read).
let landedText: string | undefined;

const postPhotoToPage = vi.fn(async (..._a: any[]) => ({ id: "PAGE_POST_1" }));
vi.mock("@/lib/agents/socialMediaAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/socialMediaAgent")>()),
  postPhotoToPage: (...a: any[]) => postPhotoToPage(...a),
  getConnectedInstagramAccountId: async () => null,
  readPostMessage: async () => landedText,
}));
vi.mock("@/lib/agents/contentMarketingAgent", async (orig) => ({
  ...(await orig<typeof import("@/lib/agents/contentMarketingAgent")>()),
  generateContent: async () => ({ output: generated }),
}));
vi.mock("@/lib/agents/graphicDesignAgent", () => ({ generateGraphic: async () => Buffer.from("png") }));
vi.mock("@/lib/crypto/oauthSecrets", () => ({ readMetaPageToken: () => "PAGE_TOKEN", hasMetaPageToken: () => true }));
vi.mock("@/lib/claims/businessFacts", async (orig) => ({
  ...(await orig<typeof import("@/lib/claims/businessFacts")>()),
  gatherBusinessFactsSafely: async () => ({ products: [], offers: [], unreadable: [] }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, from: (t: string) => db().from(t) }) }));

import { runContentAutopilot, captionForPost } from "@/lib/automation/contentAutopilot";
import { runAndLog } from "@/lib/automation/runAndLog";
import { GROUPS, ALL } from "@/lib/automation/cronGroups";
import { GET as autopilotSettings } from "@/app/api/autopilot/settings/route";

beforeEach(() => {
  tables = {
    profiles: [{ id: "u1", dealership_id: "d1" }],
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", fb_page_id: "PAGE1", content_autopilot_enabled: true, content_autopilot_frequency_days: 1, content_autopilot_last_posted_at: null }],
    brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: ["Hand-poured"] }],
    social_post_queue: [],
    workflows: [], auto_reply_log: [], email_automation_log: [], content_autopilot_log: [], automation_run_log: [], event_queue: [], agent_tasks: [],
  };
  inserts = [];
  updates = [];
  generated = { caption: "Slow evenings start with the Lavender candle." };
  landedText = "Slow evenings start with the Lavender candle.";
  postPhotoToPage.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const logRow = () => inserts.find((i) => i.table === "content_autopilot_log")!.values;

describe("the caption is a real string, or nothing is posted", () => {
  it("takes the caption field — never whichever value the model put first", () => {
    expect(captionForPost({ hook: "Stop scrolling.", caption: "Meet the Lavender candle." })).toBe("Meet the Lavender candle.");
  });

  it("appends hashtags that came back separately", () => {
    expect(captionForPost({ hashtags: ["#candles", "slowliving"], caption: "Meet the Lavender candle." })).toBe(
      "Meet the Lavender candle.\n\n#candles #slowliving"
    );
  });

  it("an array or a nested object is not a caption", () => {
    expect(captionForPost({ hashtags: ["#candles"] })).toBe("");
    expect(captionForPost({ post: { caption: "nested" } })).toBe("");
  });
});

describe("a run that posted nothing, or posted without words, is a failure", () => {
  it("THE LIVE CASE — hashtags only: nothing is posted, and the run says why", async () => {
    generated = { hashtags: ["#candles", "#diwali"] };
    const result = await runContentAutopilot(db(), "d1");

    expect(postPhotoToPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ posted: false });
    expect((result as any).error).toMatch(/no usable caption/);
    expect(logRow()).toMatchObject({ success: false, caption: null, post_id: null });
  });

  it("a real caption is what Facebook receives", async () => {
    generated = { hook: "Stop scrolling.", caption: "Meet the Lavender candle.", hashtags: ["#candles"] };
    landedText = "Meet the Lavender candle.\n\n#candles";
    const result = await runContentAutopilot(db(), "d1");

    expect(postPhotoToPage.mock.calls[0][3]).toBe("Meet the Lavender candle.\n\n#candles");
    expect(result).toEqual({ posted: true, postedToInstagram: false, instagramError: "No Instagram Business account connected to this Facebook Page" });
    expect(logRow().success).toBe(true);
  });

  it("Facebook showing the post with NO caption is reported — and the cadence still advances so it isn't posted twice", async () => {
    landedText = "";
    const result = await runContentAutopilot(db(), "d1");

    expect((result as any).error).toMatch(/published the image but shows no caption/);
    expect(logRow()).toMatchObject({ success: false, post_id: "PAGE_POST_1" });
    expect(updates.some((u) => u.table === "dealerships" && u.values.content_autopilot_last_posted_at)).toBe(true);
  });

  it("a read-back that simply failed is NOT reported as a missing caption", async () => {
    landedText = undefined;
    const result = await runContentAutopilot(db(), "d1");
    expect(result).toMatchObject({ posted: true });
    expect(logRow().success).toBe(true);
  });
});

describe("the run log records what actually happened", () => {
  it("a subsystem that returns { error } is logged as a failure, not a success", async () => {
    await runAndLog(db(), "d1", "content_autopilot", async () => ({ posted: false, error: "Facebook rejected it" }));
    expect(inserts[0]).toMatchObject({ table: "automation_run_log", values: { subsystem: "content_autopilot", success: false } });
  });

  it("a run that was simply not due is still a successful run", async () => {
    await runAndLog(db(), "d1", "content_autopilot", async () => ({ skipped: "not due yet" }));
    expect(inserts[0].values.success).toBe(true);
  });

  it("a failed auto-post, run through the real logger, is a failed run", async () => {
    generated = { hashtags: ["#only"] };
    await runAndLog(db(), "d1", "content_autopilot", () => runContentAutopilot(db(), "d1"));
    const run = inserts.find((i) => i.table === "automation_run_log")!;
    expect(run.values.success).toBe(false);
  });
});

describe("the health panel judges auto-posting by what was posted", () => {
  const health = async () => (await (await autopilotSettings()).json()).automationHealth.find((h: any) => h.subsystem === "content_autopilot");

  it("THE LIVE CASE — seven clean cron runs but no posts is 'no posts', not '100% success'", async () => {
    const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    tables.automation_run_log = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ subsystem: "content_autopilot", success: true, created_at: day(n) }));
    tables.content_autopilot_log = [];

    const row = await health();
    expect(row.successRatePct).toBeNull();
    expect(row.postsAttempted).toBe(0);
    expect(row.lastSuccess).toBe(false);
  });

  it("counts published posts against attempted ones, and surfaces the last error", async () => {
    tables.content_autopilot_log = [
      { success: false, error: "Facebook published the image but shows no caption on it", post_id: "P3", created_at: new Date().toISOString() },
      { success: true, error: null, post_id: "P2", created_at: new Date(Date.now() - 86400000).toISOString() },
      { success: false, error: "The generated post had no usable caption text", post_id: null, created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    ];
    const row = await health();
    expect(row).toMatchObject({ successRatePct: 33, postsAttempted: 3, postsPublished: 1, lastSuccess: false });
    expect(row.lastError).toMatch(/shows no caption/);
  });
});

describe("auto-posting runs before the slow work that can exhaust the time limit", () => {
  it("is the first thing the heavy invocation does", () => {
    expect(GROUPS.heavy[0]).toBe("content_autopilot");
  });

  it("every subsystem still runs, exactly once", () => {
    expect(new Set(ALL).size).toBe(ALL.length);
    expect(ALL).toContain("daily_autopilot");
    expect(ALL).toContain("content_autopilot");
  });
});
