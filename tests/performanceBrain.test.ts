// What kind of content works, and when Hawlai is allowed to say so
// (Brain, Phase 5).
//
// "Case-study posts bring 2.4× more qualified leads than reels" is the
// emotional centre of the whole vision — and on 5 leads it is noise
// wearing a decimal point. Two leads against one is not a ratio.
//
// So the machinery is built and stays QUIET until the numbers can carry a
// comparison. These tests are mostly about the silence: what it takes to
// break it, and that the reason is said out loud in the meantime.

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  performanceByFormat,
  patternsFrom,
  thinReason,
  recordPerformanceSignals,
  MIN_PIECES_PER_FORMAT,
  MIN_LEADS_TO_COMPARE,
  MIN_GAP_FACTOR,
  type FormatRow,
} from "@/lib/attribution/performanceBrain";
import { convergences, themeWordsOf, formatConvergencesForPrompt, MIN_SOURCES } from "@/lib/signals/crossIntelligence";
import type { StoredSignal } from "@/lib/signals/signals";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";

const fmt = (format: string, pieces: number, leads: number): FormatRow => ({
  format, pieces, leads, visits: pieces * 10,
  leadsPerPiece: pieces ? Math.round((leads / pieces) * 100) / 100 : 0,
  standsForSomething: pieces >= MIN_PIECES_PER_FORMAT,
});

describe("when a pattern may be stated at all", () => {
  it("THE REAL BUSINESS TODAY: a handful of leads produces no pattern, and says how far off it is", () => {
    const formats = [fmt("instagram_post", 4, 2), fmt("blog", 3, 1)];
    expect(patternsFrom(formats, 3)).toEqual([]);
    const why = thinReason(formats, 3)!;
    expect(why).toContain("3 leads can be traced");
    expect(why).toContain(`about ${MIN_LEADS_TO_COMPARE}`);
    expect(why).toContain("7 more");
    expect(why).toContain("one extra lead changes the answer");
  });

  it("ONE LUCKY POST IS NOT A FORMAT", () => {
    // Plenty of leads overall, and the under-published format has the
    // BETTER rate — 2 pieces, 5 leads — so counting it would produce a
    // confident wrong answer rather than no answer.
    const formats = [fmt("instagram_post", 6, 6), fmt("blog", MIN_PIECES_PER_FORMAT - 1, 5)];
    expect(formats[1].leadsPerPiece).toBeGreaterThan(formats[0].leadsPerPiece);
    expect(patternsFrom(formats, 11)).toEqual([]);
    expect(thinReason(formats, 11)).toContain("Two are needed");
  });

  it("a narrow gap is not a finding — one more lead would reverse it", () => {
    // 10/5 = 2.0 per piece against 8/5 = 1.6: real, but not wide enough.
    const formats = [fmt("instagram_post", 5, 10), fmt("blog", 5, 8)];
    expect(10 / 5 / (8 / 5)).toBeLessThan(MIN_GAP_FACTOR);
    expect(patternsFrom(formats, 18)).toEqual([]);
    // And with nothing to report, there is no shortfall to explain either.
    expect(thinReason(formats, 18)).toBeNull();
  });

  it("A WIDE GAP ON REAL NUMBERS IS SAID — with the counts, never a multiple", () => {
    const formats = [fmt("blog", 4, 12), fmt("instagram_post", 5, 3)];
    const [p] = patternsFrom(formats, 15);
    expect(p.better).toBe("blog");
    expect(p.worse).toBe("instagram_post");
    expect(p.statement).toBe("blog brought 12 leads from 4 pieces; instagram_post brought 3 from 5");
    // No "2.4×" anywhere: the counts are the claim.
    expect(p.statement).not.toMatch(/×|x more|times more/);
    expect(p.evidence).toMatchObject({ betterLeads: 12, betterPieces: 4, worseLeads: 3, worsePieces: 5 });
  });

  it("a format with no leads at all is only called worse once the winner has real numbers", () => {
    const some = patternsFrom([fmt("blog", 4, 10), fmt("reel_ideas", 4, 0)], 10);
    expect(some[0].worse).toBe("reel_ideas");
    // The winner needs enough of its own before zero means anything.
    expect(patternsFrom([fmt("blog", 4, 4), fmt("reel_ideas", 4, 0)], MIN_LEADS_TO_COMPARE)).toEqual([]);
  });

  it("nothing published at all says that, rather than an empty comparison", () => {
    expect(thinReason([], 0)).toContain("nothing to compare");
  });
});

