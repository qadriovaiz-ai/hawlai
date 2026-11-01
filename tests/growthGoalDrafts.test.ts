// S4/P6 — PUTTING A SETUP STEP WHERE THE OWNER CAN APPROVE IT.
//
// WHY THIS FILE EXISTS, 1 November 2026. Every piece of the chain was
// built except its first link. strategy.ts drafted setup steps, the
// Tasks page confirmed draft goals, and migration 210 required a goal
// before a finding could be surfaced — but nothing wrote a drafted step
// into `goals`. So the daily report carried "Approve a plan and they
// will appear here" from 24 October, naming something that could not be
// done, and the exit test's third claim could never be demonstrated
// because no suggestion was ever renderable.
//
// THE TWO LOAD-BEARING PROPERTIES:
//
//   1. nothing here activates a goal. The owner's button does.
//   2. a step is offered ONCE. /api/goals/[id]/discard sets 'abandoned'
//      rather than deleting, so "already offered" must mean any status
//      at all, or a step the owner discarded is back tomorrow morning.

import { describe, it, expect, afterEach, vi } from "vitest";
import { writeSetupGoalDrafts, SETUP_GOAL_CREATED_BY } from "@/lib/growth/goalDrafts";
import type { DraftGoal } from "@/lib/growth/strategy";
import { sql } from "./helpers/source";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function step(over: Partial<DraftGoal> = {}): DraftGoal {
  return {
    key: "pages_without_search_title",
    title: "Give every page a search title",
    description: "A page without one lets the search engine choose what to call it.",
    targetMetric: "pages with a search title",
    targetValue: 4,
    basis: [{ kind: "counted", id: "website_pages" }],
    ...over,
  };
}

/** A `goals` double that honours eq / not-is-null and records inserts. */
function db(seed: any[] = [], opts: { selectError?: string; insertError?: string } = {}) {
  const goals: any[] = [...seed];
  const inserts: any[] = [];
  const client = {
    from(_table: string) {
      const filters: Record<string, any> = {};
      let notNull: string | null = null;
      let pending: any = null;
      const rows = () =>
        goals
          .filter((r) => Object.entries(filters).every(([k, v]) => (k in r ? r[k] === v : true)))
          .filter((r) => (notNull ? r[notNull] !== null && r[notNull] !== undefined : true));
      const apply = () => {
        if (pending) {
          const values = pending;
          pending = null;
          if (opts.insertError) return { data: null, error: { message: opts.insertError } };
          inserts.push(values);
          goals.push({ id: `g${goals.length + 1}`, ...values });
          return { data: null, error: null };
        }
        if (opts.selectError) return { data: null, error: { message: opts.selectError } };
        return { data: rows(), error: null };
      };
      const chain: any = {
        select() { return chain; },
        eq(c: string, v: any) { filters[c] = v; return chain; },
        not(c: string, _op: string, _v: any) { notNull = c; return chain; },
        insert(values: any) { pending = values; return chain; },
        then(resolve: any) { return resolve(apply()); },
      };
      return chain;
    },
  };
  return { client, goals, inserts };
}

