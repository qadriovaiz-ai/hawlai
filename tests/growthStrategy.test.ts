// S4/P1c — S, THIN BRANCH: "still learning", and setup goals.
//
// §2c's rule, and the one that decides whether this is honest: targets
// come from the business's OWN baseline, never from an industry
// average. So the test that matters most here is the negative one —
// that no goal can carry a number nobody counted about this business.
//
// And why S is in S4 at all, since it was not in the founder's scope
// line: P0 made `goal_id` required before a finding may be surfaced,
// because the exit test is "each suggestion cites evidence and the goal
// it serves". Without goals the daily report would be permanently
// empty.

import { describe, it, expect } from "vitest";
import {
  LEARNING_MIN_DAYS,
  LEARNING_MIN_EVENTS,
  draftTargetsAreOwn,
  maturityOf,
  setupGoalsFrom,
  stillLearningLine,
  hasNoPlan,
  planLine,
} from "@/lib/growth/strategy";
import { auditCatalogue, auditSite, type AuditFinding, type Counted } from "@/lib/growth/audit";

const NOW = new Date("2026-10-23T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("1. is there enough of this business's own history?", () => {
  it("THIN ON DAYS IS STILL LEARNING, however many events", () => {
    const m = maturityOf({ firstAt: daysAgo(3), events: 500 }, NOW);
    expect(m.kind).toBe("learning");
    expect(m.why).toMatch(/3 days of visitor data/);
  });

  it("THIN ON EVENTS IS STILL LEARNING, however many days", () => {
    const m = maturityOf({ firstAt: daysAgo(90), events: 4 }, NOW);
    expect(m.kind).toBe("learning");
    expect(m.why).toMatch(/4 visitor events/);
  });

  it("BOTH THRESHOLDS ARE §2c's, exactly", () => {
    expect(LEARNING_MIN_DAYS).toBe(14);
    expect(LEARNING_MIN_EVENTS).toBe(20);
    expect(maturityOf({ firstAt: daysAgo(13), events: 100 }, NOW).kind).toBe("learning");
    expect(maturityOf({ firstAt: daysAgo(14), events: 19 }, NOW).kind).toBe("learning");
    expect(maturityOf({ firstAt: daysAgo(14), events: 20 }, NOW).kind).toBe("ready");
  });

  it("NO DATA AND UNREADABLE DATA GIVE THE SAME ANSWER", () => {
    // A date this code cannot parse is not evidence of a long history.
    expect(maturityOf({ firstAt: null, events: 999 }, NOW).kind).toBe("learning");
    expect(maturityOf({ firstAt: "not a date", events: 999 }, NOW).kind).toBe("learning");
    expect(maturityOf({ firstAt: "not a date", events: 999 }, NOW).daysOfData).toBe(0);
  });

  it("and the line says which it is, in the owner's terms", () => {
    expect(stillLearningLine(maturityOf({ firstAt: daysAgo(2), events: 3 }, NOW))).toMatch(
      /^Still learning:.*setup, not targets\.$/
    );
    expect(stillLearningLine(maturityOf({ firstAt: daysAgo(40), events: 80 }, NOW))).toMatch(/^Working to your plan:/);
  });

  it("THERE ARE TWO WAYS TO HAVE NO PLAN, and the second one shipped into a dry run", () => {
    // candle_by_qaaf: 44 days and 55 events — past the threshold — and
    // ZERO goals. The still-learning branch did not apply, suggestions
    // need a goal and had none, so the owner was told "nothing to flag"
    // over two real findings. §2c's "instead" is about TARGETS, not
    // about whether findings are shown.
    const ready = maturityOf({ firstAt: daysAgo(44), events: 55 }, NOW);
    const thin = maturityOf({ firstAt: daysAgo(2), events: 3 }, NOW);
    expect(hasNoPlan(thin, 0)).toBe(true);
    expect(hasNoPlan(thin, 3)).toBe(true);
    expect(hasNoPlan(ready, 0)).toBe(true);
    expect(hasNoPlan(ready, 1)).toBe(false);
  });

  it("AND NEVER CLAIMS A PLAN THAT DOES NOT EXIST", () => {
    const ready = maturityOf({ firstAt: daysAgo(44), events: 55 }, NOW);
    expect(planLine(ready, 0)).toMatch(/No plan is approved yet/);
    expect(planLine(ready, 0)).not.toMatch(/Working to your plan/);
    expect(planLine(ready, 2)).toMatch(/^Working to your plan:/);
    expect(planLine(maturityOf({ firstAt: daysAgo(2), events: 3 }, NOW), 0)).toMatch(/^Still learning:/);
  });
});

