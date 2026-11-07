// How fast the page actually is, measured rather than advised (G4 of
// docs/AUDIT-GROWTH-LOOP.md).
//
// WHAT STOOD HERE BEFORE. Page speed was the one item in the founder's
// vision that nothing in this product measured — and the thing occupying
// its place was `site_speed` in the SEO department, which writes "6
// concrete site speed suggestions relevant to a small business site"
// **without having looked at the site**. That is the audit's central
// finding in one object: advice shaped like measurement.
//
// THE DISTINCTION EVERY TEST BELOW TURNS ON, and the one that decides
// whether a tool like this tells the truth:
//
//   FIELD DATA (CrUX) is what real visitors experienced. A new site with
//   little traffic DOES NOT HAVE IT.
//   LAB DATA (Lighthouse) is one simulated load on Google's hardware.
//
// "Your visitors waited 5.1 seconds" and "a test load took 5.1 seconds"
// are different claims, and only one is true when there is no field
// data. So a reading always says which it came from, and the absence of
// field data is reported rather than filled in — the same rule as
// `could_not_check` in the output monitor and `null` in the sitemap
// reader.

import { describe, it, expect, afterEach } from "vitest";
import { code } from "./helpers/source";

import {
  GOOD,
  POOR,
  fetchPsi,
  noFieldDataNote,
  pageSpeedPaused,
  readPsi,
  runPageSpeed,
  speedFindings,
} from "@/lib/seo/pageSpeed";
import { GROUPS } from "@/lib/automation/cronGroups";
import { DAILY_RUNNERS } from "@/lib/automation/dailyRunners";

const was = process.env.PAGESPEED_ENABLED;
afterEach(() => {
  if (was === undefined) delete process.env.PAGESPEED_ENABLED;
  else process.env.PAGESPEED_ENABLED = was;
});

/** A PSI answer with real-visitor data. */
const withField = (over: Record<string, any> = {}) => ({
  id: "https://hawlai.online/site/a-shop",
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 5100 },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 31 },
      INTERACTION_TO_NEXT_PAINT: { percentile: 640 },
    },
  },
  lighthouseResult: {
    categories: { performance: { score: 0.42 } },
    audits: { "largest-contentful-paint": { numericValue: 1200 }, "cumulative-layout-shift": { numericValue: 0.01 } },
  },
  ...over,
});

/** A PSI answer for a site nobody has visited enough. */
const labOnly = (over: Record<string, any> = {}) => ({
  id: "https://hawlai.online/site/a-shop",
  lighthouseResult: {
    categories: { performance: { score: 0.42 } },
    audits: { "largest-contentful-paint": { numericValue: 5100 }, "cumulative-layout-shift": { numericValue: 0.31 } },
  },
  ...over,
});

// ---------------------------------------------------------------------
describe("1. FIELD AND LAB ARE NEVER MIXED, AND THE READING SAYS WHICH", () => {
  it("REAL VISITOR DATA IS USED WHEN GOOGLE HAS IT", () => {
    const r = readPsi(withField())!;
    expect(r.from).toBe("field");
    expect(r.noFieldData).toBe(false);
    expect(r.lcpMs).toBe(5100);
    // And NOT the lab figure, which says 1200 in this fixture.
    expect(r.lcpMs).not.toBe(1200);
  });

  it("AND THE LAB IS USED ONLY WHEN THERE IS NO FIELD DATA, and said", () => {
    const r = readPsi(labOnly())!;
    expect(r.from).toBe("lab");
    expect(r.noFieldData).toBe(true);
    expect(r.lcpMs).toBe(5100);
  });

  it("THERE IS NO LAB INP, so it is null rather than approximated", () => {
    // A lab run cannot measure how long a real interaction took.
    expect(readPsi(labOnly())!.inpMs).toBeNull();
    expect(readPsi(withField())!.inpMs).toBe(640);
  });

  it("CLS IS CONVERTED FROM CrUX'S OWN SCALE", () => {
    // CrUX reports it multiplied by 100 — the kind of unit mismatch
    // that silently turns 0.05 into a failure.
    expect(readPsi(withField())!.cls).toBeCloseTo(0.31, 5);
    expect(readPsi(labOnly())!.cls).toBeCloseTo(0.31, 5);
  });

  it("THE LAB SCORE IS SCALED ONCE, and a missing one stays null", () => {
    // 0 would read as the worst possible score.
    expect(readPsi(withField())!.labScore).toBe(42);
    const noScore = readPsi(labOnly({ lighthouseResult: { audits: { "largest-contentful-paint": { numericValue: 5100 } } } }))!;
    expect(noScore.labScore).toBeNull();
  });

  it("AN ANSWER WITH NOTHING IN IT IS null, not a reading of zeroes", () => {
    expect(readPsi(null)).toBeNull();
    expect(readPsi("a string")).toBeNull();
    expect(readPsi({})).toBeNull();
    const noMetrics = readPsi({ id: "https://x.example/p" })!;
    expect(noMetrics.from).toBeNull();
    expect(noMetrics.lcpMs).toBeNull();
  });
});

