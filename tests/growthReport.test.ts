// S4/P4 — THE DAILY REPORT, AND THE EXIT TEST'S OWN WORDS.
//
//   > "Daily email arrives with only counted numbers; each suggestion
//   >  cites evidence and the goal it serves"
//
// Three claims, and the second is the load-bearing one. These tests are
// written so the failing case is the dangerous one: a number the owner
// acts on that nobody counted.
//
// The digit walk matches by VALUE, not by meaning. It stops an invented
// figure, because no counted value equals it. It would not catch a
// counted number given the wrong label — that is a human's job on the
// first real email, and saying so here is part of the test.

import { describe, it, expect, afterEach } from "vitest";
import { buildDailyReport, everyNumberIsCounted, renderText, type DailyReport } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";
import type { Counted } from "@/lib/growth/audit";
import type { StrategistRow } from "@/lib/growth/strategist";
import type { TrackingState } from "@/lib/growth/tracking";

const ORIGINAL = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL;
});

const NOW = new Date("2026-10-23T04:00:00.000Z");
const DAY = "2026-10-23";

function tracking(over: Partial<TrackingState> = {}): TrackingState {
  return {
    siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
    ...over,
  };
}

const COUNTED: Counted[] = [
  { label: "pages", value: 4, source: "website_pages" },
  { label: "products", value: 6, source: "products" },
  { label: "products with a description", value: 2, source: "products.description" },
];

function row(over: Partial<StrategistRow> = {}): StrategistRow {
  return {
    id: "o1",
    type: "products_without_description",
    reference_id: "singleton",
    title: "4 of 6 products have no description",
    impact: 4,
    confidence: 5,
    effort: 2,
    evidence: [{ kind: "product", id: "x1" }],
    goal_id: "g1",
    rejected_at: null,
    last_surfaced_on: null,
    status: "open",
    ...over,
  };
}

function build(over: Partial<Parameters<typeof buildDailyReport>[0]> = {}): DailyReport {
  return buildDailyReport({
    dealershipId: "d1",
    day: DAY,
    businessName: "A Business",
    tracking: tracking(),
    maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
    counted: COUNTED,
    suggestions: [{ row: row(), goalTitle: "Describe every product" }],
    setupGoals: [],
    activeGoals: 1,
    findingCount: 1,
    ...over,
  });
}

function buildThin(): DailyReport {
  return build({
    maturity: maturityOf({ firstAt: "2026-10-21T00:00:00Z", events: 3 }, NOW),
    suggestions: [],
    activeGoals: 0,
    findingCount: 2,
    setupGoals: [
      { key: "k1", title: "Describe every product", description: "d", targetMetric: "products with a description", targetValue: 6, basis: [{ kind: "counted", id: "products" }] },
      { key: "k2", title: "Publish the website", description: "d", targetMetric: null, targetValue: null, basis: [] },
    ],
  });
}

