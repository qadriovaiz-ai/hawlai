// The activation card, end to end, against a database that does not
// cooperate and a Meta that answers the way Meta answers.
//
// WHY: "₹0.00/day" was shown on a card for a ₹100/day campaign — twice,
// the second time after the first was rejected and a "fresh" request
// made. Every earlier test passed because each one mocked the layer
// that was wrong: a fake createPublishAction, a fake DB that returned
// whatever was asked for, a fetch that returned one object for every
// call. The bug lived in the handoffs between real pieces:
//
//   - rejecting an approval never ended its publish action, so
//   - the next identical request found an undecided-looking row, and
//   - create.ts re-served its STORED preview, drawn by pre-fix code.
//
// So nothing here is mocked except the two edges we genuinely cannot
// run: the database (an in-memory one that really filters, and refuses
// the columns production lacks) and Meta's HTTP API (answering with
// Graph's real response shapes, errors included). Everything between
// runs for real: the chat tool, campaign resolution, createPublishAction,
// the Meta platform preview, the budget read, the approve route, and
// the card as it is rendered.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

// ---------------------------------------------------------------------
// An in-memory Supabase that behaves like one.
// ---------------------------------------------------------------------

type Row = Record<string, any>;

/** ad_creatives exactly as production has it after migration 140 (information_schema, 2026-09-10). */
const PROD_AD_CREATIVES = new Set([
  "id", "dealership_id", "mode", "prompt", "background_style", "headline", "body_copy", "generated_image_url",
  "status", "meta_ad_id", "error_message", "created_at", "meta_campaign_id", "meta_adset_id", "daily_budget",
  "targeting_city", "meta_status", "scheduled_start", "creative_score", "score_reasoning", "plan_json",
  "variant_group_id", "variant_label", "targeting_json",
  "platform", "external_campaign_id", "external_adset_id", "external_ad_id", "external_status", "ad_format", "keywords",
]);

class Store {
  tables: Record<string, Row[]> = {};
  private seq = 0;
  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  nextId(table: string) {
    this.seq += 1;
    return `${table}-${this.seq}`;
  }
  tick() {
    return new Date(Date.UTC(2026, 8, 10, 12, 0, this.seq)).toISOString();
  }
  from(table: string) {
    return new Query(this, table);
  }
}

class Query {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private badColumn: string | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;

  constructor(private store: Store, private table: string) {}

  private check(cols: string[]) {
    if (this.table !== "ad_creatives") return;
    for (const c of cols) {
      const name = c.trim().split(":").pop()!.split("->")[0].trim();
      if (name && name !== "*" && !PROD_AD_CREATIVES.has(name)) this.badColumn = name;
    }
  }

  select(cols = "*") { this.check(cols.split(",")); return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; this.check(Object.keys(row)); return this; }
  update(fields: Row) { this.op = "update"; this.payload = fields; this.check(Object.keys(fields)); return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not(c: string, op: string, v: any) {
    if (op === "is" && v === null) this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    return this;
  }
  like(c: string, pattern: string) {
    const re = new RegExp("^" + pattern.split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
    this.filters.push((r) => typeof r[c] === "string" && re.test(r[c]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit() { return this; }

  private run(): { data: Row[] | null; error: any } {
    if (this.badColumn) {
      return { data: null, error: { code: "42703", message: `column ${this.table}.${this.badColumn} does not exist` } };
    }
    const rows = this.store.rows(this.table);
    if (this.op === "insert") {
      const defaults: Row = this.table === "pending_approvals" ? { status: "pending" } : {};
      const row = { id: this.store.nextId(this.table), created_at: this.store.tick(), ...defaults, ...this.payload };
      rows.push(row);
      return { data: [{ ...row }], error: null };
    }
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of matched) Object.assign(r, this.payload);
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    let out = matched.map((r) => ({ ...r }));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = out.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (asc ? 1 : -1));
    }
    return { data: out, error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    if (data!.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows returned" } };
    return { data: data![0] ?? null, error: null };
  }
  async single() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    if (data!.length !== 1) return { data: null, error: { code: "PGRST116", message: `expected 1 row, got ${data!.length}` } };
    return { data: data![0], error: null };
  }
  then(resolve: (v: any) => any, reject?: (e: any) => any) {
    try { return Promise.resolve(this.run()).then(resolve, reject); } catch (e) { return reject ? reject(e) : Promise.reject(e); }
  }
}

let store: Store;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => (globalThis as any).__store }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1" } } }) },
    from: (t: string) => (globalThis as any).__store.from(t),
  }),
}));