// ---- over the stored rows --------------------------------------------------
let tables: Record<string, any[]>;

function db() {
  const from = (table: string) => {
    const filters: [string, any][] = [];
    let staged: any = null;
    let mode: "select" | "insert" | "update" = "select";
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (mode === "insert") {
        const row = { id: crypto.randomUUID(), ...staged };
        (tables[table] ??= []).push(row);
        return row;
      }
      if (mode === "update") {
        const t = rows()[0];
        if (t) Object.assign(t, staged);
        return t ?? null;
      }
      return rows()[0] ?? null;
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api, gte: () => api, not: () => api, in: () => api,
      eq: (k: string, v: any) => (filters.push([k, v]), api),
      insert: (r: any) => ((mode = "insert"), (staged = r), api),
      update: (r: any) => ((mode = "update"), (staged = r), api),
      maybeSingle: async () => ({ data: run(), error: null }),
      single: async () => ({ data: run(), error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: mode === "select" ? rows() : [run()], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables = {
    marketing_pieces: [
      { id: "m1", dealership_id: "d1", kind: "content", source_table: "content_pieces", source_id: "c1" },
      { id: "m2", dealership_id: "d1", kind: "email", source_table: "email_marketing_pieces", source_id: "e1" },
    ],
    content_pieces: [{ id: "c1", dealership_id: "d1", content_type: "instagram_post" }],
    page_events: [
      { dealership_id: "d1", event_type: "view", marketing_piece_id: "m1" },
      { dealership_id: "d1", event_type: "view", marketing_piece_id: "m2" },
    ],
    lead_touchpoints: [
      { dealership_id: "d1", lead_id: "l1", marketing_piece_id: "m1" },
      { dealership_id: "d1", lead_id: "l1", marketing_piece_id: "m1" },
    ],
    business_signals: [],
  };
});

describe("grouping the real rows", () => {
  it("A CONTENT PIECE IS GROUPED BY ITS OWN FORMAT, not lumped in as 'content'", async () => {
    const read = await performanceByFormat(db(), "d1");
    expect(read.formats.map((f) => f.format).sort()).toEqual(["email", "instagram_post"]);
  });

  it("one lead counts once for a format however many of its pieces it touched", async () => {
    const read = await performanceByFormat(db(), "d1");
    expect(read.formats.find((f) => f.format === "instagram_post")!.leads).toBe(1);
    expect(read.totals.leads).toBe(1);
  });

  it("and at this size it reports the shortfall rather than a winner", async () => {
    const read = await performanceByFormat(db(), "d1");
    expect(read.patterns).toEqual([]);
    expect(read.thin).toContain("Comparing what kind of content works needs");
  });

  it("THE SHORTFALL IS FILED AS A SIGNAL TOO — Strategy needs to know it can't know", async () => {
    const read = await performanceByFormat(db(), "d1");
    await recordPerformanceSignals(db(), "d1", read);
    const s = tables.business_signals[0];
    expect(s).toMatchObject({ source: "content_results", confidence: "counted", topic: "what kind of content works" });
    expect(s.summary).toContain("needs about 10");
    expect(s.evidence).toMatchObject({ attributedLeads: 1, needsLeads: MIN_LEADS_TO_COMPARE });
  });

  it("re-running rewrites the one standing signal instead of piling up", async () => {
    const read = await performanceByFormat(db(), "d1");
    await recordPerformanceSignals(db(), "d1", read);
    await recordPerformanceSignals(db(), "d1", read);
    expect(tables.business_signals).toHaveLength(1);
  });

  it("it runs daily, in the database-only group", () => {
    expect(GROUPS.signals).toContain("content_performance");
    expect(GROUPS.heavy).not.toContain("content_performance");
    expect(typeof DAILY_RUNNERS.content_performance).toBe("function");
  });
});

// ---- cross-intelligence ----------------------------------------------------
const sig = (over: Partial<StoredSignal>): StoredSignal => ({
  id: Math.random().toString(36), source: "seo", topic: "x", summary: "x", evidence: {}, confidence: "counted",
  sourceUrl: null, observedAt: "2026-09-26T00:00:00Z", lastSeenAt: "2026-09-26T00:00:00Z", ...over,
});

describe("when separate departments agree", () => {
  it("THE VISION'S CHAIN: search demand and a competitor move on the same theme converge", () => {
    const list = convergences([
      sig({ source: "seo", summary: "Search demand for affordable candle delivery is rising", confidence: "counted" }),
      sig({ source: "competitor_monitor", summary: "Aroma Co launched same-day delivery", confidence: "observed" }),
    ]);
    const delivery = list.find((c) => c.theme === "delivery")!;
    expect(delivery.sources.sort()).toEqual(["competitor_monitor", "seo"]);
    expect(delivery.saying).toHaveLength(2);
    expect(delivery.standing).toBe("counted");
  });

  it("ONE DEPARTMENT SAYING IT THREE TIMES IS NOT AGREEMENT", () => {
    const list = convergences([
      sig({ source: "competitor_monitor", summary: "Aroma Co launched delivery", confidence: "observed" }),
      sig({ source: "competitor_monitor", summary: "Wick Co launched delivery", confidence: "observed" }),
      sig({ source: "competitor_monitor", summary: "Third launched delivery", confidence: "observed" }),
    ]);
    expect(list.find((c) => c.theme === "delivery")).toBeUndefined();
    expect(MIN_SOURCES).toBe(2);
  });

  it("TWO READINGS AGREEING IS TWO GUESSES AGREEING — not evidence", () => {
    const list = convergences([
      sig({ source: "positioning", summary: "Nobody local claims same-day delivery", confidence: "inferred" }),
      sig({ source: "topic_monitor", summary: "Delivery expectations are shifting", confidence: "inferred" }),
    ]);
    expect(list).toEqual([]);
  });

  it("a mixed convergence is allowed, and SAYS it rests on softer ground than it looks", () => {
    const list = convergences([
      sig({ source: "seo", summary: "Delivery searches are rising", confidence: "counted" }),
      sig({ source: "positioning", summary: "Nobody local claims delivery", confidence: "inferred" }),
    ]);
    const c = list.find((x) => x.theme === "delivery")!;
    expect(c.standing).toBe("counted");
    expect(c.caveat).toContain("weaker than the number of departments makes it look");
  });

  it("only the strongest signal from a chatty department is quoted", () => {
    // The WEAKER seo signal comes first, so taking whichever is nearest
    // to hand would quote the guess and understate what is known.
    const list = convergences([
      sig({ source: "seo", summary: "Delivery is probably worth trying", confidence: "inferred" }),
      sig({ source: "seo", summary: "Delivery searches counted", confidence: "counted" }),
      sig({ source: "aeo", summary: "Not named for delivery questions", confidence: "observed" }),
    ]);
    const c = list.find((x) => x.theme === "delivery")!;
    expect(c.saying.filter((s) => s.source === "seo")).toHaveLength(1);
    expect(c.saying.find((s) => s.source === "seo")!.confidence).toBe("counted");
    expect(c.saying.find((s) => s.source === "seo")!.summary).toBe("Delivery searches counted");
    // And with the strongest quoted, nothing looks softer than it is.
    expect(c.caveat).toBeNull();
  });

  it("filler words never become a theme", () => {
    const words = themeWordsOf(sig({ summary: "The business has not been named for this question", topic: "search" }));
    for (const noise of ["the", "business", "named", "question", "search", "this"]) expect(words).not.toContain(noise);
  });

  it("nothing agreeing is nothing said", () => {
    expect(convergences([])).toEqual([]);
    expect(formatConvergencesForPrompt([])).toBe("");
  });

  it("the prompt names who agreed, with each one's standing, and forbids overstating it", () => {
    const list = convergences([
      sig({ source: "seo", summary: "Delivery searches are rising", confidence: "counted" }),
      sig({ source: "competitor_monitor", summary: "Aroma Co launched delivery", confidence: "observed" }),
    ]);
    const text = formatConvergencesForPrompt(list);
    expect(text).toContain("Where separate departments agree");
    expect(text).toContain("seo (counted)");
    expect(text).toContain("competitor_monitor (observed)");
    expect(text).toContain("do not treat agreement as proof of a cause");
    expect(text).toContain("do not restate a reading as a measurement");
  });

  it("Strategy is given them, at no extra cost", () => {
    const src = require("node:fs").readFileSync("src/lib/strategy/channelAdvice.ts", "utf8");
    expect(src).toContain("formatConvergencesForPrompt(convergences(signals))");
    expect(src).toContain("${agreementSection ? `\\n${agreementSection}\\n` : \"\"}");
  });
});