describe("1. only counted numbers", () => {
  it("THE WHOLE REPORT PASSES THE DIGIT WALK", () => {
    const report = build();
    const check = everyNumberIsCounted(report);
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("AND AN INVENTED FIGURE IS CAUGHT, wherever it is put", () => {
    // The failure this check exists for: a figure nobody counted,
    // arriving in prose.
    const report = build();
    report.blocks.push({ kind: "line", text: "Your traffic is up 300% this week.", numbers: [] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("300");
  });

  it("A STAT CANNOT PRINT A VALUE IT DID NOT DECLARE", () => {
    const report = build();
    report.blocks.push({ kind: "stat", number: { label: "orders", value: 12, source: "orders" } });
    expect(everyNumberIsCounted(report).ok).toBe(true);
    // Mislabel the declaration and the digit no longer matches.
    report.blocks.push({ kind: "line", text: "You had 99 orders.", numbers: [{ label: "orders", value: 12, source: "orders" }] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("99");
  });

  it("A SUGGESTION'S OWN TITLE IS SUBJECT TO THE SAME RULE", () => {
    // A finding's title carries its own count. If that number is not
    // one this report counted, the walk refuses it — so a finding
    // cannot smuggle a figure in through its wording.
    const report = build({ suggestions: [{ row: row({ title: "9999 products have no description" }), goalTitle: "Describe every product" }] });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders.map((o) => o.found)).toContain("9999");
  });

  it("EVERY COUNTED NUMBER NAMES WHERE IT WAS COUNTED", () => {
    for (const c of build().counted) expect(String(c.source).trim()).not.toBe("");
  });

  it("AND SO DOES EVERY NUMBER A BLOCK DECLARES", () => {
    // The report-level list was the only thing checked before, and a
    // mutation that blanked a SETUP TARGET's source survived it. A
    // number with no source is exactly what this stage exists to stop,
    // wherever it is declared.
    for (const report of [build(), buildThin()]) {
      for (const b of report.blocks) {
        const declared = b.kind === "stat" ? [b.number] : b.kind === "setup" ? (b.target ? [b.target] : []) : b.numbers;
        for (const n of declared) {
          expect(String(n.source).trim(), `${b.kind}: ${n.label}`).not.toBe("");
        }
      }
    }
  });

  it("and the rendered text contains no CLAIM digit the structure did not allow", () => {
    // Rendered, not just structural: the email is what the owner reads.
    //
    // THREE LINES ARE EXCLUDED, all for the same reason — none of them
    // makes a claim about the business. The SUBJECT counts the email's
    // own sections, which the reader can verify by glancing down the
    // page; it is pinned separately and exactly by
    // "THE SUBJECT'S ONLY NUMBER IS A COUNT OF ITS OWN SECTIONS", so
    // the exemption cannot widen into "the subject may say anything".
    //
    // The other two, for the same reason —
    // they carry no claim about the business: the day line, which is
    // the report's own timestamp, and the "Based on" line, which is
    // evidence IDENTIFIERS. "product:x1" has a 1 in it and it is a
    // pointer, not a figure. The structural check does not cover them
    // either, and this says so rather than quietly stripping them: a
    // smuggled number would have to be put inside a row id generated
    // by code.
    const report = build();
    const allowed = new Set<string>();
    for (const b of report.blocks) {
      const declared = b.kind === "stat" ? [b.number] : b.kind === "setup" ? (b.target ? [b.target] : []) : b.numbers;
      for (const n of declared) allowed.add(String(n.value));
    }
    const claimLines = renderText(report)
      .split("\n")
      .filter((l, i) => i !== 0 && !l.startsWith("For ") && !l.trimStart().startsWith("Based on:"));
    for (const line of claimLines) {
      for (const found of line.match(/\d[\d,.]*/g) ?? []) {
        expect(allowed.has(found.replace(/[.,]+$/, "")), `${found} in: ${line}`).toBe(true);
      }
    }
  });
});

describe("2. no model is asked anything on this path", () => {
  it("BUILDING AND RENDERING ATTEMPT NO CALL AT ALL", async () => {
    // Counted by attempt, not by throw: a thrown error can be
    // swallowed downstream and leave a test green while a model is
    // called on every report. That mistake is recorded in copyAudit's
    // own tests, where it survived a mutation check.
    const calls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url));
      throw new Error("the report must not call a model");
    }) as typeof fetch;
    const report = build();
    renderText(report);
    everyNumberIsCounted(report);
    expect(calls).toEqual([]);
  });
});

describe("3. each suggestion cites evidence and the goal it serves", () => {
  it("BOTH ARE RENDERED", () => {
    const text = renderText(build());
    expect(text).toMatch(/SUGGESTION — 4 of 6 products have no description/);
    expect(text).toMatch(/Toward your goal: Describe every product/);
    expect(text).toMatch(/Based on: product:x1/);
  });

  it("A SUGGESTION WITH NO EVIDENCE IS NOT RENDERED AT ALL", () => {
    const report = build({ suggestions: [{ row: row({ evidence: [] }), goalTitle: "Describe every product" }] });
    expect(report.blocks.filter((b) => b.kind === "suggestion")).toEqual([]);
    expect(renderText(report)).not.toMatch(/SUGGESTION/);
  });

  it("AND NEITHER IS ONE WITH NO GOAL", () => {
    const report = build({ suggestions: [{ row: row(), goalTitle: "   " }] });
    expect(report.blocks.filter((b) => b.kind === "suggestion")).toEqual([]);
  });
});

describe("4. the measurement health line is in every report", () => {
  it("IS THERE WHEN TRACKING IS HEALTHY", () => {
    expect(renderText(build())).toMatch(/Measurement health: OK\./);
  });

  it("AND WHEN IT IS BROKEN — §2c says every report", () => {
    const broken = tracking({
      siteEvents: { firing: false, lastAt: null, visitorEvents30d: 0, firstAt: null },
      searchConsole: { connected: false, siteUrl: null },
      adsConversions: { verified: false, why: "no ad campaign has run, so there is nothing to attribute" },
      health: "broken",
    });
    const report = build({ tracking: broken, maturity: maturityOf({ firstAt: null, events: 0 }, NOW) });
    const text = renderText(report);
    expect(text).toMatch(/Measurement health: BROKEN\./);
    expect(text).toMatch(/NOT being recorded/);
    expect(everyNumberIsCounted(report).ok).toBe(true);
  });

  it("and it says the owner's own visits were excluded", () => {
    expect(renderText(build())).toMatch(/your own visits excluded/);
  });
});

describe("5. the thin branch", () => {
  const thin = () =>
    build({
      maturity: maturityOf({ firstAt: "2026-10-21T00:00:00Z", events: 3 }, NOW),
      tracking: tracking({ siteEvents: { firing: true, lastAt: "2026-10-22T10:00:00Z", visitorEvents30d: 3, firstAt: "2026-10-21T00:00:00Z" } }),
      suggestions: [],
      activeGoals: 0,
      findingCount: 2,
      setupGoals: [
        { key: "products_without_description", title: "Describe every product", description: "Nothing to cite otherwise.", targetMetric: "products with a description", targetValue: 6, basis: [{ kind: "counted", id: "products" }] },
        { key: "site_unpublished", title: "Publish the website", description: "Nobody outside can open it.", targetMetric: null, targetValue: null, basis: [] },
      ],
    });

  it("SAYS STILL LEARNING, and shows setup steps instead of targets", () => {
    const text = renderText(thin());
    expect(text).toMatch(/Still learning:/);
    expect(text).toMatch(/setup, not targets/);
    expect(text).toMatch(/SETUP STEP — Describe every product/);
    expect(text).toMatch(/Target: products with a description — 6/);
  });

  it("A SETUP STEP WITH NO COUNTED TARGET SHOWS NO FIGURE", () => {
    const text = renderText(thin());
    expect(text).toMatch(/SETUP STEP — Publish the website/);
    const section = text.slice(text.indexOf("Publish the website"));
    expect(section).not.toMatch(/Target:/);
  });

  it("AND THE THIN REPORT STILL PASSES THE DIGIT WALK", () => {
    const check = everyNumberIsCounted(thin());
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
  });

  it("setup steps are not shown once there is enough history", () => {
    const report = build({ activeGoals: 1, setupGoals: [{ key: "k", title: "T", description: "d", targetMetric: null, targetValue: null, basis: [] }] });
    expect(report.blocks.filter((b) => b.kind === "setup")).toEqual([]);
  });
});

describe("7. the subject promises only what is in the email", () => {
  // THE DRY RUN OF 23 OCTOBER CAUGHT THIS. The subject said "what I did
  // and what I would do next" over a report with no account of anything
  // done — S4 audits and suggests, it does not act. A subject line is
  // the first sentence the owner reads and it was overstating by a
  // whole section.

  it("COUNTS SUGGESTIONS WHEN THERE ARE ANY", () => {
    expect(build().subject).toBe("A Business — 1 suggestion for today");
  });

  it("COUNTS SETUP STEPS WHEN THERE ARE NO SUGGESTIONS", () => {
    expect(buildThin().subject).toBe("A Business — 2 setup steps to get started");
  });

  it("AND SAYS SO PLAINLY WHEN THERE IS NOTHING TO FLAG", () => {
    const quiet = build({ suggestions: [], setupGoals: [], findingCount: 0 });
    expect(quiet.subject).toBe("A Business — your daily check, nothing to flag");
  });

  it("THE SUBJECT'S ONLY NUMBER IS A COUNT OF ITS OWN SECTIONS", () => {
    // The digit walk skips the subject line, so this is what keeps that
    // exemption narrow: a subject that said "41 visits this month"
    // would fail here even though the walk would not see it.
    for (const r of [build(), buildThin(), build({ suggestions: [], setupGoals: [], findingCount: 0 })]) {
      const sections = r.blocks.filter((b) => b.kind === "suggestion" || b.kind === "setup").length;
      const digits = (r.subject.match(/\d+/g) ?? []).map(Number);
      expect(digits.length).toBeLessThanOrEqual(1);
      if (digits.length) expect(digits[0]).toBe(sections);
    }
  });

  it("NEVER CLAIMS TO HAVE DONE ANYTHING", () => {
    // S4 takes no actions at all. The day it does, the subject may say
    // so — and this test will be the thing that makes someone change
    // it deliberately rather than by accident.
    for (const r of [build(), buildThin(), build({ suggestions: [], setupGoals: [], findingCount: 0 })]) {
      expect(r.subject).not.toMatch(/what I did|I have done|completed|applied/i);
    }
  });
});

describe("8. the report cannot say nothing is wrong while something is", () => {
  // THE BUG THE FIRST REAL DRY RUN FOUND, 23 October 2026.
  // candle_by_qaaf: 44 days of data, 55 events — past the thin
  // threshold — and zero goals. Setup steps rendered only in the
  // learning state; suggestions need a goal. So two real findings
  // (5 pages with no search title, 1 product with no image) rendered
  // as nothing at all, and the subject said "nothing to flag".

  it("SETUP STEPS SHOW WHENEVER THERE IS NO PLAN, not only when the data is thin", () => {
    const report = build({
      maturity: maturityOf({ firstAt: "2026-09-09T00:00:00Z", events: 55 }, NOW), // ready
      activeGoals: 0,
      findingCount: 2,
      suggestions: [],
      setupGoals: [
        { key: "a", title: "Give every page a search title", description: "d", targetMetric: "pages with a search title", targetValue: 4, basis: [{ kind: "counted", id: "website_pages" }] },
        { key: "b", title: "Add an image to every product", description: "d", targetMetric: null, targetValue: null, basis: [] },
      ],
    });
    expect(report.blocks.filter((b) => b.kind === "setup")).toHaveLength(2);
    expect(report.subject).toBe("A Business — 2 setup steps to get started");
  });

  it("AND NEVER SAYS 'WORKING TO YOUR PLAN' WITH NO PLAN", () => {
    const report = build({
      maturity: maturityOf({ firstAt: "2026-09-09T00:00:00Z", events: 55 }, NOW),
      activeGoals: 0,
      findingCount: 2,
      suggestions: [],
      setupGoals: [],
    });
    const text = renderText(report);
    expect(text).not.toMatch(/Working to your plan/);
    expect(text).toMatch(/No plan is approved yet/);
  });

  it("'NOTHING TO FLAG' REQUIRES THAT NOTHING WAS FOUND", () => {
    const stuck = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2 });
    expect(stuck.subject).not.toMatch(/nothing to flag/);
    expect(stuck.subject).toBe("A Business — 2 things I could not put in front of you");
  });

  it("AND THE BODY EXPLAINS IT, not just the subject", () => {
    const stuck = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2 });
    const text = renderText(stuck);
    expect(text).toMatch(/could not put them in front of you/);
    expect(text).toMatch(/which goal they serve/);
    // And that count is a declared number like every other.
    expect(everyNumberIsCounted(stuck).ok).toBe(true);
  });

  // S4/P6, 1 November 2026. THIS BLOCK USED TO END WITH "Approve a plan
  // and they will appear here", and this test used to assert that
  // sentence was present. Nothing wrote a drafted setup step into
  // `goals`, so there was never a plan to approve: the email named a
  // mechanism that did not exist, every morning from 24 October.
  //
  // THE ASSERTION WAS WIDENED, NOT RELAXED. It used to check one
  // sentence in one case; it now checks both cases, and that the one
  // sentence that cannot be acted on is gone.
  it("NEVER TELLS HIM TO APPROVE SOMETHING WITH NOTHING TO APPROVE", () => {
    const stuck = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2 });
    const text = renderText(stuck);
    expect(text).not.toMatch(/Approve a plan/);
    expect(text).toMatch(/nothing waiting on your Tasks page/);
    expect(everyNumberIsCounted(stuck).ok).toBe(true);
  });

  it("AND SENDS HIM TO THE TASKS PAGE ONLY WHEN DRAFTS ARE ACTUALLY WAITING", () => {
    const waiting = build({
      suggestions: [],
      setupGoals: [],
      activeGoals: 1,
      findingCount: 2,
      pendingSetupDrafts: 3,
    });
    const text = renderText(waiting);
    expect(text).toMatch(/3 setup steps are waiting on your Tasks page/);
    expect(text).not.toMatch(/nothing waiting/);
    // The 3 is a declared number, same as every other digit in the email.
    expect(everyNumberIsCounted(waiting).ok).toBe(true);
  });

  it("and one waiting step is one step, not 1 steps", () => {
    const one = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 2, pendingSetupDrafts: 1 });
    expect(renderText(one)).toMatch(/1 setup step is waiting/);
  });

  it("while a genuinely quiet day still reads as quiet", () => {
    const quiet = build({ suggestions: [], setupGoals: [], activeGoals: 1, findingCount: 0 });
    expect(quiet.subject).toBe("A Business — your daily check, nothing to flag");
    expect(renderText(quiet)).not.toMatch(/could not put/);
  });
});

