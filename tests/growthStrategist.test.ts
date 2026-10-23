// S4/P3 — THE STRATEGIST: the only thing that reads and writes findings.
//
// P0's rules are already tested without a database. These tests are
// about rows: that a finding already live is not duplicated, that a
// rejection is never overwritten, that the cap is per DAY and not per
// RUN, and that §2c's conversion rule is applied before anything is
// ranked.
//
// The per-day property is a real case, not a defensive one:
// dailyJobs.ts genuinely re-enters a run whose invocation ran out of
// time, so "running twice must not surface six" is something that will
// happen.

import { describe, it, expect } from "vitest";
import { linkFindingsToGoals, pickToday, recordFindings } from "@/lib/growth/strategist";
import { MAX_ACTIONS_PER_DAY } from "@/lib/growth/findings";
import type { AuditFinding } from "@/lib/growth/audit";
import type { TrackingState } from "@/lib/growth/tracking";

const NOW = new Date("2026-10-23T04:00:00.000Z"); // 09:30 IST
const TODAY = "2026-10-23";

function tracking(over: Partial<TrackingState> = {}): TrackingState {
  return {
    siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 40, firstAt: "2026-09-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
    ...over,
  };
}

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    type: "pages_without_search_title",
    reference: "singleton",
    title: "2 pages have no search title",
    detail: "detail",
    score: { impact: 4, confidence: 5, effort: 1 },
    evidence: [{ kind: "website_page", id: "p1" }],
    ...over,
  };
}

/** A table double that records every write and honours eq/in/is filters. */
function db(seed: { opportunities?: any[]; goals?: any[] } = {}) {
  const tables: Record<string, any[]> = {
    opportunities: seed.opportunities ?? [],
    goals: seed.goals ?? [],
  };
  const writes: { table: string; kind: string; values: any; filters: Record<string, any> }[] = [];
  const errors: Record<string, string> = {};

  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      const matches = (r: any) =>
        Object.entries(filters).every(([k, v]) => {
          if (k.startsWith("in:")) return (v as any[]).includes(r[k.slice(3)]);
          if (k.startsWith("is:")) return r[k.slice(3)] === null || r[k.slice(3)] === undefined;
          return k in r ? r[k] === v : true;
        });
      const rows = () => tables[table].filter(matches);
      // CHAINABLE LIKE THE REAL CLIENT. My first version returned a
      // Promise from update(), and nine tests failed with "update(...).eq
      // is not a function" — supabase-js returns a builder, so
      // `.update(x).eq("id", y)` is the shape the production code
      // legitimately uses. The write applies when the builder is
      // awaited, which is also when the real one sends it.
      let pending: { kind: "update" | "insert"; values: any } | null = null;
      const apply = () => {
        if (!pending) return { data: rows(), error: errors[`${table}:select`] ? { message: errors[`${table}:select`] } : null };
        const { kind, values } = pending;
        pending = null;
        writes.push({ table, kind, values, filters: { ...filters } });
        if (errors[`${table}:${kind}`]) return { data: null, error: { message: errors[`${table}:${kind}`] } };
        if (kind === "insert") tables[table].push({ id: `row_${tables[table].length + 1}`, ...values });
        else for (const r of rows()) Object.assign(r, values);
        return { data: null, error: null };
      };
      const chain: any = {
        select() { return chain; },
        eq(c: string, v: any) { filters[c] = v; return chain; },
        in(c: string, v: any[]) { filters[`in:${c}`] = v; return chain; },
        is(c: string, _v: any) { filters[`is:${c}`] = true; return chain; },
        update(values: any) { pending = { kind: "update", values }; return chain; },
        insert(values: any) { pending = { kind: "insert", values }; return chain; },
        maybeSingle() { const r = apply(); return Promise.resolve({ data: (r.data as any[] | null)?.[0] ?? null, error: r.error }); },
        then(resolve: any) { return resolve(apply()); },
      };
      return chain;
    },
  };
  return { client, tables, writes, errors };
}

