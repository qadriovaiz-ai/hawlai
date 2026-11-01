// S4/P5 — THE LOOP BODY, AND THE PRECONDITION ON SENDING.
//
// The guarantee that matters most here is negative: a report carrying a
// number nobody counted is NOT SENT. S4's exit test is about what the
// owner receives, there is no outcome loop until S5 to catch a decision
// made on a bad figure, and this is the last place the rule can be
// enforced.
//
// Three more, each the dangerous direction:
//
//   in-process     nothing fetches a URL of this app. /api/autopilot/
//                  daily-run is the route whose self-calls produced the
//                  Vercel 508
//   money          M9's model pass is off unless asked for, and the
//                  cron does not ask
//   once a day     the dispatcher really re-enters a run whose
//                  invocation ran out of time, so a retry must not be a
//                  second email

import { describe, it, expect, afterEach, vi } from "vitest";
import { runDailyGrowth } from "@/lib/growth/dailyGrowth";
import { code } from "./helpers/source";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
  vi.restoreAllMocks();
});

const sends: { to: string; subject: string; body: string; options: any }[] = [];
vi.mock("@/lib/email/sendDealerEmail", () => ({
  ownerEmail: async (ownerId: string | null) => (ownerId ? "owner@example.test" : null),
  sendDealerEmail: async (_s: any, _d: string, to: string, subject: string, body: string, options: any) => {
    sends.push({ to, subject, body, options });
    return { ok: true };
  },
}));

const NOW = new Date("2026-10-23T04:00:00.000Z");
const TODAY = "2026-10-23";

/** The real tables, in the shapes the real code reads. Writes recorded. */
function db(over: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    websites: [{ id: "w1", slug: "a-business", published: true, dealership_id: "d1" }],
    // REAL SECTIONS, because with `sections: []` copyLinesFor returns
    // nothing and M9's model pass is unreachable — a mutation that made
    // that pass unconditional survived the test that was supposed to
    // catch it.
    website_pages: [
      {
        id: "p1",
        website_id: "w1",
        slug: "home",
        title: "Home",
        seo_title: null,
        meta_description: "d",
        is_fallback: false,
        content_source: "generated",
        sections: [
          {
            id: "s1",
            type: "section",
            props: {},
            children: [
              { id: "h1", type: "heading", props: { text: "Made by hand", _source: "generated" }, children: [] },
              { id: "t1", type: "text", props: { html: "Every one is poured in small batches.", _source: "generated" }, children: [] },
            ],
          },
        ],
      },
    ],
    products: [{ id: "x1", dealership_id: "d1", description: "a description", price: 999, images: [] }],
    // 55 events spanning 45 days, like the real business — NOT all at
    // one timestamp. With firstAt == lastAt the maturity is 0 days and
    // every test lands in the "still learning" branch, so the
    // ready-with-no-plan state the first dry run exposed is unreachable.
    page_events: Array.from({ length: 55 }, (_, i) => ({
      dealership_id: "d1",
      is_internal: false,
      created_at: i === 0 ? "2026-09-08T10:00:00Z" : "2026-10-22T10:00:00Z",
    })),
    dealerships: [{ id: "d1", dealership_name: "A Business", owner_id: "u1" }],
    ad_creatives: [],
    orders: [],
    goals: [],
    opportunities: [],
    ...over,
  };
  const writes: { table: string; kind: string }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, any> = {};
      let pending: { kind: string; values: any } | null = null;
      const matches = (r: any) =>
        Object.entries(filters).every(([k, v]) => {
          if (k.startsWith("in:")) return (v as any[]).includes(r[k.slice(3)]);
          if (k.startsWith("is:")) return r[k.slice(3)] === null || r[k.slice(3)] === undefined;
          if (k.startsWith("notnull:")) return r[k.slice(8)] !== null && r[k.slice(8)] !== undefined;
          return k in r ? r[k] === v : true;
        });
      const rows = () => (tables[table] ?? []).filter(matches);
      const apply = () => {
        if (!pending) return { data: rows(), error: null };
        const { kind, values } = pending;
        pending = null;
        writes.push({ table, kind });
        if (kind === "insert") tables[table].push({ id: `row${tables[table].length + 1}`, ...values });
        else for (const r of rows()) Object.assign(r, values);
        return { data: null, error: null };
      };
      const chain: any = {
        select: () => chain,
        eq(c: string, v: any) { filters[c] = v; return chain; },
        in(c: string, v: any[]) { filters[`in:${c}`] = v; return chain; },
        is(c: string, _v: any) { filters[`is:${c}`] = true; return chain; },
        not(c: string, _op: string, _v: any) { filters[`notnull:${c}`] = true; return chain; },
        gte: () => chain,
        order: () => chain,
        limit: () => Promise.resolve(apply()),
        maybeSingle: () => Promise.resolve({ data: (apply().data as any[] | null)?.[0] ?? null, error: null }),
        update(v: any) { pending = { kind: "update", values: v }; return chain; },
        insert(v: any) { pending = { kind: "insert", values: v }; return chain; },
        then: (resolve: any) => resolve(apply()),
      };
      return chain;
    },
  };
  return { client, tables, writes };
}

