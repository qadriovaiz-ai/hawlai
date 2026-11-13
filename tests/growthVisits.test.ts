// A visitor's pages, grouped into a visit — V2.
//
// V1 recorded WHICH page. This makes a sequence of pages into something
// you can reason about: three pages in one sitting is a visit, three
// pages a week apart is three. V3's intent score needs that, because
// "looked at pricing twice" means twice in one sitting.
//
// THE TESTS THAT MATTER HERE ARE THE ONES ABOUT WHAT CANNOT BE KNOWN.
// A visit boundary is a convention, a duration is always an undercount,
// and only a consented visitor can be grouped at all. Each of those is
// a place where the obvious implementation states something it has not
// measured.

import { describe, it, expect } from "vitest";
import { groupIntoVisits, summarise, readVisits, VISIT_GAP_MINUTES } from "@/lib/growth/visits";
import { code } from "./helpers/source";

const ID = "v-1";

/** An event, with the shape page_events gives. */
function ev(minutesFromStart: number, path = "/", visitor = ID, type = "view") {
  const base = Date.parse("2026-11-13T09:00:00Z");
  return {
    visitor_id: visitor,
    created_at: new Date(base + minutesFromStart * 60_000).toISOString(),
    path,
    event_type: type,
  };
}

describe("1. WHERE A VISIT ENDS IS A CONVENTION", () => {
  it("THE GAP IS ONE NAMED CONSTANT, so it can be argued with", () => {
    // Thirty minutes is what every analytics tool uses, so an owner
    // comparing two numbers compares like with like. It is not a fact
    // about his customers, and a literal buried in a loop would read as
    // one.
    expect(VISIT_GAP_MINUTES).toBe(30);
  });

  it("PAGES WITHIN THE GAP ARE ONE VISIT", () => {
    const visits = groupIntoVisits([ev(0, "/a"), ev(5, "/b"), ev(25, "/c")]);
    expect(visits).toHaveLength(1);
    expect(visits[0].pages).toEqual(["/a", "/b", "/c"]);
  });

  it("AND A LONGER PAUSE STARTS A NEW ONE", () => {
    const visits = groupIntoVisits([ev(0, "/a"), ev(31, "/b")]);
    expect(visits).toHaveLength(2);
  });

  it("THE GAP IS MEASURED FROM THE LAST EVENT, not from the start", () => {
    // Somebody reading for an hour with no pause longer than the gap is
    // on ONE visit — that is what a sitting is. Measuring from the
    // start would cut them off mid-read.
    const visits = groupIntoVisits([ev(0), ev(25), ev(50), ev(75)]);
    expect(visits).toHaveLength(1);
    expect(visits[0].pageViews).toBe(4);
  });

  it("exactly the gap is still the same visit, one second more is not", () => {
    expect(groupIntoVisits([ev(0), ev(30)])).toHaveLength(1);
    expect(groupIntoVisits([ev(0), ev(30.1)])).toHaveLength(2);
  });
});

