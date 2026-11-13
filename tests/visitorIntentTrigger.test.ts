// Leads whose browsing says they are interested — V5b.
//
// The workflow engine's three triggers are all CRM facts: a lead was
// created, converted, or booked. This is the first that is about what
// the person actually DID, and it is what the whole visitor engine was
// built to feed.
//
// THE TESTS THAT MATTER: a lead we cannot connect to any browsing is
// never triggered, and the day counter starts at the VISIT.

import { describe, it, expect } from "vitest";
import { intentTriggeredLeads, INTENT_LOOKBACK_DAYS } from "@/lib/automation/visitorIntentTrigger";
import { code } from "./helpers/source";

const SITE = "/site/acme";
const DAY = 86_400_000;

/** A page_events row as readVisits selects it. */
function ev(visitor: string, minutesAgo: number, path: string, now: number) {
  return {
    visitor_id: visitor,
    created_at: new Date(now - minutesAgo * 60_000).toISOString(),
    path,
    event_type: "view",
  };
}

/**
 * A database that answers the four reads this makes, and RECORDS the
 * filters it was given — because half of what matters here is which
 * leads the query refuses to return.
 */
function db(opts: {
  site?: any;
  pages?: any[];
  pagesError?: any;
  events?: any[];
  eventsError?: any;
  leads?: any[];
  leadsError?: any;
}) {
  const filters: Record<string, any> = {};
  const nots: string[] = [];
  const client = {
    from(table: string) {
      if (table === "websites") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: opts.site ?? { id: "w1" }, error: null }),
        };
        return chain;
      }
      if (table === "website_pages") {
        const chain: any = {
          select: () => chain,
          eq: () =>
            Promise.resolve(
              opts.pagesError ? { data: null, error: opts.pagesError } : { data: opts.pages ?? [], error: null }
            ),
        };
        return chain;
      }
      if (table === "page_events") {
        const chain: any = {
          select: () => chain,
          eq: (col: string, v: any) => {
            filters[col] = v;
            return chain;
          },
          not: (col: string) => {
            nots.push(col);
            return chain;
          },
          gte: () => chain,
          order: () =>
            Promise.resolve(
              opts.eventsError ? { data: null, error: opts.eventsError } : { data: opts.events ?? [], error: null }
            ),
        };
        return chain;
      }
      // leads
      //
      // AN ERROR CARRIES NO ROWS, which is what PostgREST does and what
      // this fake did not: it returned `data: []` beside an error, so
      // dropping the error check still produced an empty array and a
      // mutation survived. A fake that is kinder than the database
      // tests a guard that is never exercised.
      const chain: any = {
        select: () => chain,
        eq: (col: string, v: any) => {
          filters[`leads.${col}`] = v;
          return chain;
        },
        not: (col: string) => {
          nots.push(`leads.${col}`);
          return chain;
        },
        in: (col: string, vals: any[]) => {
          filters[`leads.in.${col}`] = vals;
          return chain;
        },
        limit: () =>
          Promise.resolve(
            opts.leadsError ? { data: null, error: opts.leadsError } : { data: opts.leads ?? [], error: null }
          ),
      };
      return chain;
    },
  } as any;
  return { client, filters, nots };
}

/** A visit that scores high: checkout alone clears the band. */
function highIntent(visitor: string, now: number, minutesAgo = 60) {
  return [
    ev(visitor, minutesAgo, `${SITE}/checkout`, now),
    ev(visitor, minutesAgo - 1, `${SITE}/reach`, now),
  ];
}

const DECLARED = [{ slug: "reach", page_type: "contact" }];