describe("1. recording a finding", () => {
  it("INSERTS A NEW ONE WITH ITS SCORE AND EVIDENCE", async () => {
    const { client, tables } = db();
    const r = await recordFindings(client, "d1", [finding()]);
    expect(r).toEqual({ inserted: 1, updated: 0, failed: 0 });
    const row = tables.opportunities[0];
    expect(row.impact).toBe(4);
    expect(row.confidence).toBe(5);
    expect(row.effort).toBe(1);
    expect(row.evidence).toEqual([{ kind: "website_page", id: "p1" }]);
    expect(row.status).toBe("open");
  });

  it("DOES NOT DUPLICATE ONE THAT IS ALREADY OPEN", async () => {
    const { client, tables } = db({
      opportunities: [{ id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "open" }],
    });
    const r = await recordFindings(client, "d1", [finding({ title: "3 pages have no search title" })]);
    expect(r).toEqual({ inserted: 0, updated: 1, failed: 0 });
    expect(tables.opportunities).toHaveLength(1);
    // The count changed since yesterday, so the wording is refreshed.
    expect(tables.opportunities[0].title).toBe("3 pages have no search title");
  });

  it("AND NEVER OVERWRITES A REJECTION — the cooldown's whole point", async () => {
    const { client, tables, writes } = db({
      opportunities: [
        { id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "rejected", rejected_at: "2026-10-20T00:00:00Z" },
      ],
    });
    const r = await recordFindings(client, "d1", [finding()]);
    expect(r).toEqual({ inserted: 0, updated: 1, failed: 0 });
    expect(tables.opportunities).toHaveLength(1);
    expect(tables.opportunities[0].status).toBe("rejected");
    expect(tables.opportunities[0].rejected_at).toBe("2026-10-20T00:00:00Z");
    // Neither field is even mentioned in the write.
    const update = writes.find((w) => w.kind === "update")!;
    expect(update.values.status).toBeUndefined();
    expect(update.values.rejected_at).toBeUndefined();
  });

  it("A FAILED READ IS NOT AN EMPTY TABLE", async () => {
    // Treating it as one would insert a duplicate of everything live.
    const { client, errors, tables } = db();
    errors["opportunities:select"] = "boom";
    const r = await recordFindings(client, "d1", [finding()]);
    expect(r).toEqual({ inserted: 0, updated: 0, failed: 1 });
    expect(tables.opportunities).toEqual([]);
  });

  it("and a failed insert is counted, not swallowed", async () => {
    const { client, errors } = db();
    errors["opportunities:insert"] = "nope";
    expect(await recordFindings(client, "d1", [finding()])).toEqual({ inserted: 0, updated: 0, failed: 1 });
  });
});

describe("2. linking a finding to the goal it serves", () => {
  it("LINKS BY THE GOAL'S TITLE when an active goal matches", async () => {
    const { client, tables } = db({
      opportunities: [{ id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "open", goal_id: null }],
      goals: [{ id: "g1", title: "Give every page a search title", status: "active" }],
    });
    const r = await linkFindingsToGoals(client, "d1", new Map([["pages_without_search_title", "Give every page a search title"]]));
    expect(r.linked).toBe(1);
    expect(tables.opportunities[0].goal_id).toBe("g1");
  });

  it("INVENTS NOTHING WHEN NO GOAL EXISTS", async () => {
    // The finding keeps goal_id null and is simply not surfaced, which
    // is what surfaceable already decides.
    const { client, tables } = db({
      opportunities: [{ id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "open", goal_id: null }],
      goals: [],
    });
    expect(await linkFindingsToGoals(client, "d1", new Map([["pages_without_search_title", "Give every page a search title"]]))).toEqual({ linked: 0 });
    expect(tables.opportunities[0].goal_id).toBeNull();
  });

  it("INVENTS NOTHING WHEN GOALS EXIST BUT NONE MATCHES", async () => {
    // The earlier test seeded NO goals, so linkFindingsToGoals returned
    // early and its per-goal branch was never reached — a mutation that
    // dropped the no-match skip survived it. Goals have to exist for
    // the matching to be observable.
    const { client, tables } = db({
      opportunities: [{ id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "open", goal_id: null }],
      goals: [{ id: "g1", title: "Something else entirely", status: "active" }],
    });
    const r = await linkFindingsToGoals(client, "d1", new Map([["pages_without_search_title", "Give every page a search title"]]));
    expect(r).toEqual({ linked: 0 });
    expect(tables.opportunities[0].goal_id).toBeNull();
  });

  it("and ignores a goal that is no longer active", async () => {
    const { client } = db({
      opportunities: [{ id: "o1", type: "x", reference_id: "singleton", status: "open", goal_id: null }],
      goals: [{ id: "g1", title: "Old goal", status: "abandoned" }],
    });
    expect(await linkFindingsToGoals(client, "d1", new Map([["x", "Old goal"]]))).toEqual({ linked: 0 });
  });
});