describe("9. an AI failure owns the top of the email and the subject line", () => {
  // WHY THIS EXISTS, 1 November 2026. The product's AI was dead for nine
  // days and the owner found out because a cost table was empty. The
  // daily report kept arriving and kept saying nothing, because the
  // audit is model-free and so the report had no idea anything was
  // wrong. The one thing that reaches him every morning was the one
  // place not saying it.
  const failed = () =>
    build({
      aiFailure: { label: "AI unavailable (credits)", message: "AI features are temporarily unavailable on our side." },
    });

  it("IS THE FIRST BLOCK, above everything else", () => {
    const report = failed();
    expect(report.blocks[0].kind).toBe("alert");
  });

  it("AND IT OWNS THE SUBJECT LINE", () => {
    // "2 setup steps" over a dead AI tells the owner the wrong thing
    // first, which is exactly what nine days of reports did.
    expect(failed().subject).toBe("A Business — AI unavailable (credits)");
    expect(failed().subject).not.toMatch(/setup step|suggestion/);
  });

  it("SAYS THE REST WAS WORKED OUT WITHOUT IT, so the numbers still read as trustworthy", () => {
    const text = renderText(failed());
    expect(text).toMatch(/AI unavailable \(credits\)/);
    expect(text).toMatch(/worked out without it, from your own records/);
    // And the report is still sound: the audit never needed a model.
    expect(everyNumberIsCounted(failed()).ok).toBe(true);
  });

  it("AN ARMED COPY AUDIT THAT COULD NOT FINISH ALSO SAYS SO", () => {
    // Silence there would read as "your copy is fine", which is what
    // nobody checked.
    const report = build({ copyAuditUnverified: true });
    expect(report.blocks[0].kind).toBe("alert");
    expect(renderText(report)).toMatch(/could not finish checking your page copy/);
  });

  it("AND SAYS WHICH CHECK DID NOT FINISH WHEN IT LOOKED AT SOMETHING", () => {
    // 3 NOVEMBER 2026. The copy audit has a free layer (placeholders
    // and unsupported wording) and a paid one (the claims a line
    // makes). `copyAuditUnverified` means only the SECOND did not
    // finish — and the alert said "nothing below says anything about
    // it" over an email carrying a copy suggestion with five evidence
    // ids. It was contradicting its own body.
    const report = build({ copyAuditUnverified: true, copyLinesSeen: 96 });
    const text = renderText(report);
    expect(text).toMatch(/could not finish the deeper check/);
    expect(text).not.toMatch(/nothing below says anything about it/);
  });

  it("AND A HALF-FINISHED COPY CHECK DOES NOT TAKE THE SUBJECT", () => {
    // It took it, and took it as a whole sentence: subjectFor read the
    // alert's text up to its first " — ", and that text has none. So
    // the subject became the entire apology while three usable
    // suggestions went unmentioned.
    const report = build({ copyAuditUnverified: true, copyLinesSeen: 96 });
    expect(report.subject).toBe("A Business — 1 suggestion for today");
    expect(report.subject).not.toMatch(/could not finish/);
    // The note is still there, and still first.
    expect(report.blocks[0].kind).toBe("alert");
  });

  it("A DEAD AI STILL TAKES THE SUBJECT, by a short headline", () => {
    const report = build({ aiFailure: { label: "AI unavailable (credits)", message: "m" } });
    expect(report.subject).toBe("A Business — AI unavailable (credits)");
  });

  it("THE AI FAILURE WINS over the copy-audit note, because it is the bigger fact", () => {
    const report = build({
      aiFailure: { label: "AI unavailable (credits)", message: "m" },
      copyAuditUnverified: true,
    });
    expect(report.blocks.filter((b) => b.kind === "alert")).toHaveLength(1);
    expect(report.subject).toMatch(/AI unavailable/);
  });

  it("and a healthy run carries no alert at all", () => {
    const report = build();
    expect(report.blocks.some((b) => b.kind === "alert")).toBe(false);
    expect(report.subject).toMatch(/suggestion/);
  });
});

