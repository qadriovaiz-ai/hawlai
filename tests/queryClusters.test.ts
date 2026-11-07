// Grouping the searches people really made (G2 of
// docs/AUDIT-GROWTH-LOOP.md).
//
// A CORRECTION TO THE AUDIT FIRST, because the founder acted on what it
// said. It claimed `competitor_keywords` "invents ten". It does — but
// only for a business with no Search Console connection.
// `REAL_DATA_INSTRUCTIONS` already swaps the static instruction for the
// real terms with Google's own counts the moment a connection exists,
// and tests/searchQueries.test.ts has asserted that since migration 201.
// The audit overstated it, and the audit now says so.
//
// WHAT WAS GENUINELY MISSING is grouping. Even with a connection, a
// model is handed a flat list and returns ten individual terms. "These
// five searches are the same subject and together they are 180
// impressions" is a computed fact nobody computed — and it is the fact
// that tells an owner whether a subject is worth an afternoon.
//
// DETERMINISTIC AND MODEL-FREE, which is the point rather than a saving:
// a model asked to group searches groups them slightly differently each
// time, and a grouping that moves cannot be compared month to month.
// That is the reasoning that fixed `aeoQuestions` in code, applied
// again.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

import {
  MIN_CLUSTER_SIZE,
  clusterFor,
  clusterQueries,
  clusterSummary,
  contentWords,
} from "@/lib/seo/queryClusters";
import { marketOpportunities } from "@/lib/opportunities/marketOpportunities";

const q = (query: string, impressions: number, clicks = 0, position = 12): any => ({
  query,
  impressions,
  clicks,
  position,
  ctr: 0,
});