describe("1. A LEAD WE CANNOT CONNECT TO ANY BROWSING IS NEVER TRIGGERED", () => {
  it("THE QUERY REFUSES A NULL visitor_id", async () => {
    // THE LOAD-BEARING ONE. Null means "we cannot connect this person
    // to any browsing", never "they browsed nothing" — so they are left
    // out silently rather than guessed at. Asked of the database, not
    // filtered afterwards.
    const now = Date.now();
    const { client, nots } = db({ pages: DECLARED, events: highIntent("v1", now), leads: [] });
    await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(nots).toContain("leads.visitor_id");
    expect(nots).toContain("leads.email");
  });

  it("AND AN OPTED-OUT LEAD, in the query like every other trigger", async () => {
    const now = Date.now();
    const { client, filters } = db({ pages: DECLARED, events: highIntent("v1", now), leads: [] });
    await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(filters["leads.dnd_opt_out"]).toBe(false);
    expect(filters["leads.dealership_id"]).toBe("d1");
  });

  it("ONLY THE VISITORS WHO ACTUALLY SCORED HIGH ARE LOOKED UP", async () => {
    // Not "every lead with a visitor id" — the behaviour decides, and
    // the lead query is narrowed to it.
    const now = Date.now();
    const events = [...highIntent("keen", now), ev("idle", 30, `${SITE}`, now)];
    const { client, filters } = db({ pages: DECLARED, events, leads: [] });
    await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(filters["leads.in.visitor_id"]).toEqual(["keen"]);
  });

  it("the owner's own visits are already excluded by the visits reader", async () => {
    const now = Date.now();
    const { client, filters } = db({ pages: DECLARED, events: [], leads: [] });
    await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(filters["is_internal"]).toBe(false);
  });
});

describe("2. THE DAY COUNTER STARTS AT THE VISIT, NOT THE LEAD", () => {
  it("triggerDate IS THE VISIT'S OWN START", async () => {
    // `delay_days` counts from this. Using the lead's created_at would
    // fire "day 2" on an old lead the moment the workflow is switched
    // on — the mistake migration 134 already fixed for lead_converted.
    const now = Date.now();
    const events = highIntent("v1", now, 120);
    const { client } = db({
      pages: DECLARED,
      events,
      leads: [{ id: "L1", name: "A", email: "a@b.test", visitor_id: "v1" }],
    });
    const out = await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(out).toHaveLength(1);
    // The visit started at the EARLIEST of its events.
    const earliest = events.map((e) => e.created_at).sort()[0];
    expect(out[0].triggerDate).toBe(earliest);
    expect(out[0].leadId).toBe("L1");
    expect(out[0].score).toBeGreaterThan(0);
  });

  it("THE LOOKBACK IS A NAMED CONSTANT, so it can be argued with", () => {
    // It decides who gets emailed when a workflow is switched on.
    expect(INTENT_LOOKBACK_DAYS).toBe(14);
    const src = code("src/lib/automation/visitorIntentTrigger.ts");
    const call = src.slice(src.indexOf("readVisits(supabase"));
    expect(call.slice(0, 160)).toMatch(/sinceDays: INTENT_LOOKBACK_DAYS/);
  });

  it("ONE LEAD PER VISITOR — their best visit, not every visit", async () => {
    // Somebody who came back three times is one person to follow up
    // with once; handing the engine the same lead three times would
    // make the count in the log a lie.
    const now = Date.now();
    const events = [...highIntent("v1", now, 600), ...highIntent("v1", now, 60)];
    const { client } = db({
      pages: DECLARED,
      events,
      leads: [{ id: "L1", name: "A", email: "a@b.test", visitor_id: "v1" }],
    });
    const out = await intentTriggeredLeads(client, "d1", { now: new Date(now) });
    expect(out).toHaveLength(1);
  });
});