describe("2. setup goals are DERIVED from the audit, never a starter list", () => {
  const counted: Counted[] = [
    { label: "pages", value: 4, source: "website_pages" },
    { label: "products", value: 6, source: "products" },
    { label: "lines with a placeholder", value: 2, source: "notCopy" },
  ];
  const finding = (type: string): AuditFinding => ({
    type,
    reference: "singleton",
    title: "t",
    detail: "d",
    score: { impact: 3, confidence: 3, effort: 2 },
    evidence: [{ kind: "website_page", id: "p1" }],
  });

  it("A BUSINESS WHOSE PAGES ALL HAVE TITLES GETS NO GOAL ABOUT TITLES", () => {
    // A fixed list of starter goals would be one trade's idea of a good
    // start shipped to every business.
    const goals = setupGoalsFrom([finding("products_without_description")], counted);
    expect(goals.map((g) => g.key)).toEqual(["products_without_description"]);
  });

  it("TAKES ITS TARGET FROM A COUNTED NUMBER OF THIS BUSINESS", () => {
    const goals = setupGoalsFrom([finding("pages_without_search_title")], counted);
    expect(goals[0].targetMetric).toBe("pages with a search title");
    expect(goals[0].targetValue).toBe(4); // this business has 4 pages
    expect(goals[0].basis.some((b) => b.kind === "counted" && b.id === "website_pages")).toBe(true);
  });

  it("AND A 'GET TO ZERO' GOAL IS STILL THE BUSINESS'S OWN NUMBER", () => {
    const goals = setupGoalsFrom([finding("live_copy_placeholder")], counted);
    expect(goals[0].targetValue).toBe(0);
    expect(goals[0].basis.some((b) => b.kind === "counted")).toBe(true);
  });

  it("NO COUNTED NUMBER MEANS NO TARGET — never an invented one", () => {
    // The goal still reaches the owner, because it is worth doing. It
    // simply arrives without a figure.
    const goals = setupGoalsFrom([finding("pages_without_search_title")], []);
    expect(goals).toHaveLength(1);
    expect(goals[0].targetValue).toBeNull();
    expect(goals[0].targetMetric).toBeNull();
  });

  it("EVERY TARGET TRACES TO THIS BUSINESS — the §2c rule, as one check", () => {
    const goals = setupGoalsFrom(
      ["pages_without_search_title", "products_without_image", "live_copy_placeholder", "site_unpublished"].map(finding),
      counted
    );
    expect(goals.length).toBe(4);
    expect(draftTargetsAreOwn(goals)).toBe(true);
    // And the guard can fail: a target with no counted basis is refused.
    expect(draftTargetsAreOwn([{ ...goals[0], basis: [{ kind: "website_page", id: "p1" }] }])).toBe(false);
  });

  it("one goal per finding type, not one per finding", () => {
    const goals = setupGoalsFrom([finding("products_without_image"), finding("products_without_image")], counted);
    expect(goals).toHaveLength(1);
  });

  it("and a finding nobody wrote a goal for is skipped, not guessed at", () => {
    expect(setupGoalsFrom([finding("something_new_nobody_mapped")], counted)).toEqual([]);
  });

  it("NAMES NO TRADE, in any goal", () => {
    const goals = setupGoalsFrom(Object.keys({
      site_missing: 1, site_unpublished: 1, pages_without_search_title: 1, pages_without_meta_description: 1,
      pages_still_fallback: 1, catalogue_empty: 1, products_without_description: 1, products_without_image: 1,
      products_priced_zero: 1, live_copy_placeholder: 1, live_copy_unsupported_wording: 1, live_copy_unsupported_claim: 1,
    }).map(finding), counted);
    expect(goals.length).toBe(12);
    for (const g of goals) {
      expect(`${g.title} ${g.description}`).not.toMatch(/candle|ghee|salon|dairy|paneer|keratin/i);
    }
  });

  it("AND THE COPY GOALS SAY NOTHING WAS CHANGED — R3", () => {
    const goals = setupGoalsFrom([finding("live_copy_unsupported_claim"), finding("live_copy_unsupported_wording")], counted);
    for (const g of goals) expect(g.description).toMatch(/Nothing has been changed/);
  });
});

describe("3. end to end over a real audit", () => {
  function db(tables: Record<string, any[]>) {
    return {
      from(table: string) {
        const filters: Record<string, any> = {};
        const rows = () => (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => (k in r ? r[k] === v : true)));
        const chain: any = {
          select: () => chain,
          eq(c: string, v: any) { filters[c] = v; return chain; },
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (resolve: any) => resolve({ data: rows(), error: null }),
        };
        return chain;
      },
    };
  }

  it("A NEW BUSINESS GETS SETUP GOALS WITH ITS OWN NUMBERS IN THEM", async () => {
    const client = db({
      websites: [{ id: "w1", published: false, dealership_id: "d1" }],
      website_pages: [
        { id: "p1", website_id: "w1", seo_title: null, meta_description: null, is_fallback: true },
        { id: "p2", website_id: "w1", seo_title: null, meta_description: "d", is_fallback: false },
      ],
      products: [{ id: "x1", dealership_id: "d1", description: null, price: 0, images: [] }],
    });
    const site = await auditSite(client, "d1");
    const catalogue = await auditCatalogue(client, "d1");
    const goals = setupGoalsFrom([...site.findings, ...catalogue.findings], [...site.counted, ...catalogue.counted]);

    expect(goals.map((g) => g.key).sort()).toEqual([
      "pages_still_fallback",
      "pages_without_meta_description",
      "pages_without_search_title",
      "products_priced_zero",
      "products_without_description",
      "products_without_image",
      "site_unpublished",
    ]);
    // Its own two pages and its own one product, nothing borrowed.
    expect(goals.find((g) => g.key === "pages_without_search_title")!.targetValue).toBe(2);
    expect(goals.find((g) => g.key === "products_without_description")!.targetValue).toBe(1);
    expect(draftTargetsAreOwn(goals)).toBe(true);
  });
});
