// What a visit suggests about intent — V3.
//
// THE TESTS THAT MATTER HERE are the ones about what the score is not:
// not `predicted_conversion_score`, not a probability, and not a verdict
// on pages it could not identify. The arithmetic is the easy part.

import { describe, it, expect } from "vitest";
import {
  pageKind,
  scoreVisit,
  summariseIntent,
  intentLine,
  readPageKinds,
  bandOf,
  KIND_POINTS,
  REPEAT_POINTS,
  DEPTH_POINTS,
  DEPTH_CAP,
  DWELL_SECONDS,
  DWELL_POINTS,
  HIGH_BAND,
  MEDIUM_BAND,
  MAX_SCORE,
} from "@/lib/growth/intent";
import { everyNumberIsCounted } from "@/lib/growth/report";
import type { Visit } from "@/lib/growth/visits";
import { code } from "./helpers/source";

const SITE = "/site/acme";

function visit(pages: string[], over: Partial<Visit> = {}): Visit {
  return {
    visitorId: "v-1",
    startedAt: "2026-11-13T09:00:00Z",
    endedAt: "2026-11-13T09:05:00Z",
    pages,
    pageViews: pages.length,
    // NULL BY DEFAULT, deliberately. A fixture default that earns dwell
    // points joins the arithmetic of every test that is about something
    // else — it broke three of them on the way in.
    measuredSeconds: null,
    mostSeenPageCount: 1,
    ...over,
  };
}

/** What one business declared its pages to be. */
const DECLARED = { home: "home", menu: "products", about: "about", reach: "contact" };

