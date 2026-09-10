// "lavender candle wala campaign activate karo" → the real campaign.
//
// WHY: chat answered "Koi existing Meta campaign nahi mili" about a
// campaign that existed, and offered to create a new one. Two faults:
//
//   1. The lookup selected `car_type`, which is not a column. PostgREST
//      rejected the query, and only `data` was read, so the failure
//      looked like an empty list.
//   2. Even with rows, the resolver compared the WHOLE phrase to the
//      headline, and "lavender candle wala" is not inside "Ghar ko do
//      lavender ki shanti".
//
// The mock database below rejects unknown columns the way the real one
// does. The previous tests passed because their mocks accepted anything.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const created: any[] = [];
vi.mock("@/lib/publish/create", () => ({
  createPublishAction: vi.fn(async (_db: any, _platform: any, input: any) => {
    created.push(input);
    return {
      ok: true, approvalId: "ap-1", actionId: "act-1", alreadyPending: false,
      preview: { summary: "Start it.", changes: [{ field: "Daily budget", before: null, after: "₹100.00/day" }], warnings: [] },
    };
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { switchMetaCampaign } from "@/lib/agents/masterBrainV2";
import { resolveCampaign } from "@/lib/ads/resolveCampaign";

/** The columns the migrations actually create on ad_creatives. */
function realColumns(): Set<string> {
  const dir = join(__dirname, "..", "supabase", "migrations");
  const cols = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    const create = sql.match(/create table if not exists ad_creatives\s*\(([\s\S]*?)\n\);/i);
    if (create) for (const l of create[1].split("\n")) { const m = l.trim().match(/^([a-z_]+)\s+/i); if (m) cols.add(m[1]); }
    for (const m of sql.matchAll(/alter table ad_creatives add column if not exists ([a-z_]+)/gi)) cols.add(m[1]);
  }
  return cols;
}
const COLUMNS = realColumns();

// The row as launchCampaign.ts leaves it, with the candle campaign's
// real headline and Meta ids.
const LAVENDER = {
  id: "24a8fff5-447d-4a69-924c-23b4e747c9f2", headline: "Ghar ko do lavender ki shanti",
  body_copy: "Handmade soy candles", plan_json: { car_type: "Lavender scented candle" },
  daily_budget: 100, meta_status: "PAUSED", meta_campaign_id: "120254652336640260",
  meta_adset_id: "adset-1", meta_ad_id: "ad-1", generated_image_url: "https://cdn/l.png",
};
const DIYA = { ...LAVENDER, id: "row-diya", headline: "Diwali diyas, 20% off", body_copy: "Clay diyas", plan_json: { car_type: "Clay diya set" }, meta_ad_id: "ad-2" };

function db(rows: any[], opts: { failWith?: string } = {}) {
  return {
    from: (table: string) => {
      let cols = "";
      const api: any = {
        select: (c: string) => { cols = c; return api; },
        eq: () => api, not: () => api, order: () => api,
        maybeSingle: async () => ({ data: { fb_page_access_token: "TOKEN" }, error: null }),
        then: (resolve: any) => {
          if (table !== "ad_creatives") return resolve({ data: null, error: null });
          if (opts.failWith) return resolve({ data: null, error: { code: "57014", message: opts.failWith } });
          // What PostgREST does with a column that does not exist.
          const unknown = cols.split(",").map((c) => c.trim()).find((c) => c && !COLUMNS.has(c));
          if (unknown) return resolve({ data: null, error: { code: "42703", message: `column ad_creatives.${unknown} does not exist` } });
          return resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
}

beforeEach(() => { created.length = 0; });

describe("the failing request, exactly", () => {
  it("finds the lavender campaign and raises its approval — among several campaigns", async () => {
    const r = await switchMetaCampaign("activate", { id: "d1" }, db([DIYA, LAVENDER]), { campaign_description: "lavender candle wala campaign" });
    expect(r.error).toBeUndefined();
    expect(r.activation).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].targetRef).toBe(LAVENDER.id);
    expect(created[0].actionKey).toBe("activate_ad_campaign");
  });

  it("finds it when it is the only campaign", async () => {
    const r = await switchMetaCampaign("activate", { id: "d1" }, db([LAVENDER]), { campaign_description: "lavender candle wala" });
    expect(r.approval_id).toBe("ap-1");
    expect(created[0].targetRef).toBe(LAVENDER.id);
  });
});

describe("a failed read is never reported as 'no campaigns'", () => {
  it("says it couldn't load, and does not invite a duplicate launch", async () => {
    const r = await switchMetaCampaign("activate", { id: "d1" }, db([LAVENDER], { failWith: "canceling statement due to statement timeout" }), { campaign_description: "lavender" });
    expect(r.error).toMatch(/couldn't load your campaigns/i);
    expect(r.error).toMatch(/do NOT offer to create a new campaign/);
    expect(r.error).not.toMatch(/don't have any campaigns/i);
    expect(created).toHaveLength(0);
  });

  it("a genuinely empty account still says so", async () => {
    const r = await switchMetaCampaign("activate", { id: "d1" }, db([]), { campaign_description: "lavender" });
    expect(r.error).toMatch(/don't have any campaigns on Meta yet/);
  });
});

describe("matching on words, not the whole phrase", () => {
  const L = { id: "l", headline: "Ghar ko do lavender ki shanti", car_type: null };
  const D = { id: "d", headline: "Diwali diyas, 20% off", car_type: null };

  it("matches a Hinglish request on its meaningful word", () => {
    const r = resolveCampaign([D, L], { description: "lavender candle wala campaign activate karo" });
    expect(r.status === "resolved" && r.campaign.id).toBe("l");
  });

  it("still ASKS on a tie rather than picking", () => {
    const A = { id: "a", headline: "Lavender candle", car_type: null };
    const B = { id: "b", headline: "Lavender candle gift box", car_type: null };
    expect(resolveCampaign([A, B], { description: "lavender candle" }).status).toBe("ambiguous");
  });

  it("offers everything when nothing they said matches — never 'none'", () => {
    const r = resolveCampaign([D, L], { description: "rose wala" });
    expect(r.status).toBe("ambiguous");
    expect(r.status === "ambiguous" && r.candidates).toHaveLength(2);
  });

  it("filler alone matches nothing and asks", () => {
    expect(resolveCampaign([D, L], { description: "campaign activate karo" }).status).toBe("ambiguous");
  });
});