import { switchMetaCampaign, extractArtifact } from "@/lib/agents/masterBrainV2";
import { intentKey } from "@/lib/publish/create";
import { PATCH } from "@/app/api/approvals/[id]/route";

// ---------------------------------------------------------------------
// Meta's Graph API, with its real response shapes.
// ---------------------------------------------------------------------

const CAMPAIGN = "120254652336640260";
const ADSET = "120254652336770260";
const AD = "120254652337290260";

/** What Graph returns for an expired page token — a 400 with an OAuthException. */
const EXPIRED_TOKEN = {
  error: {
    message: "Error validating access token: Session has expired on Thursday, 10-Sep-26 03:00:00 PDT.",
    type: "OAuthException",
    code: 190,
    error_subcode: 463,
    fbtrace_id: "AkQ1b2c3d4e5f",
  },
};

/** Graph's transient error: "retry your request later", flagged is_transient. */
const TRANSIENT_ERROR = {
  error: {
    message: "An unexpected error has occurred. Please retry your request later.",
    type: "OAuthException",
    is_transient: true,
    code: 2,
    fbtrace_id: "A7xYzTransient",
  },
};

type Node = Row | "expired";

/**
 * Each level of a launched, never-started campaign, as Graph reports it
 * when asked for effective_status,status (and, for the ad, its parents).
 */
const PAUSED_ON_META: Record<"campaign" | "adset" | "ad", Node> = {
  campaign: { status: "PAUSED", effective_status: "PAUSED" },
  adset: { status: "PAUSED", effective_status: "CAMPAIGN_PAUSED" },
  ad: { status: "PAUSED", effective_status: "CAMPAIGN_PAUSED", campaign_id: CAMPAIGN, adset_id: ADSET },
};

function graph(opts: {
  adset?: Node;
  campaign?: Node;
  state?: Partial<typeof PAUSED_ON_META>;
  /** The first N status reads fail with Graph's transient error. */
  flakyReads?: number;
  /** Every status read after a write fails transiently: the write is accepted, the read-back never lands. */
  readsFailAfterPost?: boolean;
}) {
  const calls: string[] = [];
  let posted = false;
  let flaky = opts.flakyReads ?? 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    const u = new URL(url);
    const node = u.pathname.split("/").pop()!;
    const fields = u.searchParams.get("fields") ?? "";
    const method = init?.method ?? "GET";
    calls.push(`${method} ${node}${fields ? ` ${fields}` : ""}`);
    const reply = (status: number, body: Row) => ({ ok: status < 400, status, json: async () => body });

    if (method === "POST") { posted = true; return reply(200, { success: true }); }
    if (fields.includes("effective_status") && (flaky-- > 0 || (opts.readsFailAfterPost && posted))) {
      return reply(500, TRANSIENT_ERROR);
    }
    if (fields.includes("effective_status")) {
      const state = { ...PAUSED_ON_META, ...(opts.state ?? {}) };
      const level = node === CAMPAIGN ? state.campaign : node === ADSET ? state.adset : node === AD ? state.ad : undefined;
      if (level === undefined) {
        return reply(400, { error: { message: "Unsupported get request. Object does not exist.", type: "GraphMethodException", code: 100 } });
      }
      if (level === "expired") return reply(400, EXPIRED_TOKEN);
      return reply(200, { id: node, ...level });
    }
    if (fields.includes("daily_budget")) {
      const src = node === ADSET ? opts.adset : node === CAMPAIGN ? opts.campaign : undefined;
      if (src === "expired") return reply(400, EXPIRED_TOKEN);
      return reply(200, { id: node, ...(src ?? {}) });
    }
    return reply(400, { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 } });
  }));
  return calls;
}

// Ad set budget as Graph returns it when the budget lives on the ad set:
// minor units, as STRINGS, with the unused one reported as "0".
const ADSET_100_A_DAY = { daily_budget: "10000", lifetime_budget: "0" };

// ---------------------------------------------------------------------
// Production-shaped rows.
// ---------------------------------------------------------------------

const DEALERSHIP = "d-candle-by-qaaf";
const ROW_ID = "24a8fff5-447d-4a69-924c-23b4e747c9f2";
const HEADLINE = "Ghar ko do lavender ki shanti";