// ---------------------------------------------------------------------
describe("2. A SENTENCE SAYS WHO WAITED", () => {
  it("FIELD DATA SAYS VISITORS", () => {
    const says = speedFindings(readPsi(withField()))[0].says;
    expect(says).toMatch(/^Visitors to this page waited 5\.1 seconds/);
  });

  it("AND LAB DATA SAYS A TEST LOAD, never visitors", () => {
    const findings = speedFindings(readPsi(labOnly()));
    expect(findings[0].says).toMatch(/^A single test load of this page waited 5\.1 seconds/);
    for (const f of findings) expect(f.says).not.toMatch(/visitors/i);
  });

  it("THE MISSING-FIELD-DATA SENTENCE IS THERE WHEN IT IS MISSING", () => {
    const note = noFieldDataNote(readPsi(labOnly()))!;
    expect(note).toMatch(/no data from real visitors to this page yet/);
    expect(note).toMatch(/not a measurement of what your customers experienced/);
  });

  it("AND ABSENT WHEN GOOGLE HAS THE DATA", () => {
    expect(noFieldDataNote(readPsi(withField()))).toBeNull();
    expect(noFieldDataNote(null)).toBeNull();
  });

  it("the thresholds quoted are Google's own, not ours", () => {
    // A product inventing its own would score the owner against a
    // standard nobody else uses.
    expect(GOOD).toEqual({ lcpMs: 2500, cls: 0.1, inpMs: 200 });
    expect(POOR).toEqual({ lcpMs: 4000, cls: 0.25, inpMs: 500 });
  });
});