describe("2. A DURATION IS ALWAYS AN UNDERCOUNT, AND SOMETIMES UNKNOWABLE", () => {
  it("A ONE-EVENT VISIT HAS NULL DURATION, NOT ZERO", () => {
    // THE LOAD-BEARING ONE. Nothing records a page closing, so one
    // timestamp says nothing about how long it lasted. Zero would read
    // as "they left immediately", which is a claim.
    const visits = groupIntoVisits([ev(0, "/a")]);
    expect(visits[0].measuredSeconds).toBeNull();
    expect(visits[0].measuredSeconds).not.toBe(0);
  });

  it("AND A LONGER VISIT MEASURES FIRST TO LAST", () => {
    const visits = groupIntoVisits([ev(0), ev(10)]);
    expect(visits[0].measuredSeconds).toBe(600);
  });

  it("the summary counts how many could be timed at all", () => {
    const visits = groupIntoVisits([ev(0, "/a"), ev(5, "/b"), ev(600, "/c")]);
    const s = summarise(visits);
    expect(s.visits).toBe(2);
    expect(s.measurable).toBe(1);
    // AND BOTH ARE DECLARED, or the report prunes the block that names
    // them. Mutation M10 dropped the declaration and survived, because
    // this only checked the value on the object.
    const labels = s.counted.map((c) => c.label);
    expect(labels).toContain("visits");
    expect(labels).toContain("visits long enough to time");
    for (const c of s.counted) expect(c.source, c.label).toBe("page_events");
  });

  it("THE TYPICAL VISIT IS THE MEDIAN, NOT THE MEAN", () => {
    // One tab left open overnight moves a mean enough to make a
    // sentence about "how long people stay" untrue, and at thirty
    // visits a month one outlier IS most of the average.
    const short = [ev(0, "/a", "a"), ev(1, "/b", "a")];
    const alsoShort = [ev(0, "/a", "b"), ev(1, "/b", "b")];
    const enormous = [ev(0, "/a", "c"), ev(20, "/b", "c")];
    const s = summarise(groupIntoVisits([...short, ...alsoShort, ...enormous]));
    expect(s.medianSeconds).toBe(60);
    // The mean would be 440 — more than seven times the typical visit.
    expect(s.medianSeconds).not.toBe(440);
  });

  it("and no measurable visit means no number, not zero seconds", () => {
    const s = summarise(groupIntoVisits([ev(0, "/a", "a"), ev(0, "/a", "b")]));
    expect(s.visits).toBe(2);
    expect(s.medianSeconds).toBeNull();
  });
});

describe("3. ONLY A CONSENTED VISITOR CAN BE GROUPED", () => {
  it("EVENTS WITH NO VISITOR ID ARE DROPPED, not bundled together", () => {
    // visitor_id is withheld without consent, by design. Bundling them
    // would make one "visit" out of forty strangers, which is worse
    // than no visit at all.
    const visits = groupIntoVisits([
      { visitor_id: null, created_at: "2026-11-13T09:00:00Z", path: "/a", event_type: "view" },
      { visitor_id: "", created_at: "2026-11-13T09:01:00Z", path: "/b", event_type: "view" },
      ev(0, "/c"),
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0].pages).toEqual(["/c"]);
  });

  it("AND THE READ ASKS THE DATABASE FOR THAT, rather than filtering after", () => {
    const src = code("src/lib/growth/visits.ts");
    const reader = src.slice(src.indexOf("export async function readVisits"));
    expect(reader.length).toBeGreaterThan(200);
    expect(reader).toMatch(/\.not\("visitor_id", "is", null\)/);
    expect(reader).toMatch(/\.eq\("is_internal", false\)/);
  });

  it("two visitors at the same moment are two visits", () => {
    const visits = groupIntoVisits([ev(0, "/a", "one"), ev(0, "/a", "two")]);
    expect(visits).toHaveLength(2);
  });
});

