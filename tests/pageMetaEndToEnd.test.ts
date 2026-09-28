// The whole propose_page_meta path, against the database's OWN constraints.
//
// THE BUG THIS EXISTS FOR (live 2026-09-29): the flow failed on its very
// first write, twice, and the owner saw a raw constraint error in chat.
// publish_actions.platform carries a CHECK listing the platforms allowed
// to use the table. Migration 179 widened it to add 'hawlai_shop'; the
// new website platform shipped with no migration at all, so every
// propose_page_meta insert violated publish_actions_platform_check.
//
// Every test that covered this feature passed. pageMetaTool mocks
// createPublishAction away, and pageMetaPublish drives the platform
// module against a fake with no constraints — so between them, the one
// statement that actually failed was never executed by anything.
//
// So the fake below enforces the constraints PARSED OUT OF THE MIGRATION
// FILES. A value the database would reject is rejected here, with the
// same shape of error Postgres returns, and the whole path runs through
// the real create → release → execute → read-back code.

import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "fs";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

// ---- the schema, read from the migrations ---------------------------

/** Every migration, oldest first — later ones redefine what earlier ones set. */
function migrationSql(): string[] {
  return readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
}

/**
 * The SQL statements that touch publish_actions, oldest first.
 *
 * Split into statements rather than read as whole files, because the
 * table name has to be in the SAME statement as the CHECK for the read
 * to mean anything: other tables have a `platform` column (ad_creatives,
 * migration 140) and a `status text not null default 'draft'` one
 * (invoices), and picking theirs up made this fake reject a transition
 * the real database allows.
 */
function publishActionStatements(): string[] {
  return migrationSql()
    .flatMap((sql) => sql.replace(/--.*$/gm, "").split(";"))
    .filter((statement) => statement.toLowerCase().includes("publish_actions"));
}

/** The values publish_actions.platform currently allows, as the database has them. */
export function allowedPlatforms(): string[] {
  let allowed: string[] = [];
  for (const statement of publishActionStatements()) {
    // Both spellings: the inline CHECK 170 created the column with, and
    // the named constraint every widening since has re-added. The last
    // one in migration order is what the database has now.
    for (const match of statement.matchAll(/check\s*\(\s*platform\s+in\s*\(([^)]*)\)\s*\)/gi)) {
      allowed = match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, "")).filter(Boolean);
    }
  }
  return allowed;
}

/** The lifecycle values publish_actions.status allows. */
function allowedStatuses(): string[] {
  let allowed: string[] = [];
  for (const statement of publishActionStatements()) {
    for (const match of statement.matchAll(/check\s*\(\s*status\s+in\s*\(([\s\S]*?)\)\s*\)/gi)) {
      allowed = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    }
  }
  return allowed;
}

const PLATFORMS = allowedPlatforms();
const STATUSES = allowedStatuses();

// ---- a fake that refuses what the database would refuse -------------

type Row = Record<string, any>;