// ---------------------------------------------------------------------
describe("3. ONLY WHAT IS POOR IS REPORTED", () => {
  const fast = () => ({
    id: "https://hawlai.online/site/a-shop",
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1800 },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 4 },
        INTERACTION_TO_NEXT_PAINT: { percentile: 120 },
      },
    },
    lighthouseResult: { categories: { performance: { score: 0.98 } }, audits: {} },
  });

  it("A FAST PAGE PRODUCES NOTHING", () => {
    expect(speedFindings(readPsi(fast()))).toEqual([]);
  });

  it("AND SO DOES A MIDDLING ONE", () => {
    // "Needs improvement" on every page of every site is the same as a
    // finding on none — the rule G1's thresholds were chosen by too.
    const middling = fast();
    middling.loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile = 3200;
    middling.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile = 15;
    expect(speedFindings(readPsi(middling))).toEqual([]);
  });

  it("A POOR PAGE NAMES EACH THING SEPARATELY", () => {
    const codes = speedFindings(readPsi(withField())).map((f) => f.code);
    expect(codes).toEqual(["slow_largest_paint", "page_jumps_while_loading", "slow_to_respond"]);
  });

  it("AND THE INP FINDING IS NEVER REPORTED FROM THE LAB", () => {
    const codes = speedFindings(readPsi(labOnly())).map((f) => f.code);
    expect(codes).not.toContain("slow_to_respond");
  });

  it("a reading with no numbers at all reports nothing", () => {
    expect(speedFindings(null)).toEqual([]);
    expect(speedFindings(readPsi({ id: "https://x.example/p" }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------
describe("4. OFF BY DEFAULT, AND MONTHLY WHEN ON", () => {
  it("IT IS OFF UNLESS SOMEBODY TURNS IT ON, ON PURPOSE", () => {
    delete process.env.PAGESPEED_ENABLED;
    expect(pageSpeedPaused()).toBe(true);
    process.env.PAGESPEED_ENABLED = "false";
    expect(pageSpeedPaused()).toBe(true);
    // Not "1", not "yes" — the same strictness as every other flag here.
    process.env.PAGESPEED_ENABLED = "1";
    expect(pageSpeedPaused()).toBe(true);
    process.env.PAGESPEED_ENABLED = "true";
    expect(pageSpeedPaused()).toBe(false);
  });

  it("A RUN WITH THE FLAG OFF MEASURES NOTHING AND SAYS SO", async () => {
    delete process.env.PAGESPEED_ENABLED;
    let fetched = false;
    const run = await runPageSpeed({} as any, "d1", {
      fetcher: (async () => {
        fetched = true;
        return { ok: true, json: async () => withField() } as any;
      }) as any,
      siteBase: "https://hawlai.online",
    });
    expect(run.skipped).toBe("page speed checks are off");
    expect(run.findings).toEqual([]);
    expect(fetched).toBe(false);
  });

  it("AND ON ANY DAY BUT THE FIRST IT MEASURES NOTHING EITHER", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    let fetched = false;
    const run = await runPageSpeed({} as any, "d1", {
      now: new Date("2026-11-07T06:00:00Z"),
      fetcher: (async () => {
        fetched = true;
        return { ok: true, json: async () => withField() } as any;
      }) as any,
      siteBase: "https://hawlai.online",
    });
    expect(run.skipped).toBe("not the first of the month");
    expect(fetched).toBe(false);
  });

  it("ON THE FIRST, WITH THE FLAG ON, IT MEASURES", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    const signals: any[] = [];
    const supabase = {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "a-shop", published: true }, error: null }) }) }),
        insert: async (row: any) => {
          signals.push(row);
          return { error: null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const run = await runPageSpeed(supabase as any, "d1", {
      now: new Date("2026-12-01T06:00:00Z"),
      fetcher: (async () => ({ ok: true, json: async () => withField() })) as any,
      siteBase: "https://hawlai.online",
    });
    expect(run.skipped).toBeNull();
    expect(run.url).toBe("https://hawlai.online/site/a-shop");
    expect(run.findings.length).toBe(3);
  });
});

// ---------------------------------------------------------------------
describe("5. IT NEVER MEASURES SOMETHING THAT IS NOT THERE", () => {
  const onFirst = {
    now: new Date("2026-12-01T06:00:00Z"),
    fetcher: (async () => ({ ok: true, json: async () => withField() })) as any,
    siteBase: "https://hawlai.online",
  };

  it("AN UNPUBLISHED SITE IS NOT MEASURED", async () => {
    // Asking Google about a URL that 404s would record a bad number for
    // a site that is simply not up yet.
    process.env.PAGESPEED_ENABLED = "true";
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "a-shop", published: false }, error: null }) }) }) }) };
    expect((await runPageSpeed(supabase as any, "d1", onFirst)).skipped).toBe("no published site");
  });

  it("AND NOR IS A BUSINESS WITH NO SITE", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    expect((await runPageSpeed(supabase as any, "d1", onFirst)).skipped).toBe("no published site");
  });

  it("A FAILED READ IS SAID, not treated as no site", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }) }) };
    expect((await runPageSpeed(supabase as any, "d1", onFirst)).skipped).toMatch(/could not read the site: boom/);
  });

  it("AND A FAILED PSI CALL IS SAID, not recorded as a fast page", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "a-shop", published: true }, error: null }) }) }) }) };
    const run = await runPageSpeed(supabase as any, "d1", {
      ...onFirst,
      fetcher: (async () => ({ ok: false, status: 429 })) as any,
    });
    expect(run.skipped).toMatch(/answered 429/);
    expect(run.findings).toEqual([]);
  });

  it("a missing site address measures nothing rather than guessing one", async () => {
    process.env.PAGESPEED_ENABLED = "true";
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "a-shop", published: true }, error: null }) }) }) }) };
    expect((await runPageSpeed(supabase as any, "d1", { ...onFirst, siteBase: "" })).skipped).toBe("no site address to measure");
  });
});