function forbidModelCalls() {
  const calls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    throw new Error("the daily loop must not call a model");
  }) as typeof fetch;
  return calls;
}

describe("1. the loop runs and sends", () => {
  it("BUILDS A SOUND REPORT AND SENDS IT ONCE", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.reportSound).toBe(true);
    expect(r.sent).toBe(true);
    expect(r.notSentBecause).toBeNull();
    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe("owner@example.test");
  });

  it("ONE EMAIL PER BUSINESS PER DAY, by idempotency key", async () => {
    // dailyJobs.ts genuinely re-enters a run whose invocation ran out of
    // time, so a retry must not be a second email.
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].options.idempotencyKey).toBe(`growth-report-d1-${TODAY}`);
  });

  it("and a dry run builds everything and sends nothing", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(r.report).toBeTruthy();
    expect(r.reportSound).toBe(true);
    expect(r.sent).toBe(false);
    expect(r.notSentBecause).toBe("dry run");
    expect(sends).toEqual([]);
  });

  it("says so rather than sending nowhere when there is no owner email", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db({ dealerships: [{ id: "d1", dealership_name: "A Business", owner_id: null }] });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.sent).toBe(false);
    expect(r.notSentBecause).toBe("no owner email on record");
    expect(sends).toEqual([]);
  });
});

describe("2. THE PRECONDITION — a report that fails its own check is not sent", () => {
  it("DROPS THE EMAIL WHEN A NUMBER IS NOT COUNTED", async () => {
    // The failing case this whole stage exists to prevent: an owner
    // acting on a figure that came from nowhere, with no outcome loop
    // until S5 to catch it.
    sends.length = 0;
    forbidModelCalls();
    const report = await import("@/lib/growth/report");
    const spy = vi.spyOn(report, "everyNumberIsCounted").mockReturnValue({ ok: false, offenders: [{ block: "line", found: "300" }] });
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(spy).toHaveBeenCalled();
    expect(r.reportSound).toBe(false);
    expect(r.sent).toBe(false);
    expect(r.notSentBecause).toBe("the report failed its own number check");
    expect(sends).toEqual([]);
  });
});