function seed(opts: { localBudget?: number | null } = {}) {
  store = new Store();
  (globalThis as any).__store = store;
  store.rows("dealerships").push({
    id: DEALERSHIP, owner_id: "owner-1", approval_threshold: 50000, business_category: "candles",
    fb_page_access_token: "PAGE_TOKEN", fb_page_access_token_encrypted: null, fb_page_id: "page-1",
    fb_ad_account_id: "act_1", fb_account_status: 1, fb_currency: "INR", fb_min_daily_budget: 9491,
  });
  store.rows("ad_creatives").push({
    id: ROW_ID, dealership_id: DEALERSHIP, mode: "ai_generate", headline: HEADLINE, body_copy: "Hand-poured soy candles",
    generated_image_url: "https://cdn/lavender.png", status: "launched", created_at: "2026-09-09T10:00:00Z",
    meta_campaign_id: CAMPAIGN, meta_adset_id: ADSET, meta_ad_id: AD, meta_status: "PAUSED",
    daily_budget: opts.localBudget === undefined ? 100 : opts.localBudget,
    plan_json: { car_type: "Lavender candle", daily_budget: 100 },
    platform: "meta", external_campaign_id: CAMPAIGN, external_adset_id: ADSET, external_ad_id: AD, external_status: "PAUSED",
  });
}

const ACTIVATE_INPUT = {
  dealershipId: DEALERSHIP, platform: "meta" as const, actionKey: "activate_ad_campaign" as const,
  targetRef: ROW_ID, targetLabel: HEADLINE, requestedChanges: { status: "ACTIVE" }, requestedBy: null,
};

/** The action a pre-fix request left behind: its preview read the NULL local column. */
function seedPreFixCard(approvalStatus: "pending" | "rejected") {
  store.rows("pending_approvals").push({
    id: "ap-old", dealership_id: DEALERSHIP, requested_by_agent: "publish", action_type: "activate_ad_campaign",
    action_details: { publish_action_id: "pa-old" }, amount: null, status: approvalStatus, created_at: "2026-09-10T08:00:00Z",
  });
  store.rows("publish_actions").push({
    id: "pa-old", dealership_id: DEALERSHIP, platform: "meta", action_key: "activate_ad_campaign",
    target_ref: ROW_ID, target_label: HEADLINE, requested_changes: { status: "ACTIVE" },
    idempotency_key: intentKey(ACTIVATE_INPUT), status: "awaiting_approval", approval_id: "ap-old",
    created_at: "2026-09-10T08:00:00Z",
    preview: {
      summary: `Start "${HEADLINE}" at ₹0.00/day — this begins real spend.`,
      target: { title: HEADLINE },
      changes: [
        { field: "Status on Meta", before: "CAMPAIGN_PAUSED", after: "ACTIVE" },
        { field: "Daily budget", before: null, after: "₹0.00/day" },
      ],
      warnings: ["Money starts moving as soon as you approve — up to ₹0.00 a day until you pause it."],
    },
  });
}

// ---------------------------------------------------------------------
// The real path, and the card as the person sees it.
// ---------------------------------------------------------------------

async function askToActivate() {
  const result = await switchMetaCampaign("activate", { id: DEALERSHIP }, store, { campaign_description: "lavender candle wala campaign" });
  const card = result.error ? null : extractArtifact("activate_meta_campaign", {}, result);
  return { result, card };
}

const budgetOn = (card: any) => card?.fields?.find((f: any) => f.label === "Budget")?.value ?? null;

/** A zero amount in any form: ₹0, ₹0.00, ₹ 0.00. */
const ZERO = /₹\s?0(?:\.0+)?(?![\d,.])/;

const pending = () => store.rows("pending_approvals").filter((a) => a.status === "pending");

beforeEach(() => seed());
afterEach(() => vi.unstubAllGlobals());