describe("4. WHAT THE GROUPING COUNTS", () => {
  it("DISTINCT PAGES, IN THE ORDER FIRST SEEN", () => {
    const visits = groupIntoVisits([ev(0, "/a"), ev(1, "/b"), ev(2, "/a")]);
    expect(visits[0].pages).toEqual(["/a", "/b"]);
  });

  it("AND HOW OFTEN THE BUSIEST PAGE WAS SEEN — the 'twice' V3 needs", () => {
    const visits = groupIntoVisits([ev(0, "/pricing"), ev(1, "/a"), ev(2, "/pricing")]);
    expect(visits[0].mostSeenPageCount).toBe(2);
    // ONE PAGE, SEEN TWICE. The fixture above has two distinct pages
    // AND a busiest count of two, so counting distinct pages instead
    // gave the same answer and mutation M16 survived. Here they differ.
    const twice = groupIntoVisits([ev(0, "/pricing"), ev(1, "/pricing")]);
    expect(twice[0].pages).toHaveLength(1);
    expect(twice[0].mostSeenPageCount).toBe(2);
  });

  it("PAGE VIEWS COUNT ONLY view EVENTS", () => {
    // A click, a chat opening and a form being started are all rows in
    // page_events. Counting them as views is the mistake V2 fixes in
    // the report.
    const visits = groupIntoVisits([ev(0, "/a", ID, "view"), ev(1, "/a", ID, "click"), ev(2, "/a", ID, "chat_open")]);
    expect(visits[0].pageViews).toBe(1);
  });

  it("an event with no path still belongs to the visit", () => {
    // A chat opening has no page of its own; it is still part of the
    // sitting.
    const visits = groupIntoVisits([ev(0, "/a"), { visitor_id: ID, created_at: "2026-11-13T09:02:00Z", path: null, event_type: "chat_open" }]);
    expect(visits).toHaveLength(1);
    expect(visits[0].pages).toEqual(["/a"]);
  });

  it("AN UNREADABLE TIMESTAMP IS DROPPED, not placed by guesswork", () => {
    const visits = groupIntoVisits([
      { visitor_id: ID, created_at: "not a date", path: "/x", event_type: "view" },
      ev(0, "/a"),
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0].pages).toEqual(["/a"]);
  });

  it("and nothing in means nothing out, without throwing", () => {
    expect(groupIntoVisits([])).toEqual([]);
    expect(groupIntoVisits(null)).toEqual([]);
    expect(groupIntoVisits(undefined)).toEqual([]);
  });
});

describe("5. A FAILED READ IS NOT A WEEK WITH NO VISITS", () => {
  function db(rows: any[] | null, fail = false) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      gte: () => chain,
      order: () => (fail ? Promise.resolve({ data: null, error: { message: "boom" } }) : Promise.resolve({ data: rows, error: null })),
    };
    return { from: () => chain } as any;
  }

  it("IT RETURNS NULL, so the caller says nothing rather than 'nobody came'", async () => {
    expect(await readVisits(db(null, true), "d1")).toBeNull();
  });

  it("and a real read groups what it finds", async () => {
    const visits = await readVisits(db([ev(0, "/a"), ev(5, "/b")]), "d1");
    expect(visits).not.toBeNull();
    expect(visits!).toHaveLength(1);
  });
});

describe("6. THE REPORT STOPS CALLING PAGE VIEWS 'VISITS'", () => {
  // A correction owed: R4 counted page_events ROWS and labelled them
  // visits, so one visitor clicking eight times read as eight visits.
  const comparison = () => code("src/lib/growth/comparison.ts");

  it("THE WEEK-OVER-WEEK MEASURE COUNTS view EVENTS ONLY", () => {
    const src = comparison();
    const fn = src.slice(src.indexOf("export async function visitorsWeekOverWeek"));
    expect(fn.length).toBeGreaterThan(300);
    expect(fn).toMatch(/\.eq\("event_type", "view"\)/);
  });

  it("AND CALLS THEM PAGE VIEWS", () => {
    const src = comparison();
    expect(src).toMatch(/page views in the last 7 days/);
    expect(src).not.toMatch(/"visits in the last 7 days"/);
  });

  it("THE REPORT SAYS BOTH, because they answer different questions", () => {
    const report = code("src/lib/growth/dailyGrowth.ts");
    expect(report).toMatch(/readVisits\(supabase, dealershipId/);
    expect(report).toMatch(/Page views: /);
    expect(report).toMatch(/Visits: /);
  });

  it("AND SAYS WHY VISITS ARE THE SMALLER NUMBER", () => {
    // Only a consented visitor can be grouped, so a report that gave
    // both without saying so would look like it had lost people.
    const report = code("src/lib/growth/dailyGrowth.ts");
    expect(report).toMatch(/accepted cookies/);
  });
});