describe("3. money", () => {
  it("M9's MODEL PASS DOES NOT RUN UNLESS ASKED FOR", async () => {
    // Counted by attempt, not by throw — a swallowed throw leaves a
    // test green while a model is called on every run, which is the
    // mistake copyAudit's own tests record.
    sends.length = 0;
    const calls = forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(calls).toEqual([]);
    expect(r.copyAuditCostInr).toBe(0);
  });

  it("AND THE CRON NEVER ASKS", () => {
    const src = code("src/lib/agents/autopilotAgent.ts");
    const block = src.slice(src.indexOf("runDailyGrowth"), src.indexOf("runDailyGrowth") + 600);
    expect(block).toMatch(/runDailyGrowth\(supabase, dealershipId/);
    // THE PROPERTY, NOT THE CALL'S SHAPE. The cron may pass options —
    // it passes aiFailure now — but never this one. Pinning the exact
    // argument list broke the moment a legitimate option was added,
    // which says the assertion was about the wrong thing.
    expect(block).not.toMatch(/allowCopyAudit/);
  });

  it("only the two pages the founder approved are ever read for it", () => {
    const src = code("src/lib/growth/dailyGrowth.ts");
    expect(src).toMatch(/const COPY_AUDIT_PAGES = \["home", "about"\]/);
  });
});

describe("3b. the paid pass is armed by a DATE, so it expires by itself", () => {
  // The founder approved ONE pass at Rs 2-4. An on/off env var left on
  // by accident is Rs 60-120 a month of unattended spend with nobody
  // watching, and "remember to turn it off" is not a safeguard.
  const ORIGINAL_FLAG = process.env.GROWTH_COPY_AUDIT_ON;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.GROWTH_COPY_AUDIT_ON;
    else process.env.GROWTH_COPY_AUDIT_ON = ORIGINAL_FLAG;
  });

  it("DOES NOT RUN ON ANY OTHER DAY", async () => {
    sends.length = 0;
    const calls = forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = "2026-10-24:d1"; // tomorrow
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(calls).toEqual([]);
    expect(r.copyAuditCostInr).toBe(0);
  });

  it("RUNS ON THE DAY IT NAMES, FOR THE BUSINESS IT NAMES", async () => {
    sends.length = 0;
    const calls = forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = `${TODAY}:d1`;
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    // The model was ASKED. It then failed, because this double refuses
    // every call — which is the point: the attempt is the property.
    expect(calls.length).toBeGreaterThan(0);
  });

  it("A BARE DATE ARMS NOTHING — it would have armed EVERY business", async () => {
    // dailyJobs.ts creates one job per DEALERSHIP per subsystem, so a
    // bare date meant Rs 2-4 times however many businesses exist,
    // against an approval for one. The safe direction is a lost day.
    sends.length = 0;
    const calls = forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = TODAY;
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(calls).toEqual([]);
    expect(r.copyAuditCostInr).toBe(0);
  });

  it("AND SAYS WHY, rather than failing quietly", async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a: any[]) => { errors.push(a.join(" ")); });
    forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = TODAY;
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    spy.mockRestore();
    expect(errors.join(" ")).toMatch(/bare date/);
    expect(errors.join(" ")).toMatch(/EVERY business/);
    expect(errors.join(" ")).toMatch(/<dealership_id>/);
  });

  it("and a date naming a DIFFERENT business arms nothing here", async () => {
    sends.length = 0;
    const calls = forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = `${TODAY}:some-other-business`;
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(calls).toEqual([]);
  });

  it("AND AN EMPTY OR MISSING VALUE NEVER ARMS IT", async () => {
    for (const value of ["", "   ", "yes", "1", "true", ":d1", "2026-10-24:", `${TODAY}:`]) {
      sends.length = 0;
      const calls = forbidModelCalls();
      process.env.GROWTH_COPY_AUDIT_ON = value;
      const { client } = db();
      await runDailyGrowth(client, "d1", { now: NOW });
      expect(calls, `value ${JSON.stringify(value)}`).toEqual([]);
    }
  });

  it("an explicit option still wins, for a caller that is watching", async () => {
    sends.length = 0;
    const calls = forbidModelCalls();
    delete process.env.GROWTH_COPY_AUDIT_ON;
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW, allowCopyAudit: true });
    expect(calls.length).toBeGreaterThan(0);
  });

  it("AND AN EXPLICIT false BEATS THE DATE", async () => {
    sends.length = 0;
    const calls = forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = `${TODAY}:d1`;
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW, allowCopyAudit: false });
    expect(calls).toEqual([]);
  });
});

describe("3a. an unreadable plan is no plan", () => {
  it("A FAILED GOALS READ MEANS NO PLAN, never a plan", async () => {
    // Being wrong the other way produces "working to your plan" sent to
    // a business that has none — one of the three false sentences the
    // first dry run produced. The earlier tests all had a goals read
    // that SUCCEEDED and returned nothing, so this branch was never
    // reached and a mutation returning 1 on failure survived.
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const original = client.from.bind(client);
    (client as any).from = (table: string) => {
      if (table !== "goals") return original(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        // S4/P6 widened this stub: the draft write reads `goals` with
        // .not(...) and would insert into it. An unreadable table is
        // unreadable for that read too, so both are modelled rather
        // than left to throw.
        not: () => chain,
        insert: () => chain,
        then: (resolve: any) => resolve({ data: null, error: { message: "boom" } }),
      };
      return chain;
    };
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.setupSteps).toBeGreaterThan(0);
    expect(sends[0].body).toMatch(/No plan is approved yet/);
    expect(sends[0].body).not.toMatch(/Working to your plan/);
    // AND NOTHING WAS DRAFTED ON A TABLE THAT WOULD NOT ANSWER. A run
    // reporting drafts it did not write is the instrument telling a
    // false story.
    expect(r.goalsDrafted).toBe(0);
    expect(r.goalDraftsPending).toBe(0);
  });
});