function fakeDb(seed: { websites: Row[]; website_pages: Row[] }) {
  const tables: Record<string, Row[]> = {
    publish_actions: [],
    pending_approvals: [],
    websites: [...seed.websites],
    website_pages: [...seed.website_pages],
  };
  let ids = 0;

  /** The two CHECK constraints on publish_actions, enforced. */
  function violation(table: string, row: Row): string | null {
    if (table !== "publish_actions") return null;
    if (row.platform !== undefined && !PLATFORMS.includes(row.platform)) {
      return `new row for relation "publish_actions" violates check constraint "publish_actions_platform_check"`;
    }
    if (row.status !== undefined && !STATUSES.includes(row.status)) {
      return `new row for relation "publish_actions" violates check constraint "publish_actions_status_check"`;
    }
    return null;
  }

  function from(table: string) {
    const filters: [string, any][] = [];
    const inFilters: [string, any[]][] = [];
    const likeFilters: [string, string][] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};

    const matches = (row: Row) =>
      filters.every(([c, v]) => row[c] === v) &&
      inFilters.every(([c, v]) => v.includes(row[c])) &&
      likeFilters.every(([c, v]) => String(row[c] ?? "").startsWith(v.replace(/%$/, "")));

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => (filters.push([c, v]), api),
      in: (c: string, v: any[]) => (inFilters.push([c, v]), api),
      like: (c: string, v: string) => (likeFilters.push([c, v]), api),
      // The executor's claim uses .or() for its staleness window. Every
      // row this suite reaches is freshly approved, so it does not
      // narrow anything here.
      or: () => api,
      order: () => api,
      limit: () => api,
      apply(): { data: Row[] | null; error: { message: string } | null } {
        if (op === "insert") {
          const bad = violation(table, payload);
          if (bad) return { data: null, error: { message: bad } };
          const row = { id: `${table}-${++ids}`, created_at: new Date(2026, 8, 29, ids).toISOString(), ...payload };
          tables[table].push(row);
          return { data: [row], error: null };
        }
        if (op === "update") {
          const hit = tables[table].filter(matches);
          for (const row of hit) {
            const bad = violation(table, { ...row, ...payload });
            if (bad) return { data: null, error: { message: bad } };
            Object.assign(row, payload);
          }
          return { data: hit, error: null };
        }
        return { data: tables[table].filter(matches), error: null };
      },
      insert(fields: Row) {
        op = "insert";
        payload = fields;
        return api;
      },
      update(fields: Row) {
        op = "update";
        payload = fields;
        return api;
      },
      single: async () => {
        const { data, error } = api.apply();
        return { data: data?.[0] ?? null, error: error ?? (data?.length ? null : { message: "no rows" }) };
      },
      maybeSingle: async () => {
        const { data, error } = api.apply();
        return { data: data?.[0] ?? null, error };
      },
      then: (resolve: any) => {
        const { data, error } = api.apply();
        return resolve({ data, error });
      },
    };
    return api;
  }

  return { client: { from }, tables };
}

// ---- the world this runs in -----------------------------------------

const SITE = { id: "w1", slug: "candle_by_qaaf", published: true, dealership_id: "d1" };
const HOME = { id: "p1", website_id: "w1", slug: "home", title: "Home", seo_title: null, meta_description: null };

const OWNER_DESCRIPTION =
  "Hand-poured soy candles made by hand in Shahjahanpur, in small batches, with fragrance that lasts the whole evening. Shop now.";
const OWNER_TITLE = "Handmade Soy Candles in Shahjahanpur | Candle by Qaaf";

let store = fakeDb({ websites: [SITE], website_pages: [HOME] });

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => store.client }));

import { executeTool } from "@/lib/agents/masterBrainV2";
import { releaseApprovedAction } from "@/lib/publish/release";
import { createHawlaiSitePlatform } from "@/lib/publish/platforms/hawlaiSite";
import { createPlatformRegistry } from "@/lib/publish/registry";