describe("3. picking today's three", () => {
  const ready = (over: Partial<any> = {}) => ({
    id: "o1",
    type: "pages_without_search_title",
    reference_id: "singleton",
    title: "t",
    impact: 4,
    confidence: 5,
    effort: 1,
    evidence: [{ kind: "website_page", id: "p1" }],
    goal_id: "g1",
    rejected_at: null,
    last_surfaced_on: null,
    status: "open",
    ...over,
  });

  it("TAKES AT MOST THREE, HIGHEST SCORE FIRST", async () => {
    const { client } = db({
      opportunities: [
        ready({ id: "a", type: "t1", impact: 1, confidence: 1, effort: 5 }), // 0.2
        ready({ id: "b", type: "t2", impact: 5, confidence: 5, effort: 1 }), // 25
        ready({ id: "c", type: "t3", impact: 4, confidence: 4, effort: 2 }), // 8
        ready({ id: "d", type: "t4", impact: 3, confidence: 3, effort: 3 }), // 3
      ],
    });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked.map((p) => p.id)).toEqual(["b", "c", "d"]);
    expect(r.picked).toHaveLength(MAX_ACTIONS_PER_DAY);
    expect(r.skipped.map((s) => s.row.id)).toEqual(["a"]);
  });

  it("MARKS ONLY WHAT IT PICKED, and leaves the rest alone", async () => {
    // MY FIRST VERSION OF THIS TEST ASSERTED ITS OWN OPPOSITE. It had
    // two findings against a cap of three, so BOTH were picked, and it
    // then asserted that both were marked — under a name that says the
    // skipped one is not. Four findings are needed for one to be
    // skipped at all.
    const { client, tables } = db({
      opportunities: [
        ready({ id: "a", type: "t1", impact: 5, confidence: 5, effort: 1 }),
        ready({ id: "b", type: "t2", impact: 4, confidence: 4, effort: 1 }),
        ready({ id: "c", type: "t3", impact: 3, confidence: 3, effort: 1 }),
        ready({ id: "d", type: "t4", impact: 1, confidence: 1, effort: 5, last_surfaced_on: "2026-10-01" }),
      ],
    });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked.map((p) => p.id)).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) {
      expect(tables.opportunities.find((o) => o.id === id)!.last_surfaced_on, id).toBe(TODAY);
    }
    // The one the cap dropped keeps the date it already had, so
    // tomorrow's cap is not spent on today's decision.
    expect(tables.opportunities.find((o) => o.id === "d")!.last_surfaced_on).toBe("2026-10-01");
  });

  it("THE CAP IS PER DAY, NOT PER RUN — the dispatcher really re-enters", async () => {
    const { client } = db({
      opportunities: [
        ready({ id: "a", type: "t1" }),
        ready({ id: "b", type: "t2" }),
        ready({ id: "c", type: "t3" }),
        ready({ id: "d", type: "t4" }),
      ],
    });
    const first = await pickToday(client, "d1", tracking(), NOW);
    expect(first.picked).toHaveLength(3);
    const second = await pickToday(client, "d1", tracking(), NOW);
    expect(second.alreadySurfaced).toBe(3);
    expect(second.picked).toEqual([]);
  });

  it("A FINDING ALREADY IN TODAY'S REPORT IS NOT OFFERED AGAIN", async () => {
    // THE CAP ALONE DOES NOT GUARANTEE THIS, which a mutation check
    // showed: with one already surfaced and the day not full, dropping
    // the already-surfaced skip let the same finding be picked a second
    // time and appear twice in one report. The cap was still respected;
    // the report was still wrong.
    const { client } = db({
      opportunities: [
        ready({ id: "old", type: "t1", impact: 5, confidence: 5, effort: 1, last_surfaced_on: TODAY }),
        ready({ id: "new", type: "t2", impact: 2, confidence: 2, effort: 1 }),
      ],
    });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked.map((p) => p.id)).toEqual(["new"]);
    expect(r.alreadySurfaced).toBe(1);
  });

  it("SKIPS A FINDING IN ITS COOLDOWN, with the reason", async () => {
    const { client } = db({
      opportunities: [ready({ id: "a", rejected_at: "2026-10-20T00:00:00Z", status: "open" })],
    });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked).toEqual([]);
    expect(r.skipped[0].why).toMatch(/rejected it less than 30 days ago/);
  });

  it("SKIPS ONE WITH NO GOAL, and says so", async () => {
    const { client } = db({ opportunities: [ready({ goal_id: null })] });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked).toEqual([]);
    expect(r.skipped[0].why).toMatch(/serves no goal/);
  });

  it("SKIPS ONE WITH NO SCORE, rather than ranking it as zero", async () => {
    const { client } = db({ opportunities: [ready({ impact: null, confidence: null, effort: null })] });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked).toEqual([]);
    expect(r.skipped[0].why).toMatch(/no complete score/);
  });
});