describe("a fresh request shows the budget Meta will actually spend", () => {
  it("₹100/day on the ad set → the card says ₹100.00/day", async () => {
    const calls = graph({ adset: ADSET_100_A_DAY, campaign: {} });
    const { card } = await askToActivate();

    expect(budgetOn(card)).toBe("₹100.00/day");
    expect(JSON.stringify(card)).not.toMatch(ZERO);
    expect(card!.approval?.id).toBeTruthy();
    // It really asked Meta for the ad set's budget.
    expect(calls).toContain(`GET ${ADSET} daily_budget,lifetime_budget`);
    // And what the approver reads in the queue matches the card.
    const approval = pending()[0];
    expect(JSON.stringify(approval.action_details.changes)).toContain("₹100.00/day");
  });

  it("the amount comes from Meta, not the local column", async () => {
    // The column says 100; Meta says 250. Only Meta decides what is spent.
    seed({ localBudget: 100 });
    graph({ adset: { daily_budget: "25000", lifetime_budget: "0" }, campaign: {} });
    const { card } = await askToActivate();
    expect(budgetOn(card)).toBe("₹250.00/day");
  });

  it("still right when the local column is NULL, as it was on every production row", async () => {
    seed({ localBudget: null });
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    const { card } = await askToActivate();
    expect(budgetOn(card)).toBe("₹100.00/day");
  });

  it("campaign budget optimisation: the ad set has none, the campaign has it", async () => {
    // Under CBO Graph reports no daily_budget on the ad set at all.
    graph({ adset: { lifetime_budget: "0" }, campaign: { daily_budget: "20000", lifetime_budget: "0" } });
    const { card } = await askToActivate();
    expect(budgetOn(card)).toBe("₹200.00/day");
  });
});

describe("when Meta can't be read, there is no card", () => {
  it("an expired token → an explanation, no card, no approval raised", async () => {
    graph({ adset: "expired", campaign: { daily_budget: "20000" } });
    const { result, card } = await askToActivate();

    expect(card).toBeNull();
    expect(result.error).toMatch(/couldn't confirm the budget/i);
    expect(store.rows("pending_approvals")).toEqual([]);
    // The attempt stays visible rather than vanishing.
    expect(store.rows("publish_actions").map((a) => a.status)).toEqual(["failed"]);
  });
});

describe("the reported bug: an old ₹0.00 card must never come back", () => {
  it("rejected through the real approve route, then asked again → a fresh ₹100.00 card", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    seedPreFixCard("pending");

    const res = await PATCH(
      new Request("https://hawlai.online/api/approvals/ap-old", { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }),
      { params: Promise.resolve({ id: "ap-old" }) }
    );
    expect(res.status).toBe(200);
    // The rejection reached the publish action.
    expect(store.rows("publish_actions").find((a) => a.id === "pa-old")!.status).toBe("rejected");

    const { result, card } = await askToActivate();
    expect(result.already_pending).toBe(false);
    expect(budgetOn(card)).toBe("₹100.00/day");
    expect(card!.approval!.id).not.toBe("ap-old");
    expect(pending()).toHaveLength(1);
  });

  it("production's leftover state — approval rejected, action still 'awaiting' — is closed, not re-served", async () => {
    // What production holds right now: rejections before this fix never
    // reached publish_actions.
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    seedPreFixCard("rejected");

    const { card } = await askToActivate();
    expect(budgetOn(card)).toBe("₹100.00/day");
    expect(card!.approval!.id).not.toBe("ap-old");
    expect(store.rows("publish_actions").find((a) => a.id === "pa-old")!.status).toBe("rejected");
  });

  it("an undecided pre-fix card is replaced, and its approval retired", async () => {
    // The FIRST card in the report: still pending, drawn by pre-fix code.
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    seedPreFixCard("pending");

    const { result, card } = await askToActivate();
    expect(result.already_pending).toBe(false);
    expect(budgetOn(card)).toBe("₹100.00/day");
    expect(store.rows("publish_actions").find((a) => a.id === "pa-old")!.status).toBe("stale");
    const old = store.rows("pending_approvals").find((a) => a.id === "ap-old")!;
    expect(old.status).toBe("rejected");
    expect(old.rejection_reason).toMatch(/superseded/i);
    // One decision in the queue, not two.
    expect(pending()).toHaveLength(1);
  });
});

describe("asking twice is still one decision", () => {
  it("nothing changed → the same card, the same approval, no second row", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    const first = await askToActivate();
    const second = await askToActivate();

    expect(second.result.already_pending).toBe(true);
    expect(second.card!.approval!.id).toBe(first.card!.approval!.id);
    expect(budgetOn(second.card)).toBe("₹100.00/day");
    expect(pending()).toHaveLength(1);
  });

  it("…including after an earlier request was rejected (the salted-key case)", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    seedPreFixCard("rejected");
    const first = await askToActivate();
    const second = await askToActivate();

    expect(second.result.already_pending).toBe(true);
    expect(second.card!.approval!.id).toBe(first.card!.approval!.id);
    expect(pending()).toHaveLength(1);
  });

  it("budget changed in Ads Manager while the card waited → the card is redrawn", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    const first = await askToActivate();
    graph({ adset: { daily_budget: "50000", lifetime_budget: "0" }, campaign: {} });
    const second = await askToActivate();

    expect(budgetOn(second.card)).toBe("₹500.00/day");
    expect(second.card!.approval!.id).not.toBe(first.card!.approval!.id);
    expect(pending()).toHaveLength(1);
  });
});