describe("3c. the owner is told when the AI could not work", () => {
  // The nine-day outage of October 2026: the report arrived every
  // morning and said nothing, because the audit is model-free and so
  // the report had no idea. Two mutation checks survived the first pass
  // here because nothing exercised either path through the loop.

  it("AN AI FAILURE REACHES THE EMAIL, subject first", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", {
      now: NOW,
      aiFailure: { kind: "credits", message: "AI features are temporarily unavailable on our side." },
    });
    expect(r.sent).toBe(true);
    expect(sends[0].subject).toBe("A Business — AI unavailable (credits)");
    expect(sends[0].body).toMatch(/AI unavailable \(credits\)/);
    expect(sends[0].body).toMatch(/worked out without it, from your own records/);
  });

  it("AND A HEALTHY RUN SAYS NOTHING ABOUT IT", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].subject).not.toMatch(/AI unavailable/);
    expect(sends[0].body).not.toMatch(/AI unavailable/);
  });

  it("AN ARMED COPY AUDIT THAT COULD NOT FINISH IS SAID OUT LOUD", async () => {
    // Armed for this business and this day, and the model refuses every
    // call — so the deep check cannot complete. Silence would read as
    // "your copy is fine", which is what nobody checked.
    const ORIGINAL = process.env.GROWTH_COPY_AUDIT_ON;
    sends.length = 0;
    forbidModelCalls();
    process.env.GROWTH_COPY_AUDIT_ON = `${TODAY}:d1`;
    try {
      const { client } = db();
      await runDailyGrowth(client, "d1", { now: NOW });
      expect(sends[0].body).toMatch(/could not finish checking your page copy/);
    } finally {
      if (ORIGINAL === undefined) delete process.env.GROWTH_COPY_AUDIT_ON;
      else process.env.GROWTH_COPY_AUDIT_ON = ORIGINAL;
    }
  });
});

