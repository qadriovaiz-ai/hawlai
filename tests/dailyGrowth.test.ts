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
  funnelsNow = [];
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

/**
 * The funnel the ready branch reads — S5/P4.
 *
 * DEFAULTS TO NO FUNNELS, so every test written before P4 behaves
 * exactly as it did: no weakest step, no targets, nothing added to the
 * email. Section 10 sets it, and only section 10.
 *
 * `null` makes the read THROW, which is the unreadable-funnel case
 * rather than a funnel with nothing in it.
 */
let funnelsNow: any[] | null = [];
vi.mock("@/lib/strategy/diagnosis", async (orig) => ({
  ...(await orig<any>()),
  loadDiagnosis: async () => {
    if (funnelsNow === null) throw new Error("page_events is down");
    return {
      window: { days: 90, from: "2026-07-25", to: "2026-10-23", label: "the last 90 days" },
      models: [],
      funnels: funnelsNow,
      sources: [],
      sourcesThin: null,
      atRisk: { count: 0, total: 0, names: [] },
      paid: null,
      gaps: [],
    };
  },
}));

const NOW = new Date("2026-10-23T04:00:00.000Z");
const TODAY = "2026-10-23";

/** One funnel whose weakest step is "looked at a product -> asked". */
function oneWeakStep() {
  return [
    {
      name: "Website to enquiry",
      steps: [
        { key: "visit", label: "Visited the site", count: 400, fromPrevious: null },
        { key: "product_view", label: "Looked at a product", count: 120, fromPrevious: 30 },
        { key: "enquiry", label: "Asked a question", count: 15, fromPrevious: 12.5 },
      ],
      weakest: { from: "Looked at a product", to: "Asked a question", fromKey: "product_view", toKey: "enquiry", rate: 12.5, entered: 120 },
      thin: null,
    },
  ];
}

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
    // SO THE RECORD OF A PRUNED BLOCK IS OBSERVABLE — 5 November 2026.
    // See section 2b: without this table the write lands nowhere and
    // the test can only assert a log line.
    audit_log: [],
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