// ---------------------------------------------------------------------
describe("6. THE KEY IS OPTIONAL, AND THE CALL IS STILL MADE", () => {
  it("NO KEY IS A LOWER QUOTA, NOT AN ERROR", async () => {
    // PageSpeed Insights answers without one. A check that silently
    // never ran because an env var was never set is worse than a
    // rate-limited one.
    const key = process.env.PAGESPEED_API_KEY;
    delete process.env.PAGESPEED_API_KEY;
    let asked = "";
    const result = await fetchPsi("https://x.example/p", {
      fetcher: (async (url: string) => {
        asked = url;
        return { ok: true, json: async () => withField() } as any;
      }) as any,
    });
    expect(result.ok).toBe(true);
    expect(result.hadKey).toBe(false);
    expect(asked).not.toContain("key=");
    if (key !== undefined) process.env.PAGESPEED_API_KEY = key;
  });

  it("AND A KEY IS SENT WHEN THERE IS ONE", async () => {
    let asked = "";
    await fetchPsi("https://x.example/p", {
      key: "abc123",
      fetcher: (async (url: string) => {
        asked = url;
        return { ok: true, json: async () => withField() } as any;
      }) as any,
    });
    expect(asked).toContain("key=abc123");
  });

  it("IT ASKS ABOUT THE MOBILE EXPERIENCE", () => {
    // Almost every visitor to one of these businesses is on a phone.
    expect(code("src/lib/seo/pageSpeed.ts")).toMatch(/searchParams\.set\("strategy", "MOBILE"\)/);
  });

  it("and the env var is named in .env.example so it can be found", () => {
    // THE ASSIGNMENT, NOT THE WORD. `code()` strips // comments, not #
    // ones, so /PAGESPEED_ENABLED/ was satisfied by a line that had
    // been commented out — a variable nobody setting the project up
    // would ever see. Anchored to the start of a line instead.
    const example = code(".env.example");
    expect(example).toMatch(/^PAGESPEED_ENABLED=/m);
    expect(example).toMatch(/^PAGESPEED_API_KEY=/m);
  });
});

// ---------------------------------------------------------------------
describe("7. WHERE IT RUNS, AND WHAT IT RECORDS", () => {
  it("IT IS IN heavy, NOT IN signals", () => {
    // This file's own rule: signals is database-only and fast, and this
    // calls a third-party API over the network.
    expect(GROUPS.heavy).toContain("page_speed");
    expect(GROUPS.signals).not.toContain("page_speed");
  });

  it("AFTER search_console_sync, so the searches are in first", () => {
    expect(GROUPS.heavy.indexOf("page_speed")).toBeGreaterThan(GROUPS.heavy.indexOf("search_console_sync"));
  });

  it("AND IT HAS A RUNNER, so it is not a key nothing executes", () => {
    expect(typeof DAILY_RUNNERS.page_speed).toBe("function");
  });

  it("WHAT IT RECORDS IS observed, NOT counted", () => {
    // The taxonomy in lib/signals calls `counted` "our own rows". This
    // is Google's measurement of a public page, quoted.
    const src = code("src/lib/seo/pageSpeed.ts");
    expect(src).toMatch(/confidence: "observed"/);
    expect(src).not.toMatch(/confidence: "counted"/);
  });

  it("and the evidence carries which kind of number it was", () => {
    const src = code("src/lib/seo/pageSpeed.ts");
    expect(src).toMatch(/from: finding\.from/);
    expect(src).toMatch(/noFieldData: Boolean\(reading\?\.noFieldData\)/);
  });
});