describe("4. in-process, and it never breaks the rest of the run", () => {
  it("NOTHING FETCHES A URL OF THIS APP", () => {
    // /api/autopilot/daily-run is the route whose self-calls produced
    // the Vercel 508. CLAUDE.md: extract the logic and call it.
    const src = code("src/lib/growth/dailyGrowth.ts");
    expect(src).not.toMatch(/fetch\(\s*["'`]\/api/);
    expect(src).not.toMatch(/\/api\/autopilot/);
  });

  it("THE AUTOPILOT IMPORTS AND CALLS IT, rather than calling a route", () => {
    const src = code("src/lib/agents/autopilotAgent.ts");
    expect(src).toMatch(/await import\("@\/lib\/growth\/dailyGrowth"\)/);
    expect(src).toMatch(/await runDailyGrowth\(/);
  });

  it("AND IT HANDS THE AI FAILURE OVER, because only the report reaches the owner", () => {
    // A source assertion because the loop tests pass aiFailure directly
    // and so cannot see this wiring at all — the mutation that removed
    // it survived them. `ai.failure` is set by the drafting above; the
    // growth run is the only part of this loop the owner ever reads.
    const src = code("src/lib/agents/autopilotAgent.ts");
    expect(src).toMatch(/runDailyGrowth\(supabase, dealershipId, \{ aiFailure: ai\.failure \?\? null \}\)/);
  });

  it("AND A GROWTH RUN THAT THROWS DOES NOT UNDO THE WORK ALREADY REPORTED", () => {
    // Lead follow-ups, auto-pause and snapshots have already happened
    // by the time this runs.
    const src = code("src/lib/agents/autopilotAgent.ts");
    const after = src.slice(src.indexOf("const snapshotted"));
    expect(after).toMatch(/try \{/);
    expect(after).toMatch(/catch \(err: any\) \{/);
    // THE FALLBACK IS THE PROPERTY, not the keyword. A catch that
    // rethrows still contains the word "catch", which is how a
    // mutation that replaced the handler's body survived this once.
    expect(after).toMatch(/growth = \{ findings: 0, suggestions: 0, setupSteps: 0, sent: false, notSentBecause: `the growth run threw/);
    expect(after).not.toMatch(/catch \(err: any\) \{\s*throw/);
  });
});

describe("5. it records what it found, and only in findings", () => {
  it("WRITES THE FINDINGS AND TOUCHES NOTHING ELSE", async () => {
    // S4/P6 ADDED ONE TABLE TO THIS LIST, and it is still an exact set:
    // anything else written still fails here. `goals` is on it because
    // the manager now puts a setup step where the owner can approve it,
    // always as a DRAFT — the test below this one is the one that holds
    // it to a draft. Still nothing customer-facing: §2b's "the manager
    // never writes customer copy itself" is what this guard is for, and
    // a draft goal awaiting a button press is not copy.
    sends.length = 0;
    forbidModelCalls();
    const { client, writes, tables } = db();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(writes.length).toBeGreaterThan(0);
    expect([...new Set(writes.map((w) => w.table))].sort()).toEqual(["goals", "opportunities"]);
    // And nothing it wrote to `goals` was activated.
    expect(writes.filter((w) => w.table === "goals").every((w) => w.kind === "insert")).toBe(true);
    // The site has a page with no search title and a product with no
    // image, so both are on record afterwards.
    expect(tables.opportunities.map((o) => o.type).sort()).toEqual([
      "pages_without_search_title",
      "products_without_image",
    ]);
  });

  it("AND SHOWS SETUP STEPS, because there is no plan", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.findings).toBe(2);
    expect(r.suggestions).toBe(0);
    expect(r.setupSteps).toBe(2);
    expect(sends[0].subject).toMatch(/2 setup steps/);
  });
});

describe("8. S4/P6 — the setup step reaches a page where it can be approved", () => {
  // THE LINK THAT WAS MISSING. A finding may not be surfaced without a
  // goal it serves, the only way to an active goal is the owner
  // confirming a draft on the Tasks page, and nothing wrote a draft. So
  // the email said "Approve a plan and they will appear here" every
  // morning from 24 October about something that could not be done.

  it("DRAFTS EACH SETUP STEP AS A GOAL, AND NEVER ACTIVATES ONE", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client, tables } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(r.goalsDrafted).toBeGreaterThan(0);
    expect(tables.goals).toHaveLength(r.goalsDrafted);
    for (const g of tables.goals) {
      expect(g.status).toBe("draft");
      expect(g.source_key).toBeTruthy();
      expect(g.created_by).toBe("growth_manager:setup_step");
      expect(g.proposed_tasks).toEqual([]);
    }
  });

  it("AND A SECOND RUN DRAFTS NOTHING MORE", async () => {
    // The dispatcher really re-enters a run whose invocation ran out of
    // time. A second pass must not double the Tasks page.
    sends.length = 0;
    forbidModelCalls();
    const { client, tables } = db();
    const first = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    const after = tables.goals.length;
    const second = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(first.goalsDrafted).toBeGreaterThan(0);
    expect(second.goalsDrafted).toBe(0);
    expect(tables.goals).toHaveLength(after);
  });

  it("AND THE EMAIL SENDS HIM TO THE TASKS PAGE INSTEAD OF PROMISING NOTHING", async () => {
    // An active goal that matches no finding: setup blocks are
    // suppressed, nothing is renderable, and this is exactly the state
    // in which the old sentence told him to approve a plan he already
    // had.
    sends.length = 0;
    forbidModelCalls();
    const { client } = db({ goals: [{ id: "g0", dealership_id: "d1", title: "Something of my own", source_key: null, status: "active" }] });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.goalDraftsPending).toBeGreaterThan(0);
    expect(r.sent).toBe(true);
    expect(sends[0].body).not.toMatch(/Approve a plan/);
    expect(sends[0].body).toMatch(/waiting on your Tasks page/);
    expect(sends[0].body).toMatch(new RegExp(`${r.goalDraftsPending} setup step`));
  });
});