describe("6. nothing in the report names a trade", () => {
  it("THE WHOLE RENDERED EMAIL IS TRADE-FREE", () => {
    const text = renderText(thin2());
    expect(text).not.toMatch(/candle|ghee|salon|dairy|paneer|keratin/i);
  });

  function thin2() {
    return build({
      suggestions: [{ row: row(), goalTitle: "Describe every product" }],
      setupGoals: [],
    });
  }
});

describe("10. the declared set is wider than the shown set, and that is what sends the email", () => {
  // 3 NOVEMBER 2026, THE REAL ONE. The founder confirmed two goals,
  // suggestions became renderable for the first time, and the whole
  // email was dropped over the "5" in "5 pages have no search title" —
  // the audit had counted those five pages and declared only the
  // complement, "pages with a search title: 1".

  const SHOWN: Counted[] = [
    { label: "pages", value: 6, source: "website_pages" },
    { label: "pages with a search title", value: 1, source: "website_pages.seo_title" },
    { label: "products", value: 2, source: "products" },
    { label: "products with an image", value: 1, source: "products.images" },
  ];
  const ALSO: Counted[] = [
    { label: "pages with no search title", value: 5, source: "website_pages.seo_title" },
    { label: "products with no image", value: 1, source: "products.images" },
  ];
  const suggestion = {
    row: row({ type: "pages_without_search_title", title: "5 pages have no search title", evidence: [{ kind: "website_page", id: "p1" }] }),
    goalTitle: "Give every page a search title",
  };

  it("WITHOUT THE DEFICIT DECLARED, THE REPORT IS REFUSED — which is what happened", () => {
    const report = build({ counted: SHOWN, suggestions: [suggestion], setupGoals: [], activeGoals: 2, findingCount: 3 });
    const check = everyNumberIsCounted(report);
    expect(check.ok).toBe(false);
    expect(check.offenders).toEqual([{ block: "suggestion", found: "5" }]);
  });

  it("AND WITH IT DECLARED, THE SAME REPORT PASSES", () => {
    const report = build({
      counted: SHOWN,
      declared: [...SHOWN, ...ALSO],
      suggestions: [suggestion],
      setupGoals: [],
      activeGoals: 2,
      findingCount: 3,
    });
    expect(everyNumberIsCounted(report).ok).toBe(true);
    expect(report.subject).toBe("A Business — 1 suggestion for today");
  });

  it("AND THE EXTRA NUMBERS ARE NOT SHOWN AS LINES OF THEIR OWN", () => {
    // Putting them in `counted` would also have fixed the drop, and
    // taken a six-line email to eleven, half of them the same fact
    // twice. The owner sees the shown set; the walk uses both.
    const report = build({
      counted: SHOWN,
      declared: [...SHOWN, ...ALSO],
      suggestions: [suggestion],
      setupGoals: [],
      activeGoals: 2,
      findingCount: 3,
    });
    expect(report.blocks.filter((b) => b.kind === "stat")).toHaveLength(SHOWN.length);
    expect(renderText(report)).not.toMatch(/pages with no search title/);
  });

  it("AND A CALLER THAT PASSES NO DECLARED SET STILL HAS ITS NUMBERS ACCEPTED", () => {
    // COMPARING RENDERED TEXT WAS NOT ENOUGH. The first version of this
    // did exactly that, and renderText does not depend on the declared
    // set at all — so a mutation defaulting `declared` to [] passed it
    // and was caught by some other test instead. What matters is that
    // the fallback is `counted`, which only a soundness check shows.
    const suggestion = {
      row: row({ title: "2 of 6 products have no description" }),
      goalTitle: "Describe every product",
    };
    const shown: Counted[] = [
      { label: "products", value: 6, source: "products" },
      { label: "products with no description", value: 2, source: "products.description" },
    ];
    const without = build({ counted: shown, suggestions: [suggestion], setupGoals: [], activeGoals: 1, findingCount: 1 });
    expect(everyNumberIsCounted(without).ok).toBe(true);
    const withSame = build({ counted: shown, declared: shown, suggestions: [suggestion], setupGoals: [], activeGoals: 1, findingCount: 1 });
    expect(renderText(without)).toBe(renderText(withSame));
    expect(everyNumberIsCounted(withSame).ok).toBe(true);
  });
});