// ---------------------------------------------------------------------
describe("1. SEARCHES ABOUT ONE THING BECOME ONE GROUP", () => {
  it("THE SUBJECT IS THE WORD THEY SHARE", () => {
    const clusters = clusterQueries([q("soy candles", 90), q("soy candles gift box", 60), q("best soy candles india", 40)]);
    expect(clusters.length).toBe(1);
    // "soy" and "candles" both appear three times, so the alphabetical
    // tie-break picks "candles". That is the rule working, and it is why
    // the rule exists: without it these three searches could be filed
    // under either word on different runs.
    expect(clusters[0].subject).toBe("candles");
    expect(clusters[0].queries.map((x) => x.query)).toEqual(["soy candles", "soy candles gift box", "best soy candles india"]);
  });

  it("AND THE TOTAL IS SUMMED FROM GOOGLE'S OWN FIGURES", () => {
    const clusters = clusterQueries([q("soy candles", 90, 2), q("soy candles gift box", 60, 1)]);
    expect(clusters[0].impressions).toBe(150);
    expect(clusters[0].clicks).toBe(3);
  });

  it("THE STRONGEST SEARCH IS FIRST INSIDE THE GROUP", () => {
    const clusters = clusterQueries([q("soy candles gift box", 40), q("soy candles", 200)]);
    expect(clusters[0].queries[0].query).toBe("soy candles");
  });

  it("AND THE STRONGEST GROUP IS FIRST", () => {
    // THE SUBJECTS ARE NAMED SO DISCOVERY ORDER AND STRENGTH ORDER
    // DISAGREE, which two earlier versions of this fixture failed to do.
    // "apple" wins the alphabetical tie-break and so is found FIRST,
    // while "zebra" has the impressions and so must be REPORTED first.
    // A fixture where the two orders agree cannot test the sort at all.
    const clusters = clusterQueries([
      q("apple thing", 20),
      q("apple other", 10),
      q("zebra thing", 300),
      q("zebra other", 200),
    ]);
    expect(clusters.map((c) => c.subject)).toEqual(["zebra", "apple"]);
    expect(clusters[0].impressions).toBe(500);
  });

  it("AND TWO EQUALLY STRONG SUBJECTS ARE ORDERED ALPHABETICALLY", () => {
    // DISCOVERED IN THE WRONG ORDER, ON PURPOSE. "zebra" is in three
    // searches and "apple" in two, so zebra is found FIRST — it is the
    // more common word. Their totals are equal, so the impressions
    // cannot separate them and only the alphabetical tie-break can.
    //
    // The earlier fixture gave both subjects the same number of searches,
    // which meant the word-level tie-break had already ordered them
    // alphabetically before this sort ran — so deleting this one changed
    // nothing.
    const clusters = clusterQueries([
      q("zebra one", 34),
      q("zebra two", 33),
      q("zebra three", 33),
      q("apple four", 50),
      q("apple five", 50),
    ]);
    expect(clusters.map((c) => c.subject)).toEqual(["apple", "zebra"]);
    expect(clusters[0].impressions).toBe(clusters[1].impressions);
  });

  it("the best position in the group is the lowest number, and null when there is none", () => {
    const clusters = clusterQueries([q("soy candles", 90, 0, 14.2), q("soy candles gift box", 60, 0, 6.5)]);
    expect(clusters[0].bestPosition).toBe(6.5);
    const noPos = clusterQueries([q("soy candles", 90, 0, 0), q("soy candles gift box", 60, 0, NaN)]);
    expect(noPos[0].bestPosition).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("2. A COUNTED NUMBER NEVER ADDS UP TO MORE THAN GOOGLE REPORTED", () => {
  it("EVERY SUBJECT IS STILL FOUND, so nothing is lost to an early stop", () => {
    // THE SYMPTOM THE LOOP GUARD CHANGED. Before it, failing to remove a
    // group's members spun forever; now the pass makes no progress and
    // the loop stops — so the failure shows up as SUBJECTS GOING
    // MISSING rather than as duplicates. This is the test the guard made
    // possible, and the duplicate check below still covers the other.
    const clusters = clusterQueries([
      q("widget delivery", 90),
      q("widget delivery charges", 60),
      q("gadget repair", 80),
      q("gadget repair cost", 70),
    ]);
    expect(clusters.length).toBe(2);
    expect(clusters.map((c) => c.subject).sort()).toEqual(["delivery", "gadget"]);
  });

  it("A SEARCH BELONGS TO ONE GROUP ONLY", () => {
    // "soy candle gift box" contains both "soy" and "gift"; counting it
    // twice would make the totals exceed the demand Google reported,
    // which is the one thing a counted number must never do.
    const rows = [q("soy candles", 100), q("soy candle gift box", 50), q("gift box wrapping", 40), q("gift box ideas", 30)];
    const clusters = clusterQueries(rows);
    const counted = clusters.flatMap((c) => c.queries.map((x) => x.query));
    expect(new Set(counted).size).toBe(counted.length);
    const total = clusters.reduce((n, c) => n + c.impressions, 0);
    expect(total).toBeLessThanOrEqual(rows.reduce((n, r) => n + r.impressions, 0));
  });

  it("AND EVERY GROUPED SEARCH IS ONE OF THE ONES THAT WENT IN", () => {
    const rows = [q("soy candles", 90), q("soy candles gift box", 60)];
    const grouped = clusterQueries(rows).flatMap((c) => c.queries);
    for (const g of grouped) expect(rows.some((r) => r.query === g.query)).toBe(true);
  });
});

// ---------------------------------------------------------------------
describe("3. ONE SEARCH IS A SEARCH, NOT A SUBJECT", () => {
  it("A LONE SEARCH IS NOT A GROUP", () => {
    expect(clusterQueries([q("soy candles", 400)])).toEqual([]);
    expect(MIN_CLUSTER_SIZE).toBe(2);
  });

  it("AND IT IS LEFT OUT RATHER THAN DELETED FROM THE DATA", () => {
    // The caller still has every row; the clustering simply says
    // nothing about the ones that are not a subject.
    const rows = [q("soy candles", 90), q("soy candles gift box", 60), q("unrelated thing", 500)];
    const clusters = clusterQueries(rows);
    expect(clusters.length).toBe(1);
    expect(clusters[0].queries.length).toBe(2);
    expect(rows.length).toBe(3);
  });

  it("A SEARCH MADE ONLY OF FILLER IS IN NO GROUP", () => {
    expect(contentWords("best near me")).toEqual([]);
    expect(clusterQueries([q("best near me", 90), q("cheapest near me", 60)])).toEqual([]);
  });

  it("AND IT DOES NOT STOP THE REST BEING GROUPED", () => {
    // THE CASE THAT MATTERS, and the one the test above cannot see. A
    // filler-only row can never join any group, so without the filter it
    // stays in the work list — and since the loop now stops when a pass
    // removes nothing, it would end the clustering early and the real
    // subjects would simply go missing. All-filler fixtures produce []
    // either way, which is how that mutation survived.
    const clusters = clusterQueries([
      q("best near me", 500),
      q("widget delivery", 90),
      q("widget delivery charges", 60),
    ]);
    expect(clusters.length).toBe(1);
    expect(clusters[0].queries.length).toBe(2);
  });

  it("THE LOOP CANNOT SPIN, whatever is thrown at it", () => {
    // FOUND BY A MUTATION THAT HUNG. The only thing shrinking the work
    // list is one splice, so a change that stopped removing members made
    // this run forever — no throw, no type error, no failing test, just
    // a daily job that never finishes. Vitest's own timeout is what
    // makes this assertion real: if the loop spins, this test does not
    // fail, it never returns.
    const many = Array.from({ length: 200 }, (_, i) => q(`subject${i % 7} thing${i}`, 50 + i));
    const started = Date.now();
    const clusters = clusterQueries(many);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(clusters.length).toBeGreaterThan(0);
    // And every row is accounted for once at most.
    const grouped = clusters.flatMap((c) => c.queries.map((x) => x.query));
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("and no rows is no clusters, not an error", () => {
    expect(clusterQueries([])).toEqual([]);
    expect(clusterQueries(null as any)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("4. THE SAME DATA ALWAYS GIVES THE SAME GROUPS", () => {
  it("TWO RUNS OVER THE SAME ROWS AGREE", () => {
    // A grouping that moves cannot be compared month to month, which is
    // the whole reason this is code and not a model.
    const rows = [q("soy candles", 90), q("soy wax melts", 80), q("candle gift box", 70), q("gift box ideas", 60)];
    expect(clusterQueries(rows)).toEqual(clusterQueries(rows));
  });

  it("AND SO DO TWO RUNS OVER THE SAME ROWS IN A DIFFERENT ORDER", () => {
    const rows = [q("soy candles", 90), q("soy wax melts", 80), q("candle gift box", 70), q("gift box ideas", 60)];
    const reversed = [...rows].reverse();
    expect(clusterQueries(rows).map((c) => c.subject)).toEqual(clusterQueries(reversed).map((c) => c.subject));
  });

  it("A TIE IS BROKEN ALPHABETICALLY, not by luck", () => {
    // TWO WORDS, ONE CLUSTER, AND THAT SHAPE IS THE POINT.
    //
    // Two earlier fixtures could not isolate this. Both produced two
    // clusters, and the FINAL sort (by impressions, then alphabetically)
    // put them right again — so deleting the word-level tie-break
    // changed nothing observable and the mutation survived a test named
    // for it.
    //
    // Here "zebra" and "alpha" each appear in both searches, so they tie
    // at two, and there is only ONE group for them to name. Insertion
    // order would pick "zebra"; the tie-break must pick "alpha".
    const rows = [q("zebra alpha", 90), q("zebra alpha extra", 60)];
    expect(clusterQueries(rows).length).toBe(1);
    expect(clusterQueries(rows)[0].subject).toBe("alpha");
    expect(clusterQueries([...rows].reverse())[0].subject).toBe("alpha");
  });

  it("the clustering is model-free and pure", () => {
    const src = code("src/lib/seo/queryClusters.ts");
    expect(src).not.toMatch(/^import .*(claude|anthropic|ai\/)/mi);
    expect(src).not.toMatch(/^import .*supabase/m);
    expect(src).not.toMatch(/Math\.random/);
  });
});

// ---------------------------------------------------------------------
describe("5. ONE DEFINITION OF WHAT A SEARCH IS ABOUT", () => {
  it("THE WORD LISTS LIVE HERE AND pageProposal IMPORTS THEM", () => {
    // Two copies of this would have been the fourth duplicated
    // definition this week, after TEXT_PROPS, the nine promises and the
    // 200-character note length.
    const proposal = code("src/lib/opportunities/pageProposal.ts");
    expect(proposal).toMatch(/export \{ contentWords \} from "@\/lib\/seo\/queryClusters"/);
    expect(proposal).not.toMatch(/const STOPWORDS = new Set/);
  });

  it("AND NOT ONE STOPWORD NAMES A TRADE — rule 3", () => {
    const src = code("src/lib/seo/queryClusters.ts").toLowerCase();
    for (const word of ["candle", "saree", "mithai", "tuition", "showroom", "jar", "plate"]) {
      expect(src).not.toContain(word);
    }
  });

  it("every filler word is filler in any trade", () => {
    // "near me" is filler everywhere; a product word would be a leak.
    for (const word of ["near", "me", "best", "cheap", "online", "price"]) {
      expect(contentWords(word)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------
describe("6. THE SUMMARY STATES ONLY WHAT WAS COUNTED", () => {
  it("IT SAYS HOW MANY SEARCHES AND HOW MANY IMPRESSIONS", () => {
    const cluster = clusterQueries([q("soy candles", 90), q("soy candles gift box", 60)])[0];
    expect(clusterSummary(cluster)).toBe(
      '2 searches about "candles" showed you 150 times in 28 days and nobody clicked once.'
    );
  });

  it("AND THE CLICKS WHEN THERE WERE ANY", () => {
    const cluster = clusterQueries([q("soy candles", 90, 1), q("soy candles gift box", 60, 0)])[0];
    expect(clusterSummary(cluster)).toContain("with 1 click.");
  });

  it("NOTHING IN IT IS ESTIMATED, scored or multiplied by a benchmark", () => {
    // The rule searchQueries.ts states for itself, and the reason it
    // exists: the SEO work it replaced was guessed.
    const src = code("src/lib/seo/queryClusters.ts");
    expect(src).not.toMatch(/\bvolume\b/i);
    expect(src).not.toMatch(/\bbenchmark\b/i);
    expect(src).not.toMatch(/\bscore\b/i);
  });
});

// ---------------------------------------------------------------------
describe("7. THE OPPORTUNITY COUNTS THE SUBJECT, NOT ONE SEARCH", () => {
  const catalogue = [{ name: "Something else entirely" }];

  it("A CLUSTERED SUBJECT GETS ITS OWN TOTAL ON THE CARD", () => {
    const queries = [q("widget delivery", 90, 0, 12), q("widget delivery charges", 60, 0, 14)];
    const out = marketOpportunities({ queries, signals: [], catalogue });
    const card = out.find((o) => o.type === "demand_without_offer");
    // "widget" and "delivery" tie at two each, so the subject is
    // "delivery". The number is what this test is about.
    expect(card!.description).toContain('one of 2 searches about "delivery" that together showed you 150 times');
  });

  it("AND A LONE SEARCH GETS NO SUCH SENTENCE", () => {
    // A sentence that adds nothing is a sentence the owner learns to
    // skip.
    const out = marketOpportunities({ queries: [q("widget delivery", 90, 0, 12)], signals: [], catalogue });
    const card = out.find((o) => o.type === "demand_without_offer");
    expect(card!.description).not.toContain("one of");
    expect(card!.description).not.toContain("together showed you");
  });

  it("THE CLUSTERING IS DONE ONCE PER RUN, not per opportunity", () => {
    const src = code("src/lib/opportunities/marketOpportunities.ts");
    expect(src).toMatch(/const clusters = clusterQueries\(queries as any\);/);
    expect((src.match(/clusterQueries\(/g) ?? []).length).toBe(1);
  });

  it("and the number on the card is summed, never estimated", () => {
    const src = code("src/lib/opportunities/marketOpportunities.ts");
    expect(src).toMatch(/cluster\.impressions/);
    expect(src).not.toMatch(/estimated/i);
  });

  it("clusterFor finds the group a search is in, and null when it is in none", () => {
    const clusters = clusterQueries([q("soy candles", 90), q("soy candles gift box", 60)]);
    expect(clusterFor(clusters, "SOY CANDLES ")!.subject).toBe("candles");
    expect(clusterFor(clusters, "something else")).toBeNull();
    expect(clusterFor(clusters, "")).toBeNull();
    expect(clusterFor([], "soy candles")).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("8. THE AUDIT'S OVERSTATEMENT IS CORRECTED", () => {
  it("THE REAL-DATA SWAP ALREADY EXISTED, and this file says so", () => {
    // competitor_keywords stops guessing the moment Search Console is
    // connected. The audit said it "invents ten" without that caveat,
    // and the founder acted on what it said.
    const toolkit = code("src/lib/agents/seoToolkitAgent.ts");
    expect(toolkit).toMatch(/REAL_DATA_INSTRUCTIONS/);
    expect(toolkit).toMatch(/Work ONLY from the real search terms given above/);
    // sourceWithComments, because the sentence being asserted IS a
    // comment — rule 8's documented helper. `code()` strips it, so the
    // first version of this assertion could never have matched.
    const src = sourceWithComments("src/lib/seo/queryClusters.ts");
    expect(src).toMatch(/I overstated it/);
  });

  it("AND THE AUDIT DOCUMENT CARRIES THE CORRECTION TOO", () => {
    const audit = code("docs/AUDIT-GROWTH-LOOP.md");
    expect(audit).toMatch(/only for a business with no Search Console connection/);
  });
});