describe("3. A FAILED READ TRIGGERS NOBODY, RATHER THAN EVERYBODY OR NOBODY WRONGLY", () => {
  it("UNREADABLE PAGE KINDS TRIGGER NOBODY", async () => {
    // Scoring against null classifies every page as unidentifiable and
    // scores every visit near zero — which would read as "nobody was
    // interested" rather than "we could not tell".
    //
    // THE FIXTURE NEEDS A LEAD, or the guard's absence cannot change
    // the answer: without one the function returns [] either way and a
    // mutation that deletes the guard survives. The visit below is a
    // CHECKOUT, which `pageKind` classifies from this application's own
    // route table with no declarations at all — so scoring would still
    // reach the high band and this lead would be emailed about browsing
    // nobody could interpret.
    const now = Date.now();
    const { client } = db({
      pagesError: { message: "boom" },
      events: highIntent("v1", now),
      leads: [{ id: "L1", name: "A", email: "a@b.test", visitor_id: "v1" }],
    });
    expect(await intentTriggeredLeads(client, "d1", { now: new Date(now) })).toEqual([]);
  });

  it("AN UNREADABLE EVENTS READ TRIGGERS NOBODY", async () => {
    const now = Date.now();
    const { client } = db({ pages: DECLARED, eventsError: { message: "boom" } });
    expect(await intentTriggeredLeads(client, "d1", { now: new Date(now) })).toEqual([]);
  });

  it("AND AN UNREADABLE LEADS READ TRIGGERS NOBODY", async () => {
    const now = Date.now();
    const { client } = db({
      pages: DECLARED,
      events: highIntent("v1", now),
      leads: [{ id: "L1", name: "A", email: "a@b.test", visitor_id: "v1" }],
      leadsError: { message: "boom" },
    });
    expect(await intentTriggeredLeads(client, "d1", { now: new Date(now) })).toEqual([]);
  });

  it("nothing interesting happened is simply nobody", async () => {
    const now = Date.now();
    const { client } = db({ pages: DECLARED, events: [ev("v1", 10, `${SITE}`, now)], leads: [] });
    expect(await intentTriggeredLeads(client, "d1", { now: new Date(now) })).toEqual([]);
  });

  it("a business with no site gets an empty map and still triggers nobody", async () => {
    const now = Date.now();
    const { client } = db({ site: null, events: highIntent("v1", now), leads: [] });
    expect(await intentTriggeredLeads(client, "d1", { now: new Date(now) })).toEqual([]);
  });
});

describe("4. IT IS WIRED INTO THE ENGINE THE SAME WAY THE OTHERS ARE", () => {
  const engine = () => code("src/lib/automation/workflowEngine.ts");

  it("THE ENGINE HAS A BRANCH FOR IT", () => {
    const src = engine();
    const fn = src.slice(src.indexOf("async function getTriggeredLeads"));
    const body = fn.slice(0, fn.indexOf("\n  return [];"));
    expect(body).toMatch(/workflow\.trigger_type === "visitor_intent"/);
    expect(body).toMatch(/return intentTriggeredLeads\(supabase, dealershipId\)/);
  });

  it("AND NOTHING ABOUT SENDING CHANGED", () => {
    // Rule 6 is satisfied by the path this joins, not by anything new:
    // the workflow is the owner's, `enabled` defaults false, DND and
    // the unsubscribe list are checked before a step writes an email,
    // and AI-written steps are checked against the business's facts.
    const src = engine();
    expect(src).toMatch(/suppressedAmong\(supabase, dealershipId/);
    expect(src).toMatch(/gatherBusinessFactsSafely\(supabase, dealershipId\)/);
    expect(src).toMatch(/\.eq\("enabled", true\)/);
  });

  it("THE OWNER CAN PICK IT, and in their own words", () => {
    const src = code("src/components/automation/WorkflowBuilder.tsx");
    expect(src).toMatch(/key: "visitor_intent"/);
    // No jargon: "visitor_intent" is our word, not a business owner's.
    const row = src.slice(src.indexOf('key: "visitor_intent"'));
    expect(row.slice(0, 120)).toMatch(/label: "Showed Strong Interest On Your Site"/);
  });

  it("and chat can create one too", () => {
    const src = code("src/lib/businessBrain/toolSchemas.ts");
    expect(src).toMatch(/"new_lead", "appointment_booked", "lead_converted", "visitor_intent"/);
  });
});