describe("1. a setup step reaches the Tasks page as a draft", () => {
  it("WRITES IT AS A DRAFT, NEVER AS AN ACTIVE GOAL", async () => {
    // The whole value of the exit test is that a human decided. A
    // manager that could activate its own goal would make "each
    // suggestion cites the goal it serves" satisfy itself.
    const { client, inserts } = db();
    const r = await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(r.drafted).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe("draft");
    expect(inserts[0].status).not.toBe("active");
  });

  it("AND CARRIES THE AUDIT'S OWN WORDS AND NUMBERS, not a model's", async () => {
    // set_goal runs decomposeGoal, which costs money and REWRITES THE
    // TITLE — breaking the very link this feature exists to make.
    const { client, inserts } = db();
    await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(inserts[0].title).toBe("Give every page a search title");
    expect(inserts[0].description).toBe("A page without one lets the search engine choose what to call it.");
    expect(inserts[0].target_metric).toBe("pages with a search title");
    expect(inserts[0].target_value).toBe(4);
    expect(inserts[0].source_key).toBe("pages_without_search_title");
    expect(inserts[0].created_by).toBe(SETUP_GOAL_CREATED_BY);
  });

  it("AND NO MODEL IS CALLED ON THIS PATH AT ALL", async () => {
    // The guard against someone reaching for decomposeGoal later: every
    // Anthropic call in this codebase goes out through fetch.
    const spy = vi.fn(() => Promise.reject(new Error("no network on this path")));
    globalThis.fetch = spy as any;
    const { client } = db();
    const r = await writeSetupGoalDrafts(client, "d1", [step(), step({ key: "k2", title: "T2" })]);
    expect(r.drafted).toBe(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves proposed_tasks empty, so confirming creates no tasks", async () => {
    // A setup step is one thing to do, not a plan to decompose. The
    // confirm route loops over proposed_tasks and makes nothing of [].
    const { client, inserts } = db();
    await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(inserts[0].proposed_tasks).toEqual([]);
  });

  it("writes one row per step, each with its own key", async () => {
    const { client, inserts } = db();
    const r = await writeSetupGoalDrafts(client, "d1", [
      step(),
      step({ key: "products_without_image", title: "Add an image to every product" }),
    ]);
    expect(r.drafted).toBe(2);
    expect(inserts.map((i) => i.source_key)).toEqual(["pages_without_search_title", "products_without_image"]);
  });
});

describe("2. A STEP IS OFFERED ONCE, WHATEVER THE OWNER DID WITH IT", () => {
  it("DOES NOT RE-OFFER A STEP THE OWNER DISCARDED", async () => {
    // THE CASE THAT CHANGED THE DESIGN. /api/goals/[id]/discard sets
    // 'abandoned', it does not delete. A draft-or-active check would
    // have brought a discarded step back every single morning.
    const { client, inserts } = db([
      { id: "g1", dealership_id: "d1", source_key: "pages_without_search_title", status: "abandoned" },
    ]);
    const r = await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(r.drafted).toBe(0);
    expect(r.alreadyOffered).toBe(1);
    expect(inserts).toHaveLength(0);
  });

  it("AND DOES NOT RE-OFFER ONE STILL WAITING, OR ONE ALREADY APPROVED", async () => {
    const { client, inserts } = db([
      { id: "g1", dealership_id: "d1", source_key: "a", status: "draft" },
      { id: "g2", dealership_id: "d1", source_key: "b", status: "active" },
      { id: "g3", dealership_id: "d1", source_key: "c", status: "completed" },
    ]);
    const r = await writeSetupGoalDrafts(client, "d1", [step({ key: "a" }), step({ key: "b" }), step({ key: "c" })]);
    expect(r.drafted).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("but another business's goal is not this one's", async () => {
    const { client, inserts } = db([
      { id: "g1", dealership_id: "d2", source_key: "pages_without_search_title", status: "draft" },
    ]);
    const r = await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(r.drafted).toBe(1);
    expect(inserts[0].dealership_id).toBe("d1");
  });

  it("and a goal the owner wrote himself blocks nothing", async () => {
    // Every goal written before migration 211 has source_key null, and
    // the read filters those out.
    const { client } = db([{ id: "g1", dealership_id: "d1", source_key: null, status: "active" }]);
    const r = await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(r.drafted).toBe(1);
  });
});

describe("3. what the report is told, and what happens when the table will not answer", () => {
  it("COUNTS EVERY DRAFT STILL WAITING, not just today's", async () => {
    // A step written yesterday and still unconfirmed is still waiting.
    // Counting only this run's writes would make the email go quiet
    // about it the next morning, and he would never hear of it again.
    const { client } = db([
      { id: "g1", dealership_id: "d1", source_key: "a", status: "draft" },
      { id: "g2", dealership_id: "d1", source_key: "b", status: "active" },
    ]);
    const r = await writeSetupGoalDrafts(client, "d1", [step({ key: "a" }), step({ key: "c" })]);
    expect(r.drafted).toBe(1);
    expect(r.pending).toBe(2); // yesterday's draft, and the one written just now
  });

  it("A FAILED READ WRITES NOTHING AND SAYS SO", async () => {
    // Treating an unreadable table as an empty one would offer every
    // step again. Migration 211's index would refuse the duplicates, so
    // the damage would be a run reporting work it did not do — the
    // instrument telling a false story, which this project has paid for
    // five times.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, inserts } = db([], { selectError: "column goals.source_key does not exist" });
    const r = await writeSetupGoalDrafts(client, "d1", [step(), step({ key: "k2" })]);
    expect(r.drafted).toBe(0);
    expect(r.failed).toBe(2);
    expect(r.pending).toBe(0);
    expect(inserts).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/migration 211/);
  });

  it("AND A FAILED INSERT IS COUNTED AS FAILED, NOT AS DRAFTED", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = db([], { insertError: "duplicate key value violates unique constraint" });
    const r = await writeSetupGoalDrafts(client, "d1", [step()]);
    expect(r.drafted).toBe(0);
    expect(r.failed).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it("and no steps means no writes and no noise", async () => {
    const { client, inserts } = db();
    const r = await writeSetupGoalDrafts(client, "d1", []);
    expect(r).toEqual({ drafted: 0, alreadyOffered: 0, failed: 0, pending: 0 });
    expect(inserts).toHaveLength(0);
  });
});

describe("4. migration 211 holds the same rule the code does", () => {
  // READ THROUGH sql(), NOT code(). code() strips // and block
  // comments, which a .sql file does not use, so 211's own header —
  // which explains at length why the index is NOT scoped to
  // status in ('draft','active'), naming that clause — would still be
  // in the text a grep searches. That is the 2026-10-09 incident
  // exactly: a comment ABOUT the thing defeats the test looking for it.
  const m = sql("supabase/migrations/211_goals_source_key.sql");

  it("the migration says something at all", () => {
    // A path typo would make every assertion below pass on an empty
    // string, which is the failure this whole discipline is about.
    expect(m.length).toBeGreaterThan(100);
    expect(m).toMatch(/alter table goals add column if not exists source_key text/);
    // AND THE COMMENTS REALLY ARE GONE. A sql() that silently returned
    // the raw file would make the assertion below pass or fail on the
    // header rather than on the statement, and nobody would know.
    expect(m).not.toMatch(/THE MISSING LINK/);
  });

  it("THE UNIQUE INDEX IS NOT SCOPED TO A STATUS", () => {
    // THE WHOLE OF "IT APPEARS ONCE". discard sets 'abandoned' rather
    // than deleting, so an index covering only the live statuses would
    // let a discarded step be re-drafted tomorrow morning, and the
    // morning after that.
    const index = m.slice(m.indexOf("create unique index"));
    const statement = index.slice(0, index.indexOf(";") + 1);
    expect(statement).toMatch(/goals\(dealership_id, source_key\)/);
    expect(statement).toMatch(/where source_key is not null/);
    expect(statement).not.toMatch(/status/);
  });

  it("and it is a UNIQUE index, not a plain one", () => {
    expect(m).toMatch(/create unique index if not exists idx_goals_source_key_unique/);
  });
});