const CTX: any = { id: "d1", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles", team: [], toneOfVoice: null };

function servingPage(title: string, description: string | null) {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => `<html><head><title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}"/>` : ""}</head></html>`,
  })) as any;
}

/** Approve the card the way the route does: mark it approved, then release. */
async function approve(approvalId: string, fetchImpl: any) {
  const approval = store.tables.pending_approvals.find((a) => a.id === approvalId)!;
  approval.status = "approved";
  return releaseApprovedAction(
    {
      supabase: store.client,
      platforms: {
        ...createPlatformRegistry(store.client),
        hawlai_site: createHawlaiSitePlatform({ supabase: store.client, fetchImpl, baseUrl: "https://hawlai.online" }),
      },
    },
    approvalId
  );
}

describe("the schema allows what the code proposes", () => {
  it("reads a real constraint out of the migrations at all", () => {
    // Without this, every assertion below passes vacuously on an empty
    // list — the failure mode of any test that parses source.
    expect(PLATFORMS).toContain("shopify");
    expect(PLATFORMS).toContain("hawlai_shop");
    expect(STATUSES).toContain("awaiting_approval");
  });

  it("EVERY platform the executor can run is a value the table accepts", () => {
    // The generic form of the 2026-09-29 outage: a platform module
    // registered in code, with no migration widening the CHECK. This
    // fails for the next one too, before anybody's chat does.
    const registered = Object.keys(createPlatformRegistry({} as any));
    expect(registered.filter((id) => !PLATFORMS.includes(id))).toEqual([]);
  });

  it("names the business's own website specifically", () => {
    expect(PLATFORMS).toContain("hawlai_site");
  });
});

describe("propose → approve → write → read the live page", () => {
  it("runs the whole way through and only then says live", async () => {
    store = fakeDb({ websites: [SITE], website_pages: [{ ...HOME }] });

    const proposal = await executeTool(store.client, CTX, "propose_page_meta", { page: "home", title: OWNER_TITLE, metaDescription: OWNER_DESCRIPTION }, "");
    // Attempt 1 and 2 in production both died here, on the first insert.
    expect(proposal.error).toBeUndefined();
    expect(proposal.success).toBe(true);
    expect(proposal.approval_id).toBeTruthy();

    const action = store.tables.publish_actions[0];
    expect(action.platform).toBe("hawlai_site");
    expect(action.status).toBe("awaiting_approval");
    // Nothing public has changed yet.
    expect(store.tables.website_pages[0].seo_title).toBeNull();

    const fetchImpl = servingPage(OWNER_TITLE, OWNER_DESCRIPTION);
    const released = await approve(proposal.approval_id, fetchImpl);

    expect(released.kind).toBe("ran");
    if (released.kind !== "ran") return;
    expect(released.outcome.status).toBe("executed");

    // The write landed, exactly as the owner wrote it.
    const page = store.tables.website_pages[0];
    expect(page.seo_title).toBe(OWNER_TITLE);
    expect(page.meta_description).toBe(OWNER_DESCRIPTION);
    // And the nav label was not touched.
    expect(page.title).toBe("Home");

    // The live page was actually fetched, and the verdict comes from it.
    expect(fetchImpl).toHaveBeenCalledWith("https://hawlai.online/site/candle_by_qaaf", expect.anything());
    const verification = (released.outcome as any).platformResponse.verification;
    expect(verification.verified).toBe(true);
    expect(verification.message).toMatch(/^Live —/);
  });

  it("does NOT say live when the page is still serving the old tags", async () => {
    store = fakeDb({ websites: [SITE], website_pages: [{ ...HOME }] });
    const proposal = await executeTool(store.client, CTX, "propose_page_meta", { metaDescription: OWNER_DESCRIPTION }, "");
    // The site is published in this fixture but the page has not caught
    // up — a cache, a deploy in flight. The write is real either way.
    const released = await approve(proposal.approval_id, servingPage("Candle by Qaaf", null));

    if (released.kind !== "ran") throw new Error("never ran");
    expect(released.outcome.status).toBe("executed");
    expect(store.tables.website_pages[0].meta_description).toBe(OWNER_DESCRIPTION);
    const verification = (released.outcome as any).platformResponse.verification;
    expect(verification.verified).toBe(false);
    expect(verification.message).toMatch(/not live yet/);
  });

  it("reports the real constraint message rather than swallowing it, if one ever fires again", async () => {
    store = fakeDb({ websites: [SITE], website_pages: [{ ...HOME }] });
    const original = store.client.from;
    // Narrow the fake to the pre-204 world for one call.
    store.client.from = ((table: string) => {
      const api = original(table);
      if (table !== "publish_actions") return api;
      const insert = api.insert;
      api.insert = (fields: Row) =>
        fields.platform === "hawlai_site"
          ? { select: () => ({ single: async () => ({ data: null, error: { message: 'violates check constraint "publish_actions_platform_check"' } }) }) }
          : insert(fields);
      return api;
    }) as any;

    const proposal = await executeTool(store.client, CTX, "propose_page_meta", { metaDescription: OWNER_DESCRIPTION }, "");
    store.client.from = original;

    expect(proposal.success).toBeUndefined();
    expect(proposal.error).toMatch(/publish_actions_platform_check/);
    // And it stopped there: no approval was queued for a change that
    // was never recorded.
    expect(store.tables.pending_approvals).toHaveLength(0);
    expect(store.tables.website_pages[0].seo_title).toBeNull();
  });
});