describe("a rejection never rewrites what already happened", () => {
  it("rejecting an approval whose action already ran leaves it 'executed'", async () => {
    // The approve route has no already-decided guard, and the inline
    // card's state is local to the component, so a page reload can offer
    // Reject on a card that already went through. The record must still
    // say it went through: the campaign IS running on Meta.
    seedPreFixCard("pending");
    const action = store.rows("publish_actions").find((a) => a.id === "pa-old")!;
    action.status = "executed";
    store.rows("pending_approvals").find((a) => a.id === "ap-old")!.status = "approved";

    const res = await PATCH(
      new Request("https://hawlai.online/api/approvals/ap-old", { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }),
      { params: Promise.resolve({ id: "ap-old" }) }
    );
    expect(res.status).toBe(200);
    expect(action.status).toBe("executed");
  });
});

describe("'already running' is said only when Meta says every level is delivering", () => {
  // THE REPORTED CASE. After adding funds, "lavender candle wala campaign
  // activate karo" got "pehle se live chal raha hai Meta pe" — while
  // Ads Manager, freshly refreshed, showed the campaign Off with ₹0.00
  // spent. The check read the ad alone.

  it("an earlier failed attempt left the ad on under a paused campaign → it offers to start, never 'already live'", async () => {
    // The old dashboard button switched the ad alone and wrote
    // meta_status ACTIVE locally — so the local column AND the ad's own
    // status both say ACTIVE, while the campaign is off.
    store.rows("ad_creatives")[0].meta_status = "ACTIVE";
    graph({
      adset: ADSET_100_A_DAY, campaign: {},
      state: { ad: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED", campaign_id: CAMPAIGN, adset_id: ADSET } },
    });
    const { result, card } = await askToActivate();

    expect(result.error).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/already running/i);
    expect(card!.approval?.id).toBeTruthy();
    expect(card!.fields!.find((f: any) => f.label === "Right now")!.value).toBe("paused");
  });

  it("the ad on file runs under a DIFFERENT campaign → refuses; never 'already live', no card", async () => {
    // A hand-repaired row beside duplicate campaigns from failed launches.
    graph({
      adset: ADSET_100_A_DAY, campaign: {},
      state: { ad: { status: "ACTIVE", effective_status: "ACTIVE", campaign_id: "120254999999999999", adset_id: "120254999999999998" } },
    });
    const { result, card } = await askToActivate();

    expect(card).toBeNull();
    expect(result.error).toMatch(/different campaign/i);
    expect(result.error).not.toMatch(/already running/i);
    expect(store.rows("pending_approvals")).toEqual([]);
  });

  it("campaign on, ad set off → not running; it offers to start", async () => {
    graph({
      adset: ADSET_100_A_DAY, campaign: {},
      state: {
        campaign: { status: "ACTIVE", effective_status: "ACTIVE" },
        adset: { status: "PAUSED", effective_status: "PAUSED" },
        ad: { status: "ACTIVE", effective_status: "ADSET_PAUSED", campaign_id: CAMPAIGN, adset_id: ADSET },
      },
    });
    const { card } = await askToActivate();
    expect(card!.approval?.id).toBeTruthy();
  });

  it("all three genuinely ACTIVE → it says so, and raises nothing", async () => {
    graph({
      adset: ADSET_100_A_DAY, campaign: {},
      state: {
        campaign: { status: "ACTIVE", effective_status: "ACTIVE" },
        adset: { status: "ACTIVE", effective_status: "ACTIVE" },
        ad: { status: "ACTIVE", effective_status: "ACTIVE", campaign_id: CAMPAIGN, adset_id: ADSET },
      },
    });
    const { result, card } = await askToActivate();
    expect(card).toBeNull();
    expect(result.error).toMatch(/already running/i);
    expect(store.rows("pending_approvals")).toEqual([]);
  });

  it("status unreadable → says so; neither claims live nor raises a card", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {}, state: { campaign: "expired" } });
    const { result, card } = await askToActivate();
    expect(card).toBeNull();
    expect(result.error).toMatch(/couldn't read this campaign's status/i);
    expect(result.error).not.toMatch(/already running/i);
  });

  it("the ad alone reporting ACTIVE is not 'already running' — the campaign above it decides too", async () => {
    // The exact old check: it read the ad and nothing else. Pinned with
    // matching ids, so only the "every level" rule can make this pass.
    graph({
      adset: ADSET_100_A_DAY, campaign: {},
      state: {
        campaign: { status: "PAUSED", effective_status: "PAUSED" },
        adset: { status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" },
        ad: { status: "ACTIVE", effective_status: "ACTIVE", campaign_id: CAMPAIGN, adset_id: ADSET },
      },
    });
    const { result, card } = await askToActivate();
    expect(JSON.stringify(result)).not.toMatch(/already running/i);
    expect(card!.approval?.id).toBeTruthy();
    expect(card!.fields!.find((f: any) => f.label === "Right now")!.value).toBe("paused");
  });

  it("the picker labels the local status as last recorded, not live", async () => {
    // Two campaigns, no clear match: the model gets a list. Its status
    // is the local column, and must not read as "is running".
    store.rows("ad_creatives").push({ ...store.rows("ad_creatives")[0], id: "row-2", headline: "Diwali diyas", plan_json: { car_type: "Diya set" }, meta_status: "ACTIVE" });
    graph({ adset: ADSET_100_A_DAY, campaign: {} });
    const result = await switchMetaCampaign("activate", { id: DEALERSHIP }, store, { campaign_description: "campaign activate karo" });
    expect(result.needs_clarification).toBe(true);
    expect(result.candidates![0]).toHaveProperty("last_recorded_status");
    expect(result.candidates![0]).not.toHaveProperty("status");
    const card = extractArtifact("activate_meta_campaign", {}, result)!;
    expect(card.groups![0].items.map((i: any) => i.note).join(" ")).toMatch(/last recorded/);
  });
});