describe("1. THIS IS NOT predicted_conversion_score", () => {
  // That column means "how well was this LEAD handled" and the owner may
  // already be reading it on the leads table. Visitor behaviour written
  // into it would silently change a figure in use.
  const src = () => code("src/lib/growth/intent.ts");

  it("THE SCORER NEVER NAMES THE LEAD COLUMN", () => {
    expect(src()).not.toMatch(/predicted_conversion_score/);
  });

  it("AND NEVER WRITES A LEAD ROW AT ALL", () => {
    const s = src();
    expect(s).not.toMatch(/\.update\(/);
    expect(s).not.toMatch(/\.insert\(/);
    expect(s).not.toMatch(/from\("leads"\)/);
  });

  it("the report does not pass an intent score into anything lead-shaped", () => {
    const report = code("src/lib/growth/dailyGrowth.ts");
    const block = report.slice(report.indexOf("const intent = summariseIntent"));
    expect(block.length).toBeGreaterThan(100);
    const paragraph = block.slice(0, block.indexOf("}\n    }"));
    expect(paragraph).not.toMatch(/lead/i);
  });
});

describe("2. A PAGE'S KIND COMES FROM STRUCTURE OR FROM THE BUSINESS'S OWN WORDS", () => {
  it("THE SAME CATALOGUE UNDER TWO DIFFERENT NAMES SCORES THE SAME — rule 3", () => {
    // THE LOAD-BEARING MULTI-TENANT TEST. One business calls it "menu",
    // another "listings"; both declared the type `products`. Matching
    // the slug would have scored one and not the other, which is the
    // industry guess this file exists to avoid.
    expect(pageKind(`${SITE}/menu`, { menu: "products" })).toBe("products");
    expect(pageKind(`${SITE}/listings`, { listings: "products" })).toBe("products");
    expect(pageKind(`${SITE}/kuch-bhi`, { "kuch-bhi": "products" })).toBe("products");
  });

  it("AND A SLUG THAT LOOKS LIKE A CATALOGUE BUT IS NOT DECLARED ONE IS NOT ONE", () => {
    expect(pageKind(`${SITE}/products-we-love`, { "products-we-love": "custom" })).toBe("custom");
  });

  it("THIS APPLICATION'S OWN ROUTES ARE READ FROM THE PATH", () => {
    // These are files in src/app, identical for every business — not
    // vocabulary. A business page cannot occupy them: Next.js matches
    // the static segment ahead of the [page] catch-all.
    expect(pageKind(`${SITE}/cart`, DECLARED)).toBe("cart");
    expect(pageKind(`${SITE}/checkout`, DECLARED)).toBe("checkout");
    expect(pageKind(`${SITE}/products/abc-123`, DECLARED)).toBe("product_detail");
    expect(pageKind(`${SITE}`, DECLARED)).toBe("home");
    expect(pageKind("/p/diwali-offer", DECLARED)).toBe("landing");
  });

  it("AN UNDECLARED PAGE IS unknown, NOT custom", () => {
    // `custom` is a page the business classified. `unknown` is a page we
    // could not place. A low score for the two means different things.
    expect(pageKind(`${SITE}/never-heard-of-it`, DECLARED)).toBe("unknown");
    expect(pageKind(`${SITE}/anything`, {})).toBe("unknown");
    expect(pageKind(`${SITE}/anything`, null)).toBe("unknown");
  });

  it("A VALUE page_type DOES NOT HAVE IS NOT TRUSTED", () => {
    expect(pageKind(`${SITE}/x`, { x: "checkout" })).toBe("unknown");
    expect(pageKind(`${SITE}/x`, { x: "whatever" })).toBe("unknown");
  });

  it("a path from somewhere else is unknown, not guessed at", () => {
    // If storefronts are ever served from the custom domains `websites`
    // can already hold, these arrive — and must raise the unknown count
    // rather than score as uninteresting.
    expect(pageKind("/menu", DECLARED)).toBe("unknown");
    expect(pageKind("", DECLARED)).toBe("unknown");
    expect(pageKind(null, DECLARED)).toBe("unknown");
    expect(pageKind(`${SITE}/a/b/c`, DECLARED)).toBe("unknown");
  });

  it("a trailing slash is the same page", () => {
    expect(pageKind(`${SITE}/cart/`, DECLARED)).toBe("cart");
    expect(pageKind(`${SITE}/`, DECLARED)).toBe("home");
  });
});

describe("3. WHAT EARNS POINTS, AND WHAT EACH POINT CAN BE TRACED TO", () => {
  it("EVERY REASON CARRIES ITS EVIDENCE", () => {
    // The ordering is a judgement, not a measurement — so the owner has
    // to be able to read what earned it and disagree.
    const out = scoreVisit(visit([`${SITE}`, `${SITE}/reach`]), DECLARED);
    expect(out.reasons.length).toBeGreaterThan(0);
    for (const r of out.reasons) expect(r.evidence, r.why).toBeTruthy();
    expect(out.reasons.some((r) => r.evidence === `${SITE}/reach`)).toBe(true);
  });

  it("A HOME PAGE EARNS NOTHING, because nearly every visitor sees it", () => {
    const out = scoreVisit(visit([`${SITE}`]), DECLARED);
    expect(KIND_POINTS.home).toBe(0);
    expect(out.score).toBe(0);
    expect(out.band).toBe("low");
    expect(out.reasons.some((r) => r.why.startsWith("opened"))).toBe(false);
    // And staying on it is still worth its own points — the home page
    // earns nothing, the time does.
    const stayed = scoreVisit(visit([`${SITE}`], { measuredSeconds: DWELL_SECONDS }), DECLARED);
    expect(stayed.score).toBe(DWELL_POINTS);
    expect(stayed.band).toBe("low");
  });

  it("A KIND SCORES ONCE PER VISIT, however many of its pages were seen", () => {
    // Reloading one product page six times must not out-score opening
    // six different ones, and opening six different ones must not score
    // six times the catalogue either.
    const one = scoreVisit(visit([`${SITE}/products/a`]), DECLARED);
    const six = scoreVisit(
      visit([`${SITE}/products/a`, `${SITE}/products/b`, `${SITE}/products/c`]),
      DECLARED
    );
    const kindPoints = (r: { why: string }[]) => r.filter((x) => x.why.startsWith("opened")).length;
    expect(kindPoints(one.reasons)).toBe(1);
    expect(kindPoints(six.reasons)).toBe(1);
  });

  it("COMING BACK TO ONE PAGE IN A SITTING COUNTS, ONCE", () => {
    const out = scoreVisit(visit([`${SITE}/menu`], { mostSeenPageCount: 3 }), DECLARED);
    const repeats = out.reasons.filter((r) => r.points === REPEAT_POINTS && r.why.includes("came back"));
    expect(repeats).toHaveLength(1);
    expect(out.score).toBe(KIND_POINTS.products + REPEAT_POINTS);
  });

  it("DEPTH IS CAPPED, so one crawler does not look like the best lead of the week", () => {
    const many = Array.from({ length: 20 }, (_, i) => `${SITE}/p${i}`);
    const out = scoreVisit(visit(many), DECLARED);
    const depth = out.reasons.find((r) => r.why.includes("more than one page"));
    expect(depth?.points).toBe(DEPTH_CAP);
    expect(DEPTH_CAP).toBeLessThan(20 * DEPTH_POINTS);
  });

  it("A VISIT THAT COULD NOT BE TIMED EARNS NO DWELL POINTS AND NO PENALTY", () => {
    // V2's rule carried forward: null is "we cannot tell how long", not
    // "they left immediately".
    const untimed = scoreVisit(visit([`${SITE}/reach`], { measuredSeconds: null }), DECLARED);
    const timed = scoreVisit(visit([`${SITE}/reach`], { measuredSeconds: DWELL_SECONDS }), DECLARED);
    expect(untimed.reasons.some((r) => r.why === "stayed a while")).toBe(false);
    expect(untimed.score).toBe(KIND_POINTS.contact);
    expect(timed.score).toBe(KIND_POINTS.contact + DWELL_POINTS);
  });

  it("THE DWELL THRESHOLD IS ABOVE ZERO, which is what keeps null and 0 apart", () => {
    // Mutation M7 rewrote the null check as `(measuredSeconds ?? 0) >=
    // DWELL_SECONDS` and survived, correctly: the two are identical
    // behaviour WHILE the threshold is above zero. At a threshold of
    // zero they diverge, and an untimed visit would collect the dwell
    // points for time nobody measured. This pins the condition the
    // equivalence rests on, since no test can separate the two forms
    // themselves.
    expect(DWELL_SECONDS).toBeGreaterThan(0);
  });

  it("a short measured visit earns nothing extra either", () => {
    const out = scoreVisit(visit([`${SITE}/reach`], { measuredSeconds: DWELL_SECONDS - 1 }), DECLARED);
    expect(out.score).toBe(KIND_POINTS.contact);
  });

  it("THE SCORE IS CAPPED, so it reads on a fixed scale", () => {
    const out = scoreVisit(
      visit([`${SITE}/checkout`, `${SITE}/cart`, `${SITE}/reach`, `${SITE}/products/a`, `${SITE}/menu`], {
        mostSeenPageCount: 4,
        measuredSeconds: 9_000,
      }),
      DECLARED
    );
    expect(out.score).toBe(MAX_SCORE);
    expect(out.band).toBe("high");
  });

  it("THE STRONGEST SINGLE ACTION CLEARS THE TOP BAND BY ITSELF", () => {
    // Found on the way in: checkout scored 40 against a band of 50, so
    // a week in which a visitor reached checkout and did nothing else
    // reported "0 visits ranked high" — true, and useless. If the
    // strongest thing in the table cannot reach the band alone, the
    // band is wrong.
    expect(Math.max(...Object.values(KIND_POINTS))).toBeGreaterThanOrEqual(HIGH_BAND);
    expect(scoreVisit(visit([`${SITE}/checkout`]), DECLARED).band).toBe("high");
  });

  it("the bands are named constants, in order", () => {
    expect(MEDIUM_BAND).toBeLessThan(HIGH_BAND);
    expect(bandOf(HIGH_BAND)).toBe("high");
    expect(bandOf(HIGH_BAND - 1)).toBe("medium");
    expect(bandOf(MEDIUM_BAND)).toBe("medium");
    expect(bandOf(MEDIUM_BAND - 1)).toBe("low");
  });
});

describe("4. A PAGE WE COULD NOT IDENTIFY IS AN ADMISSION, NOT A LOW SCORE", () => {
  it("IT EARNS NOTHING AND STILL APPEARS IN THE REASONS", () => {
    // THE LOAD-BEARING ONE. "We could not tell what they looked at" and
    // "they looked at nothing interesting" produce the same low score
    // and are completely different facts.
    const out = scoreVisit(visit([`${SITE}/mystery`, `${SITE}/other`]), DECLARED);
    expect(out.score).toBe(DEPTH_POINTS);
    expect(out.unknownPages).toBe(2);
    const admission = out.reasons.find((r) => r.why.includes("could not identify"));
    expect(admission).toBeTruthy();
    expect(admission!.points).toBe(0);
    expect(admission!.evidence).toContain("2");
  });

  it("AND THE SUMMARY SAYS HOW MANY VISITS WERE AFFECTED", () => {
    const s = summariseIntent([visit([`${SITE}/mystery`]), visit([`${SITE}/reach`])], DECLARED);
    expect(s.withUnknownPages).toBe(1);
    expect(intentLine(s)).toMatch(/could not identify/);
  });

  it("a visit with everything identified says nothing about unknowns", () => {
    const s = summariseIntent([visit([`${SITE}/reach`])], DECLARED);
    expect(s.withUnknownPages).toBe(0);
    expect(intentLine(s)).not.toMatch(/could not identify/);
  });
});

describe("5. THE SUMMARY IS ORDERED, DECLARED, AND SILENT WHEN THERE IS NOTHING TO SAY", () => {
  it("BEST FIRST", () => {
    const s = summariseIntent(
      [visit([`${SITE}`], { visitorId: "dull" }), visit([`${SITE}/checkout`], { visitorId: "keen" })],
      DECLARED
    );
    expect(s.visits[0].visitorId).toBe("keen");
    expect(s.high).toBe(1);
  });

  it("NO VISITS IS NO LINE, not a line of zeroes", () => {
    // The same judgement that took "BROKEN" off a business with no
    // website: a true number that reads as a finding is still
    // misleading.
    expect(intentLine(summariseIntent([], DECLARED))).toBeNull();
    expect(intentLine(summariseIntent(null, DECLARED))).toBeNull();
  });

  it("EVERY DIGIT IN THE LINE IS DECLARED — the report's own walk, run here", () => {
    // Not a copy of the rule: the real checker, over a real block. A
    // figure added to the sentence without a Counted beside it prunes
    // the paragraph out of the owner's report, silently.
    const s = summariseIntent(
      [
        visit([`${SITE}/checkout`, `${SITE}/mystery`], { visitorId: "a", mostSeenPageCount: 2 }),
        visit([`${SITE}/menu`], { visitorId: "b" }),
        visit([`${SITE}`], { visitorId: "c" }),
      ],
      DECLARED
    );
    const line = intentLine(s);
    expect(line).toBeTruthy();
    expect(line).toMatch(/\d/);
    const check = everyNumberIsCounted({
      dealershipId: "d1",
      day: "2026-11-13",
      subject: "s",
      blocks: [{ kind: "line", text: line as string, numbers: s.counted }],
      counted: s.counted,
    });
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("and every declared figure says where it came from", () => {
    const s = summariseIntent([visit([`${SITE}/reach`])], DECLARED);
    for (const c of s.counted) expect(c.source, c.label).toBeTruthy();
  });
});

describe("6. A FAILED READ IS NOT A SITE FULL OF UNIDENTIFIABLE PAGES", () => {
  function db(opts: { site?: any; siteError?: any; pages?: any[] | null; pagesError?: any }) {
    return {
      from: (table: string) => {
        if (table === "websites") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: opts.site ?? null, error: opts.siteError ?? null }),
          };
          return chain;
        }
        const chain: any = {
          select: () => chain,
          eq: () => Promise.resolve({ data: opts.pages ?? null, error: opts.pagesError ?? null }),
        };
        return chain;
      },
    } as any;
  }

  it("NULL ON A FAILED PAGES READ, NOT AN EMPTY MAP", async () => {
    // THE LOAD-BEARING ONE. An empty map classifies every page as
    // unidentifiable, scores every visit near zero, and reports the week
    // as "nobody was interested" — an invented finding from a database
    // error.
    const kinds = await readPageKinds(db({ site: { id: "w1" }, pagesError: { message: "boom" } }), "d1");
    expect(kinds).toBeNull();
    expect(kinds).not.toEqual({});
  });

  it("AND NULL ON A FAILED SITE READ", async () => {
    expect(await readPageKinds(db({ siteError: { message: "boom" } }), "d1")).toBeNull();
  });

  it("BUT A BUSINESS WITH NO SITE GETS AN EMPTY MAP, which is the truth", async () => {
    expect(await readPageKinds(db({ site: null }), "d1")).toEqual({});
  });

  it("a real read maps slug to the declared type, skipping blanks", async () => {
    const kinds = await readPageKinds(
      db({
        site: { id: "w1" },
        pages: [
          { slug: "menu", page_type: "products" },
          { slug: "", page_type: "home" },
          { slug: "x", page_type: null },
        ],
      }),
      "d1"
    );
    expect(kinds).toEqual({ menu: "products" });
  });

  it("THE REPORT SKIPS THE PARAGRAPH WHEN THE KINDS COULD NOT BE READ", () => {
    const src = code("src/lib/growth/dailyGrowth.ts");
    const start = src.indexOf("const kinds = await readPageKinds");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 400);
    // The guard is on the read, before anything is scored — scoring
    // against null is what produces the invented finding.
    expect(block.indexOf("if (kinds)")).toBeGreaterThan(-1);
    expect(block.indexOf("if (kinds)")).toBeLessThan(block.indexOf("summariseIntent"));
  });

  it("AND DECLARES THE FIGURES IT PRINTS", () => {
    const src = code("src/lib/growth/dailyGrowth.ts");
    const start = src.indexOf("const kinds = await readPageKinds");
    const block = src.slice(start, start + 400);
    expect(block).toMatch(/counted\.push\(\.\.\.intent\.counted\)/);
  });
});