describe("2. THE PRECONDITION — the BLOCK is refused, not the email", () => {
  // THIS TEST CHANGED ON 3 NOVEMBER 2026, with the founder's explicit
  // approval, and it was NOT loosened.
  //
  // It used to assert the whole email was dropped. That is what
  // happened to him that morning: one suggestion said "5 pages have no
  // search title" against an audit that had declared only the
  // complement, and he got SILENCE — no email, no reason, and the
  // explanation in a Vercel log he has never read. The figure was
  // refused in the safe direction; the silence was not safe, and
  // October's nine dead days taught the same lesson.
  //
  // The guarantee it protects is unchanged and still asserted below: a
  // figure nobody counted NEVER REACHES HIM. What changed is that the
  // rest of the email now does, and says how much was left out.

  /** A site whose finding states a figure the audit never declares. */
  function withAnUndeclaredFigure() {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`, website_id: "w1", slug: i === 0 ? "home" : `page-${i}`, title: "T",
      seo_title: i === 0 ? "A title" : null, meta_description: "d",
      is_fallback: false, content_source: "generated", sections: [],
    }));
    return db({
      website_pages: pages,
      goals: [{ id: "g1", dealership_id: "d1", title: "Give every page a search title", source_key: "pages_without_search_title", status: "active" }],
    });
  }

  it("THE FIGURE NOBODY COUNTED NEVER REACHES HIM", async () => {
    // The guarantee, stated as the guarantee. 300 is in no counted set.
    sends.length = 0;
    forbidModelCalls();
    const reportModule = await import("@/lib/growth/report");
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => {
      const built = (spy as any).getMockImplementation && null;
      void built;
      return {
        dealershipId: input.dealershipId, day: input.day,
        subject: `${input.businessName} — your daily check, nothing to flag`,
        counted: input.counted,
        blocks: [
          { kind: "line", text: "Traffic is up 300 percent.", numbers: [] },
          { kind: "line", text: "Nothing else to report.", numbers: [] },
        ],
      };
    }) as any);
    const { client } = withAnUndeclaredFigure();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    spy.mockRestore();

    expect(r.reportSound).toBe(false);
    expect(sends).toHaveLength(1);
    expect(sends[0].body).not.toMatch(/300/);
    expect(sends[0].body).not.toMatch(/Traffic is up/);
  });

  it("AND THE EMAIL STILL GOES, saying how much was left out", async () => {
    // Silence is the one outcome the owner cannot act on.
    sends.length = 0;
    forbidModelCalls();
    const reportModule = await import("@/lib/growth/report");
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => ({
      dealershipId: input.dealershipId, day: input.day,
      subject: `${input.businessName} — your daily check, nothing to flag`,
      counted: input.counted,
      blocks: [
        { kind: "line", text: "Traffic is up 300 percent.", numbers: [] },
        { kind: "line", text: "Nothing else to report.", numbers: [] },
      ],
    })) as any);
    const { client } = withAnUndeclaredFigure();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    spy.mockRestore();

    expect(r.sent).toBe(true);
    expect(r.notSentBecause).toBeNull();
    expect(r.blocksLeftOut).toBe(1);
    expect(sends[0].body).toMatch(/left 1 thing out of this email/);
    expect(sends[0].body).toMatch(/Nothing else to report/);
  });

  it("AND A FINDING THAT WAS NOT SHOWN IS NOT LEFT MARKED AS SHOWN", async () => {
    // pickToday writes last_surfaced_on BEFORE the report is built, so
    // on 3 November both findings were recorded as surfaced on a day
    // nothing was surfaced — the record saying he had seen something he
    // never saw.
    sends.length = 0;
    forbidModelCalls();
    const reportModule = await import("@/lib/growth/report");
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => ({
      dealershipId: input.dealershipId, day: input.day,
      subject: `${input.businessName} — 1 suggestion for today`,
      counted: input.counted,
      blocks: [
        // A suggestion block whose figure nothing declared, carrying the
        // real finding's title so the un-marking can match it.
        { kind: "suggestion", title: "5 pages have no search title", evidence: [{ kind: "website_page", id: "p1" }], goal: "Give every page a search title", numbers: [] },
      ],
    })) as any);
    const { client, tables } = withAnUndeclaredFigure();
    await runDailyGrowth(client, "d1", { now: NOW });
    spy.mockRestore();

    const surfaced = tables.opportunities.filter((o: any) => o.last_surfaced_on === TODAY);
    expect(surfaced).toEqual([]);
  });

  it("AND THE ONES HE DID SEE STAY MARKED AS SEEN", async () => {
    // The un-marking must take back only what was pruned. Clearing all
    // of them would put today's suggestions back into tomorrow's pool
    // on top of tomorrow's three, and the cap would be spent twice. The
    // first version of this guard had no test that reached the case:
    // one block kept, one block dropped.
    sends.length = 0;
    forbidModelCalls();
    const reportModule = await import("@/lib/growth/report");
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => ({
      dealershipId: input.dealershipId, day: input.day,
      subject: `${input.businessName} — 1 suggestion for today`,
      counted: input.counted,
      blocks: [
        // Kept: its figure is declared.
        { kind: "suggestion", title: "5 pages have no search title", evidence: [{ kind: "website_page", id: "p1" }], goal: "Give every page a search title", numbers: input.declared ?? input.counted },
        // Dropped: 300 is in no counted set.
        { kind: "suggestion", title: "300 pages have no search title", evidence: [{ kind: "website_page", id: "p2" }], goal: "Give every page a search title", numbers: input.declared ?? input.counted },
      ],
    })) as any);
    const { client, tables } = withAnUndeclaredFigure();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    spy.mockRestore();

    expect(r.blocksLeftOut).toBe(1);
    // The one real finding was shown, so its mark stands.
    const shown = tables.opportunities.filter((o: any) => o.last_surfaced_on === TODAY);
    expect(shown.map((o: any) => o.type)).toContain("pages_without_search_title");
  });

  it("and a sound report is sent whole, with nothing left out", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = withAnUndeclaredFigure();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.reportSound).toBe(true);
    expect(r.blocksLeftOut).toBe(0);
    expect(r.sent).toBe(true);
    expect(sends[0].body).not.toMatch(/left \d+ thing/);
  });
});

describe("2b. AND THE RECORD SAYS WHICH BLOCK — 5 November 2026", () => {
  // The founder's request. The email has said "I left 1 thing out of
  // this email" since 3 November, and the answer to "which thing" was a
  // `console.error` in Vercel's logs: a product that knew and said so
  // where nobody looks, which is the same shape as the fault the
  // pruning rule exists to fix.

  /** A report with one block stating a figure nothing counted. */
  async function withAPrunedBlock(client: any) {
    const reportModule = await import("@/lib/growth/report");
    const spy = vi.spyOn(reportModule, "buildDailyReport").mockImplementation(((input: any) => ({
      dealershipId: input.dealershipId,
      day: input.day,
      subject: `${input.businessName} — your daily check, nothing to flag`,
      counted: input.counted,
      blocks: [
        { kind: "line", text: "Traffic is up 300 percent.", numbers: [] },
        { kind: "line", text: "Nothing else to report.", numbers: [] },
      ],
    })) as any);
    try {
      return await runDailyGrowth(client, "d1", { now: NOW });
    } finally {
      spy.mockRestore();
    }
  }

  it("THE ROW NAMES THE BLOCK AND THE FIGURE THAT TOOK IT OUT", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client, tables } = db();
    const r = await withAPrunedBlock(client);

    expect(r.blocksLeftOut).toBe(1);
    // CARRIED OUT OF THE FUNCTION, not only counted. `blocksLeftOut`
    // told a caller something was missing and gave it no way to say
    // what.
    expect(r.leftOut).toEqual([{ block: "line", found: "300" }]);

    const row = tables.audit_log.find((a: any) => a.event_type === "report_blocks_left_out");
    expect(row, "nothing recorded which block was left out").toBeTruthy();
    expect(row.dealership_id).toBe("d1");
    expect(row.details.blocks).toEqual([{ block: "line", found: "300" }]);
    expect(row.details.day).toBe(TODAY);
    expect(row.summary).toContain('"300"');
    // AND THE EMAIL STILL WENT. The record is bookkeeping; it must not
    // have become a new way for the send to fail.
    expect(sends).toHaveLength(1);
    expect(sends[0].body).not.toMatch(/300/);
  });

  it("AND AN ORDINARY MORNING WRITES NO SUCH ROW", async () => {
    // Every run goes through this call. A row a day saying nothing was
    // left out would bury the mornings that matter.
    sends.length = 0;
    forbidModelCalls();
    const { client, tables } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.blocksLeftOut).toBe(0);
    expect(r.leftOut).toEqual([]);
    expect(tables.audit_log.filter((a: any) => a.event_type === "report_blocks_left_out")).toEqual([]);
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
    // S5/P4: AND NO TARGET EITHER, with the reason said. An unreadable
    // goals table read as "nothing has been offered" would draft a
    // fresh target for every funnel every single morning.
    expect(r.targetsDrafted).toBe(0);
    expect(r.noTargetsBecause).toMatch(/could not be read/);
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

  it("AND AN AI FAILURE WITH A NUMBER IN IT IS STILL NOT DROPPED", async () => {
    // A provider's error text carries digits — "try again in 42
    // seconds" — and nothing counted them. Since the block is now what
    // gets refused rather than the email, this is the ONE block that
    // must never be refused: "the AI is not working" does not depend on
    // a number. Its digits are stripped at build time instead.
    sends.length = 0;
    forbidModelCalls();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", {
      now: NOW,
      aiFailure: { kind: "rate_limited", message: "Too many requests — try again in 42 seconds." },
    });
    expect(r.sent).toBe(true);
    expect(r.blocksLeftOut).toBe(0);
    expect(sends[0].body).toMatch(/Too many requests/);
    expect(sends[0].body).not.toMatch(/42/);
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
      // THE WORDING CHANGED ON 3 NOVEMBER 2026 and the test with it.
      // It used to assert "could not finish checking your page copy",
      // which the email said while ALSO carrying a suggestion reading
      // "9 lines use wording your records do not support" with five
      // evidence ids. The copy audit has two layers; only the deeper
      // one had failed. The alert was describing the whole audit as
      // having failed and contradicted the body of its own email.
      expect(sends[0].body).toMatch(/could not finish the deeper check/);
      expect(sends[0].body).toMatch(/placeholders and for wording your records do not support/);
      // AND IT NO LONGER CLAIMS NOTHING WAS CHECKED.
      expect(sends[0].body).not.toMatch(/nothing below says anything about it/);
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

describe("9. the email that was dropped on 3 November 2026", () => {
  // END TO END, because every layer was individually fine. The audit
  // counted correctly, the Strategist picked correctly, the report built
  // correctly and its subject said "2 suggestions for today" — and then
  // the digit walk refused the whole thing over the "5" in "5 pages have
  // no search title", because the audit declared only the complement.
  // The owner got silence and the reason was a line in a Vercel log.

  /** Six pages, five with no search title: candle_by_qaaf that morning. */
  function sixPagesFiveUntitled() {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      website_id: "w1",
      slug: i === 0 ? "home" : `page-${i}`,
      title: "T",
      seo_title: i === 0 ? "A title" : null,
      meta_description: "d",
      is_fallback: false,
      content_source: "generated",
      sections: [],
    }));
    return db({
      website_pages: pages,
      // An active goal whose title matches the setup step, so the
      // finding links and becomes a suggestion — the state the
      // founder's two confirmations put the business into.
      goals: [
        { id: "g1", dealership_id: "d1", title: "Give every page a search title", source_key: "pages_without_search_title", status: "active" },
      ],
    });
  }

  it("A SUGGESTION WHOSE TITLE STATES A DEFICIT IS SENT, not dropped", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = sixPagesFiveUntitled();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.reportSound).toBe(true);
    expect(r.notSentBecause).toBeNull();
    expect(r.sent).toBe(true);
    expect(sends).toHaveLength(1);
  });

  it("AND THE NUMBER THAT DROPPED IT IS IN THE EMAIL", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = sixPagesFiveUntitled();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].body).toMatch(/5 pages have no search title/);
    expect(sends[0].body).toMatch(/Give every page a search title/);
  });

  it("AND THE EXTRA DECLARED NUMBERS ARE NOT PRINTED AS LINES", async () => {
    sends.length = 0;
    forbidModelCalls();
    const { client } = sixPagesFiveUntitled();
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].body).not.toMatch(/pages with no search title:/);
  });
});

describe("10. S5/P4 — the ready branch, which said nothing for a month", () => {
  // `maturityOf` has returned "ready" past 14 days and 20 events since
  // S4. Until now a business past that line with no approved goal was
  // told "no plan is approved yet, so the steps below are setup, not
  // targets" every morning — true, and permanent, because nothing ever
  // offered a target.
  //
  // THE FIXTURE IS ALREADY READY: 55 events over 45 days, like the real
  // business. See db().

  it("DRAFTS THE WEAKEST STEP AS A TARGET GOAL, AND NEVER ACTIVATES IT", async () => {
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client, tables } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(r.targetsDrafted).toBe(1);
    expect(r.noTargetsBecause).toBeNull();
    const target = tables.goals.find((g: any) => String(g.source_key).startsWith("target:"));
    expect(target).toBeTruthy();
    expect(target.status).toBe("draft");
    // NO TARGET NUMBER. The baseline is today's figure; a target would
    // be a forecast. See targets.ts's header.
    expect(target.target_value ?? null).toBeNull();
    expect(target.target_metric).toBe("Looked at a product to Asked a question");
  });

  it("AND THE EMAIL CALLS IT A TARGET, WITH EVERY FIGURE IN IT COUNTED", async () => {
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.sent).toBe(true);
    // THE REPORT PASSED ITS OWN NUMBER CHECK. A target's sentence
    // states three counted figures, and if they stopped being declared
    // the digit walk would prune the target out of the email — the
    // exact silence of 3 November, in a new place.
    expect(r.reportSound).toBe(true);
    expect(r.blocksLeftOut).toBe(0);
    // COUNTED APART from the setup steps beside it, so "2 setup steps"
    // and "1 target" stay two different statements about the morning.
    expect(r.setupSteps).toBe(2);
    expect(r.targetsDrafted).toBe(1);
    expect(sends[0].body).toMatch(/TARGET — Improve Looked at a product to Asked a question/);
    expect(sends[0].body).toMatch(/12\.5%/);
    expect(sends[0].subject).toMatch(/1 target to approve/);
  });

  it("AND A SECOND RUN OFFERS IT ONCE, not again", async () => {
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client, tables } = db();
    await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    const after = tables.goals.length;
    const second = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(second.goalsDrafted).toBe(0);
    expect(tables.goals).toHaveLength(after);
  });

  it("A LEARNING BUSINESS IS OFFERED NO TARGET, whatever the funnel says", async () => {
    // Fewer than 14 days of data. The thin branch owns this case, and
    // a target drawn from a week of traffic would be the invented
    // number this phase exists to refuse.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client, tables } = db({
      page_events: Array.from({ length: 55 }, () => ({ dealership_id: "d1", is_internal: false, created_at: "2026-10-22T10:00:00Z" })),
    });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.targetsDrafted).toBe(0);
    expect(tables.goals.some((g: any) => String(g.source_key).startsWith("target:"))).toBe(false);
    expect(sends[0].subject).not.toMatch(/target/);
  });

  it("AN UNREADABLE FUNNEL SAYS SO AND DOES NOT STOP THE RUN", async () => {
    // A funnel that could not be read is not a funnel with no weakest
    // step, and the difference has cost this project an email already.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = null;
    const { client } = db();
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.targetsDrafted).toBe(0);
    expect(r.noTargetsBecause).toMatch(/could not be read/);
    expect(r.sent).toBe(true);
  });

  it("THE SAME STEP COMES BACK AFTER 30 DAYS, AND NOT BEFORE", async () => {
    // The founder's answer, 4 November 2026. End to end, because the
    // date comes from a real `goals` row here rather than a fixture
    // handed to a pure function.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const old = {
      id: "g_old",
      dealership_id: "d1",
      source_key: "target:website_to_enquiry:product_view_to_enquiry:2026-09-23",
      status: "completed",
      created_at: "2026-09-23T06:00:00.000Z",
      title: "Improve Looked at a product to Asked a question",
    };
    const thirtyDays = db({ goals: [old] });
    const again = await runDailyGrowth(thirtyDays.client, "d1", { now: NOW, dryRun: true });
    expect(again.targetsDrafted).toBe(1);
    expect(thirtyDays.tables.goals.some((g: any) => g.source_key.endsWith(":2026-10-23"))).toBe(true);

    const yesterday = db({ goals: [{ ...old, source_key: "target:website_to_enquiry:product_view_to_enquiry:2026-10-22", created_at: "2026-10-22T06:00:00.000Z" }] });
    const tooSoon = await runDailyGrowth(yesterday.client, "d1", { now: NOW, dryRun: true });
    expect(tooSoon.targetsDrafted).toBe(0);
    // "1 day", not "1 days": since 5 November this sentence is shown to
    // the owner rather than logged, and section 10b asserts it in the
    // email body itself.
    expect(String(tooSoon.noTargetsBecause)).toMatch(/offered 1 day ago/);
    expect(yesterday.tables.goals).toHaveLength(1 + tooSoon.goalsDrafted);
  });

  it("AND A COMPLETED TARGET IS NO DIFFERENT FROM AN IGNORED ONE", async () => {
    // "chahe purana poora hua ho ya nahi". A draft he never acted on is
    // the step most worth raising again, and its numbers are a month
    // stale by then.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({
      goals: [
        {
          id: "g_old",
          dealership_id: "d1",
          source_key: "target:website_to_enquiry:product_view_to_enquiry:2026-09-01",
          status: "draft",
          created_at: "2026-09-01T06:00:00.000Z",
          title: "Improve Looked at a product to Asked a question",
        },
      ],
    });
    const r = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(r.targetsDrafted).toBe(1);
  });

  it("ANOTHER BUSINESS'S TARGET DOES NOT HOLD THIS ONE BACK", async () => {
    // The reader filters by dealership_id, and without a second
    // business in the fixture that filter is unreachable: dropping it
    // changed nothing and the mutation survived. With it dropped, this
    // business is told its step was offered yesterday — by somebody
    // else's account.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({
      goals: [
        {
          id: "g_other",
          dealership_id: "d2",
          source_key: "target:website_to_enquiry:product_view_to_enquiry:2026-10-22",
          status: "draft",
          created_at: "2026-10-22T06:00:00.000Z",
          title: "Somebody else's target",
        },
      ],
    });
    const r = await runDailyGrowth(client, "d1", { now: NOW, dryRun: true });
    expect(r.targetsDrafted).toBe(1);
  });

  it("and the daily run reads the funnel rather than counting again", () => {
    // loadDiagnosis is the one place that puts page_events and leads
    // together. A second count here would be a second answer.
    const src = code("src/lib/growth/dailyGrowth.ts");
    expect(src).toMatch(/loadDiagnosis/);
    expect(src).toMatch(/targetGoalsFrom/);
  });
});

describe("10b. THE TARGET THE OWNER NEVER SAW — 5 November 2026", () => {
  // WHAT HE REPORTED, AND IT WAS RIGHT. candle_by_qaaf's email of
  // 5 November carried two suggestions and no target, while `goals`
  // held two target drafts written that morning at 14:37 UTC.
  //
  // THE CAUSE WAS A GATE IN TWO PLACES. Targets were rendered inside
  // `hasNoPlan(maturity, activeGoals)` — in report.ts and again in
  // dailyGrowth.ts — and he has an approved plan, so neither the target
  // blocks nor any sentence about them reached him. The drafting was
  // never gated, so the rows went to the Tasks page regardless: the
  // email and the database disagreed, which is the worst of the three
  // possible behaviours.
  //
  // THE FIXTURE HERE HAS AN ACTIVE GOAL, which is what every section
  // above lacks. That is why none of them could catch this.

  const ACTIVE = {
    id: "g_active",
    dealership_id: "d1",
    status: "active",
    title: "Describe every product",
    source_key: "products_without_description",
    created_at: "2026-10-01T00:00:00.000Z",
  };

  it("A BUSINESS WITH AN APPROVED PLAN IS SHOWN ITS TARGET", async () => {
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client, tables } = db({ goals: [ACTIVE] });
    const r = await runDailyGrowth(client, "d1", { now: NOW });

    expect(r.sent).toBe(true);
    expect(r.targetsDrafted).toBe(1);
    // THE ROW AND THE EMAIL AGREE. On 5 November the row existed and
    // the email did not mention it, so both halves are asserted here
    // rather than in two tests that could pass apart.
    const target = tables.goals.find((g: any) => String(g.source_key ?? "").startsWith("target:"));
    expect(target).toBeTruthy();
    expect(target.status).toBe("draft");
    expect(sends[0].body).toContain(`TARGET — ${target.title}`);
    // AND NO SETUP STEPS BESIDE IT. Those keep the gate: "getting
    // started" is only true while there is nothing to score against.
    expect(r.setupSteps).toBe(0);
    expect(sends[0].body).not.toMatch(/SETUP STEP —/);
    // The number check still passes on a branch the gate used to make
    // unreachable.
    expect(r.reportSound).toBe(true);
    expect(r.blocksLeftOut).toBe(0);
  });

  it("AND THE SENTENCE ABOVE IT SAYS A TARGET IS WAITING", async () => {
    // planLine's with-plan branch ignored `targetsOffered` entirely, so
    // even with the blocks shown the email would have introduced them
    // with "Working to your plan." and nothing else.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({ goals: [ACTIVE] });
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].body).toContain("Working to your plan:");
    expect(sends[0].body).toContain("waiting on your Tasks page for you to approve");
  });

  it("AND THE SUBJECT SAYS SO TOO", async () => {
    // The one line he reads before deciding to open it. A decision
    // waiting on him must not be the thing that goes unmentioned there.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({ goals: [ACTIVE] });
    await runDailyGrowth(client, "d1", { now: NOW });
    expect(sends[0].subject).toMatch(/1 target to approve/);
  });

  it("AND WHEN THERE IS NO TARGET, THE EMAIL SAYS WHY INSTEAD OF NOTHING", async () => {
    // The funnel is too thin to name a weakest step. The sentence for
    // that case has existed since S5/P4 and was dropped by the call
    // site, so an owner read an email that did not mention targets at
    // all — indistinguishable from a product that had forgotten them.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = [
      {
        name: "Website to enquiry",
        steps: [
          { key: "visit", label: "Visited the site", count: 4, fromPrevious: null },
          { key: "enquiry", label: "Asked a question", count: 1, fromPrevious: 25 },
        ],
        weakest: null,
        thin: "Not enough traffic yet to name a weakest step — no step has had 10 or more people reach it in this window.",
      },
    ];
    const { client } = db({ goals: [ACTIVE] });
    const r = await runDailyGrowth(client, "d1", { now: NOW });

    expect(r.targetsDrafted).toBe(0);
    expect(sends[0].body).toContain("No new target for you to approve today.");
    expect(sends[0].body).toContain("no step has had 10 or more people reach it");
    // AND THE LINE SURVIVED THE DIGIT WALK. Its "10" is MIN_STEP_ENTRY,
    // declared beside it; without that declaration he would read
    // "I left 1 thing out of this email" in place of the reason.
    expect(r.blocksLeftOut).toBe(0);
    expect(r.reportSound).toBe(true);
  });

  it("AND THE 30-DAY WAIT IS EXPLAINED TO HIM, NOT ONLY TO THE LOG", async () => {
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({
      goals: [
        ACTIVE,
        {
          id: "g_old",
          dealership_id: "d1",
          source_key: "target:website_to_enquiry:product_view_to_enquiry:2026-10-22",
          status: "draft",
          created_at: "2026-10-22T06:00:00.000Z",
          title: "Improve Looked at a product to Asked a question",
        },
      ],
    });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.targetsDrafted).toBe(0);
    expect(sends[0].body).toContain("offered 1 day ago");
    expect(sends[0].body).toContain("after 30 days");
    expect(r.blocksLeftOut).toBe(0);
  });

  it("AND AN UNREADABLE FUNNEL REACHES HIM AS A SENTENCE", async () => {
    // Said, not swallowed. A funnel that could not be read is not a
    // funnel with no weakest step, and until today that difference
    // reached the run result and stopped there.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = null;
    const { client } = db({ goals: [ACTIVE] });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.sent).toBe(true);
    expect(sends[0].body).toContain("Your funnel could not be read this time");
    expect(r.blocksLeftOut).toBe(0);
  });

  it("and a still-learning business is told that instead, not both", async () => {
    // The plan line already says "still learning", and a second
    // sentence explaining the absence of a target would be telling him
    // the same thing twice in two voices.
    sends.length = 0;
    forbidModelCalls();
    funnelsNow = oneWeakStep();
    const { client } = db({
      goals: [ACTIVE],
      page_events: Array.from({ length: 55 }, () => ({ dealership_id: "d1", is_internal: false, created_at: "2026-10-22T10:00:00Z" })),
    });
    const r = await runDailyGrowth(client, "d1", { now: NOW });
    expect(r.targetsDrafted).toBe(0);
    expect(r.noTargetsBecause).toBeNull();
    expect(sends[0].body).not.toContain("No new target");
    expect(sends[0].body).toContain("Still learning:");
  });
});
