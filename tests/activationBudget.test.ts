// The activation card must show the budget Meta will actually spend.
//
// WHY: the card for "Ghar ko do lavender ki shanti" said "Daily budget:
// ₹0.00/day". The campaign was launched at ₹100/day (launch.done logged
// budget_paise=10000). The card read ad_creatives.daily_budget, which
// is NULL on every production row, and NULL → 0 → "₹0.00" rendered as
// a perfectly plausible amount on a card asking someone to approve
// spend. Same failure shape this project keeps meeting: the call
// succeeds, the value is wrong, nothing looks broken.
//
// Every test here keeps the local column NULL, exactly as production
// has it.

import { describe, it, expect, vi, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

import { describeBudget } from "@/lib/ads/campaignBudget";

afterEach(() => vi.unstubAllGlobals());

const CONN = { fb_page_access_token: "TOKEN", fb_page_access_token_encrypted: null, fb_account_status: 1, fb_currency: "INR", fb_ad_account_id: "act_1", fb_page_id: "p1" };
const AD = {
  id: "24a8fff5-447d-4a69-924c-23b4e747c9f2", status: "launched", headline: "Ghar ko do lavender ki shanti",
  daily_budget: null, // as in production
  meta_status: "PAUSED", meta_campaign_id: "C", meta_adset_id: "S", meta_ad_id: "A", generated_image_url: null,
};
const action = (preview: any = null) => ({
  id: "act-1", dealershipId: "d1", platform: "meta" as const, connectionRef: null, actionKey: "activate_ad_campaign" as const,
  targetRef: AD.id, targetLabel: AD.headline, requestedChanges: { status: "ACTIVE" }, preview, previewedAt: null,
  status: "approved" as const, idempotencyKey: "k",
});

function db(updates: any[] = []) {
  return {
    from: (t: string) => {
      const api: any = {
        select: () => api, eq: () => api,
        update: (f: any) => { updates.push(f); return api; },
        maybeSingle: async () => ({ data: t === "dealerships" ? CONN : AD }),
        then: (r: any) => r({ data: null, error: null }),
      };
      return api;
    },
  };
}

type Budgets = Record<string, { daily_budget?: string; lifetime_budget?: string } | "error">;

/** A fake Graph API. Budgets per node id, in paise as strings — as Meta sends them. */
function meta(budgets: Budgets, effective = "CAMPAIGN_PAUSED") {
  const posts: { node: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const node = String(url).split("/v23.0/")[1].split("?")[0];
    if (init?.method === "POST") {
      posts.push({ node, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    if (String(url).includes("fields=daily_budget")) {
      const b = budgets[node];
      if (b === "error") return { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported get request" } }) };
      return { ok: true, status: 200, json: async () => ({ id: node, ...(b ?? {}) }) };
    }
    return { ok: true, status: 200, json: async () => ({ effective_status: effective }) };
  }));
  return posts;
}

async function platform(updates: any[] = []) {
  const { createMetaPlatform } = await import("@/lib/publish/platforms/meta");
  return createMetaPlatform({ supabase: db(updates) as any });
}

function cardText(r: any): string {
  if (!r.ok) return "";
  const p = r.preview;
  return [p.summary, ...p.changes.map((c: any) => `${c.field}: ${c.before ?? ""} ${c.after}`), ...p.warnings].join(" | ");
}

/** A zero amount in any form: ₹0, ₹0.00, ₹ 0.00. */
const ZERO = /₹\s?0(?:\.0+)?(?![\d,.])/;

describe("the card shows Meta's budget, never the NULL column", () => {
  it("₹100/day on the ad set is shown as ₹100/day — the reported case", async () => {
    meta({ S: { daily_budget: "10000" } });
    const r = await (await platform()).preview(action());
    expect(r.ok).toBe(true);
    const budget = r.ok && r.preview.changes.find((c) => c.field === "Daily budget");
    expect(budget && budget.after).toBe(describeBudget({ kind: "daily", minor: 10000, level: "adset" }, "INR"));
    expect(budget && budget.after).toMatch(/100\.00\/day$/);
    expect(cardText(r)).not.toMatch(ZERO);
  });

  it("reads the campaign when the budget lives there (budget optimisation on)", async () => {
    meta({ S: { daily_budget: "0" }, C: { daily_budget: "20000" } });
    const r = await (await platform()).preview(action());
    expect(cardText(r)).toMatch(/200\.00\/day/);
    expect(cardText(r)).not.toMatch(ZERO);
  });

  it("a lifetime budget is labelled as a total, not per day", async () => {
    meta({ S: { lifetime_budget: "300000" } });
    const r = await (await platform()).preview(action());
    const text = cardText(r);
    expect(text).toMatch(/Lifetime budget: .*3,000\.00 total/);
    expect(text).not.toMatch(/\/day/);
  });

  it("stays correct across budgets, and never renders zero", async () => {
    for (const rupees of [1, 100, 250, 99999]) {
      meta({ S: { daily_budget: String(rupees * 100) } });
      const text = cardText(await (await platform()).preview(action()));
      expect(text, `₹${rupees}`).toContain(`/day`);
      expect(text, `₹${rupees}`).not.toMatch(ZERO);
    }
  });
});

describe("no budget from Meta → no card, never a made-up amount", () => {
  it("refuses when the ad set can't be read — and does not report the campaign's instead", async () => {
    meta({ S: "error", C: { daily_budget: "20000" } });
    const r = await (await platform()).preview(action());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/couldn't confirm the budget/i);
  });

  it("refuses when neither level has a budget", async () => {
    meta({ S: {}, C: { daily_budget: "0" } });
    const r = await (await platform()).preview(action());
    expect(r.ok).toBe(false);
  });
});

describe("approving flips status only — it never writes a budget", () => {
  it("every call to Meta carries status and the token, nothing else", async () => {
    // The question to answer before anyone approved a ₹0.00 card: does
    // it write ₹0 to Meta? It must not, and this pins that it cannot.
    const posts = meta({ S: { daily_budget: "10000" } }, "ACTIVE");
    const r = await (await platform()).execute(action());
    expect(r.ok).toBe(true);
    expect(posts.map((p) => p.node)).toEqual(["C", "S", "A"]);
    for (const p of posts) {
      expect(Object.keys(p.body).sort(), p.node).toEqual(["access_token", "status"]);
      expect(p.body.status).toBe("ACTIVE");
    }
  });

  it("the local write is meta_status only — no budget, no column production lacks", async () => {
    meta({ S: { daily_budget: "10000" } }, "ACTIVE");
    const updates: any[] = [];
    await (await platform(updates)).execute(action());
    expect(updates).toEqual([{ meta_status: "ACTIVE" }]);
  });
});

describe("what they approved is what runs", () => {
  const shownAt100 = { summary: "", target: {}, changes: [{ field: "Daily budget", before: null, after: describeBudget({ kind: "daily", minor: 10000, level: "adset" }, "INR") }], warnings: [] };

  it("budget changed in Ads Manager after the card → stale, nothing flipped", async () => {
    const posts = meta({ S: { daily_budget: "500000" } }, "ACTIVE");
    const r: any = await (await platform()).execute(action(shownAt100));
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.changed[0].after).toMatch(/5,000\.00\/day/);
    expect(posts).toEqual([]);
  });

  it("budget unchanged → it runs", async () => {
    meta({ S: { daily_budget: "10000" } }, "ACTIVE");
    const r = await (await platform()).execute(action(shownAt100));
    expect(r.ok).toBe(true);
  });

  it("budget unreadable at the click → nothing starts", async () => {
    const posts = meta({ S: "error" }, "ACTIVE");
    const r = await (await platform()).execute(action(shownAt100));
    expect(r.ok).toBe(false);
    expect(posts).toEqual([]);
  });
});