describe("one transient Meta error is retried, not reported", () => {
  // THE REPORTED CASES. "Meta abhi status confirm nahi kar pa raha" about
  // a campaign that was running, and "Meta ne pause confirm nahi kiya"
  // about a pause that had worked. Meta was right both times; our single
  // read attempt was not.

  it("status check: the first read fails transiently → retried, and the card appears", async () => {
    const calls = graph({ adset: ADSET_100_A_DAY, campaign: {}, flakyReads: 1 });
    const { result, card } = await askToActivate();

    expect(result.error).toBeUndefined();
    expect(card!.approval?.id).toBeTruthy();
    expect(calls.filter((c) => c.startsWith(`GET ${AD} `)).length).toBeGreaterThanOrEqual(2);
  });

  it("pause: the read-back fails once → retried, and it reports paused AND confirmed", async () => {
    graph({ adset: ADSET_100_A_DAY, campaign: {}, flakyReads: 1 });
    const result = await switchMetaCampaign("pause", { id: DEALERSHIP }, store, { campaign_description: "lavender" });

    expect(result.error).toBeUndefined();
    expect(result.paused).toBe(true);
    expect(result.confirmed).toBe(true);
    const card = extractArtifact("pause_meta_campaign", {}, result)!;
    expect(card.label).toBe("Campaign paused");
  });

  it("pause: Meta accepts it but no read-back ever lands → 'sent, not yet confirmed', never 'failed'", async () => {
    const calls = graph({ adset: ADSET_100_A_DAY, campaign: {}, readsFailAfterPost: true });
    const result = await switchMetaCampaign("pause", { id: DEALERSHIP }, store, { campaign_description: "lavender" });

    expect(result.error).toBeUndefined();
    expect(result.paused).toBe(true);
    expect(result.confirmed).toBe(false);
    expect(result.note).toMatch(/accepted the pause/i);
    expect(result.note).not.toMatch(/network|didn't work|failed/i);
    // The three pause writes really went out.
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(3);
    const card = extractArtifact("pause_meta_campaign", {}, result)!;
    expect(card.label).toMatch(/not yet confirmed/i);
    expect(card.fields!.find((f: any) => f.label === "Meta confirms")!.value).toMatch(/check Ads Manager/i);
  });

  it("a permanent error (expired token) is NOT retried", async () => {
    const calls = graph({ adset: ADSET_100_A_DAY, campaign: {}, state: { ad: "expired" } });
    await askToActivate();
    expect(calls.filter((c) => c.startsWith(`GET ${AD} `))).toHaveLength(1);
  });
});