describe("4. §2c — a suggestion resting on conversions waits for the measurement", () => {
  const adFinding = (over: Partial<any> = {}) => ({
    id: "ad1",
    type: "ad_spend_no_return",
    reference_id: "singleton",
    title: "t",
    impact: 5,
    confidence: 5,
    effort: 1,
    evidence: [{ kind: "campaign", id: "c1" }],
    goal_id: "g1",
    rejected_at: null,
    last_surfaced_on: null,
    status: "open",
    ...over,
  });

  it("IS WITHHELD WHILE CONVERSIONS ARE UNVERIFIED, however high it scores", async () => {
    const { client } = db({ opportunities: [adFinding()] });
    const r = await pickToday(
      client,
      "d1",
      tracking({ adsConversions: { verified: false, why: "a campaign has run but no paid order has been recorded in the last 30 days" } }),
      NOW
    );
    expect(r.picked).toEqual([]);
    expect(r.skipped[0].why).toMatch(/depends on conversion data/);
    expect(r.skipped[0].why).toMatch(/no paid order/);
  });

  it("AND GOES THROUGH ONCE THEY ARE VERIFIED", async () => {
    const { client } = db({ opportunities: [adFinding()] });
    const r = await pickToday(client, "d1", tracking(), NOW);
    expect(r.picked.map((p) => p.id)).toEqual(["ad1"]);
  });

  it("while a finding that rests on nothing measured is unaffected", async () => {
    // The site, the catalogue and the copy are true whether anything
    // converts or not.
    const { client } = db({ opportunities: [adFinding({ id: "site1", type: "pages_without_search_title" })] });
    const r = await pickToday(client, "d1", tracking({ adsConversions: { verified: false, why: "none" } }), NOW);
    expect(r.picked.map((p) => p.id)).toEqual(["site1"]);
  });
});

describe("5. it writes nothing but findings", () => {
  it("TOUCHES ONLY `opportunities`", async () => {
    // §2b: the manager never writes customer copy itself.
    const { client, writes } = db({
      opportunities: [
        { id: "o1", type: "pages_without_search_title", reference_id: "singleton", status: "open", impact: 4, confidence: 5, effort: 1, evidence: [{ kind: "p", id: "1" }], goal_id: "g1", rejected_at: null, last_surfaced_on: null, title: "t" },
      ],
      goals: [{ id: "g1", title: "Give every page a search title", status: "active" }],
    });
    await recordFindings(client, "d1", [finding({ type: "products_without_image" })]);
    await linkFindingsToGoals(client, "d1", new Map([["pages_without_search_title", "Give every page a search title"]]));
    await pickToday(client, "d1", tracking(), NOW);
    expect(writes.length).toBeGreaterThan(2);
    expect([...new Set(writes.map((w) => w.table))]).toEqual(["opportunities"]);
  });
});
