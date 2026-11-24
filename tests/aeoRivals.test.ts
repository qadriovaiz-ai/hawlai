// "Nine businesses get named and you do not" — G-a / A4a.
//
// ──────────────────────────────────────────────────────────────────
// THE OWNER'S DECISION, 24 November 2026: no vendor, no contract, no
// terms reading. So this is the GEO piece that uses only what
// `aeo_presence` has ALREADY been recording since migration 199 —
// per run, per question, whether the business was mentioned and who
// was named instead. The trend read our own column and threw the
// other one away.
//
// THE RISK IS NOT THE ARITHMETIC, IT IS THE CLAIM. The rows come from
// a Claude model with live web search, which `aeoAgent`'s fixed
// DISCLOSURE describes as "not a direct query of ChatGPT, Gemini, or
// Perplexity, which Hawlai has no API access to" — the most accurate
// sentence in the SEO toolkit. The obvious wording for this line
// ("ChatGPT names nine competitors and not you") would be FALSE, and
// §2 below is what stops it.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { rivalsNamedInstead, rivalsLine } from "@/lib/seo/aeoRivals";
import { buildDailyReport, everyNumberIsCounted, withoutUncountedBlocks, renderText } from "@/lib/growth/report";
import { maturityOf } from "@/lib/growth/strategy";
import { code } from "./helpers/source";

const DAY = "2026-11-24";
const NOW = new Date("2026-11-24T04:00:00Z");

const tracking = () =>
  ({
    siteEvents: { firing: true, lastAt: "2026-11-23T10:00:00Z", visitorEvents30d: 41, firstAt: "2026-08-01T10:00:00Z" },
    searchConsole: { connected: true, siteUrl: "https://example.test" },
    site: { published: true, why: "your site is published" },
    adsConversions: { verified: true, why: "a campaign has run and a paid order has been recorded in the last 30 days" },
    health: "ok",
  }) as any;

const run = (over: Partial<{ mentioned: boolean[]; competitors: string[][] }> = {}) => {
  const mentioned = over.mentioned ?? [false, false, false, false];
  const competitors = over.competitors ?? [["Aroma Co"], ["Aroma Co", "Wick & Co"], [], ["Scent House"]];
  return mentioned.map((m, i) => ({ question: `q${i}`, mentioned: m, competitors: competitors[i] ?? [] }));
};

describe("1. WHO WAS NAMED, COUNTED ONCE EACH", () => {
  it("A BUSINESS NAMED IN TWO QUESTIONS IS ONE RIVAL, NOT TWO", () => {
    // THE LOAD-BEARING ONE for the number itself. Counting appearances
    // instead of businesses would report nine rivals where there are
    // four, which is exactly the inflated figure the daily report's
    // digit walk exists to keep away from him.
    const summary = rivalsNamedInstead(run());
    expect(summary.rivals.map((r) => r.name)).toEqual(["Aroma Co", "Scent House", "Wick & Co"]);
    expect(summary.rivals[0]).toEqual({ name: "Aroma Co", questions: 2 });
  });

  it("AND THE SAME NAME IN DIFFERENT CASE OR SPACING IS STILL ONE", () => {
    const summary = rivalsNamedInstead([
      { question: "q0", mentioned: false, competitors: ["Candle Studio"] },
      { question: "q1", mentioned: false, competitors: ["candle studio"] },
      { question: "q2", mentioned: false, competitors: ["Candle  Studio "] },
    ]);
    expect(summary.rivals.length).toBe(1);
    expect(summary.rivals[0].questions).toBe(3);
    // Displayed as first seen, not lower-cased for the owner to read.
    expect(summary.rivals[0].name).toBe("Candle Studio");
  });

  it("MOST-NAMED FIRST, then alphabetically so the order is stable", () => {
    // An order that changes between runs reads as new information.
    const summary = rivalsNamedInstead([
      { question: "q0", mentioned: false, competitors: ["Zeta", "Alpha"] },
      { question: "q1", mentioned: false, competitors: ["Alpha"] },
    ]);
    expect(summary.rivals).toEqual([
      { name: "Alpha", questions: 2 },
      { name: "Zeta", questions: 1 },
    ]);
  });

  it("OUR OWN MENTIONS ARE COUNTED FROM THE SAME ROWS", () => {
    const summary = rivalsNamedInstead(run({ mentioned: [true, false, true, false] }));
    expect(summary.ours).toBe(2);
    expect(summary.total).toBe(4);
  });

  it("AND TWICE IN ONE QUESTION IS STILL ONE QUESTION", () => {
    // FOUND BY MUTATION. Every fixture above named a business at most
    // once per question, so keying the tally on the QUESTION rather
    // than on the appearance made no difference to any of them — the
    // count is "how many questions named them", and a search that
    // lists a business twice in one answer must not read as two.
    const summary = rivalsNamedInstead([
      { question: "q0", mentioned: false, competitors: ["Aroma Co", "aroma co", "Aroma  Co"] },
      { question: "q1", mentioned: false, competitors: ["Aroma Co"] },
    ]);
    expect(summary.rivals.length).toBe(1);
    expect(summary.rivals[0].questions, "appearances were counted instead of questions").toBe(2);
  });

  it("empty, blank and missing names are dropped rather than counted", () => {
    const summary = rivalsNamedInstead([
      { question: "q0", mentioned: false, competitors: ["", "   ", null as any, undefined as any, "Real Co"] },
    ]);
    expect(summary.rivals).toEqual([{ name: "Real Co", questions: 1 }]);
  });

  it("and an empty read is not an error", () => {
    expect(rivalsNamedInstead([])).toEqual({ rivals: [], ours: 0, total: 0 });
    expect(rivalsNamedInstead(null as any)).toEqual({ rivals: [], ours: 0, total: 0 });
  });
});

describe("2. THE LINE NAMES NO AI ENGINE", () => {
  it("IT SAYS WEB SEARCH, AND NAMES NO ASSISTANT", () => {
    // THE LOAD-BEARING ONE for the claim. aeoAgent's disclosure is the
    // reason: these rows are a web search, not a question put to any
    // assistant, and the obvious wording would be false.
    const line = rivalsLine(rivalsNamedInstead(run()))!;
    expect(line.text).toMatch(/web search/i);
    for (const engine of ["ChatGPT", "Gemini", "Perplexity", "Copilot", "AI Overview", "Claude"]) {
      expect(line.text, `the line named ${engine}`).not.toContain(engine);
    }
  });

  it("AND IT SAYS WHAT IT IS NOT, in the same breath", () => {
    const line = rivalsLine(rivalsNamedInstead(run()))!;
    expect(line.text).toMatch(/not a question put to any AI assistant/i);
  });

  it("IT CALLS THEM BUSINESSES THAT WERE NAMED, not 'your competitors'", () => {
    // A name that came out of a search is an observation. Nothing here
    // checks it is a real business, a competitor, or even distinct.
    const line = rivalsLine(rivalsNamedInstead(run()))!;
    expect(line.text).not.toMatch(/your competitors|rivals/i);
    expect(line.text).toMatch(/other businesses were named|other business was named/);
  });

  it("the source module does not mention an engine either", () => {
    // Not the comments — the code. A model name reaching a template
    // string here is how the sentence above quietly becomes false.
    const src = code("src/lib/seo/aeoRivals.ts");
    for (const engine of ["ChatGPT", "Gemini", "Perplexity"]) {
      expect(src, `${engine} is named in the code`).not.toContain(engine);
    }
  });
});

describe("3. SILENT WHEN A LINE WOULD BE WORSE THAN NONE", () => {
  it("NO RUN YET, NO LINE", () => {
    // aeoAgent is on demand only and AEO_SCHEDULE_ENABLED is off by
    // default, so most businesses have no rows. "0 of 0" reads like a
    // failure rather than an absence.
    expect(rivalsLine(rivalsNamedInstead([]))).toBeNull();
  });

  it("NAMED EVERY TIME, NO LINE", () => {
    // The finding does not exist, and a line saying so every morning
    // is one the eye learns to skip.
    expect(rivalsLine(rivalsNamedInstead(run({ mentioned: [true, true, true, true] })))).toBeNull();
  });

  it("NOBODY ELSE NAMED, NO LINE", () => {
    // A search that surfaced no business at all says something about
    // the search, not about him.
    expect(rivalsLine(rivalsNamedInstead(run({ competitors: [[], [], [], []] })))).toBeNull();
  });

  it("BUT NAMED ALONGSIDE OTHERS IS STILL A FINDING", () => {
    // "You and nine others" is real, and suppressing it would report
    // only the worst case.
    const line = rivalsLine(rivalsNamedInstead(run({ mentioned: [true, false, false, false] })));
    expect(line).toBeTruthy();
    expect(line!.text).toContain("you were named in 1 of them");
  });

  it("and never named reads as never, not as zero", () => {
    expect(rivalsLine(rivalsNamedInstead(run()))!.text).toContain("you were not named once");
  });
});

describe("4. IT SURVIVES THE DAILY REPORT'S DIGIT WALK", () => {
  const build = (rivals: any) =>
    buildDailyReport({
      dealershipId: "d1",
      day: DAY,
      businessName: "Candle by Qaaf",
      tracking: tracking(),
      maturity: maturityOf({ firstAt: "2026-08-01T10:00:00Z", events: 41 }, NOW),
      counted: [{ label: "Products", value: 6, source: "products" }],
      suggestions: [],
      setupGoals: [],
      activeGoals: 1,
      findingCount: 0,
      rivals,
    });

  it("EVERY FIGURE IN THE LINE IS DECLARED, so the block is not dropped", () => {
    // An undeclared number costs the whole BLOCK — he would hear
    // nothing, and the email would look perfectly normal.
    const report = build(rivalsLine(rivalsNamedInstead(run())));
    const check = everyNumberIsCounted(report);
    expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    const { report: sendable, removed } = withoutUncountedBlocks(report);
    expect(removed, "the rivals line was dropped as uncounted").toEqual([]);
    expect(renderText(sendable)).toMatch(/other businesses were named/);
  });

  it("AND IT HOLDS FOR THE AWKWARD COUNTS TOO", () => {
    // 1 rival, 1 of our own, and a two-digit count — each renders a
    // different sentence, and each has to trace.
    for (const rows of [
      run({ mentioned: [true, false, false, false], competitors: [[], ["Only Co"], [], []] }),
      run({ mentioned: [false, false, false, false], competitors: [["A"], ["B"], ["C"], ["D", "E", "F", "G", "H", "I", "J", "K"]] }),
    ]) {
      const check = everyNumberIsCounted(build(rivalsLine(rivalsNamedInstead(rows))));
      expect(check.offenders, JSON.stringify(check.offenders)).toEqual([]);
    }
  });

  it("NO LINE MEANS NO BLOCK, not an empty one", () => {
    const text = build(null)
      .blocks.filter((b: any) => b.kind === "line")
      .map((b: any) => b.text)
      .join("\n");
    expect(text).not.toMatch(/named/i);
  });
});

describe("5. THE DAILY READ TAKES ONE RUN, NOT A POOL OF THEM", () => {
  it("THE LATEST run_id ONLY", () => {
    // Pooling runs would count a business named in September against
    // questions asked in November, and report a rival that may have
    // stopped appearing months ago.
    const src = code("src/lib/growth/dailyGrowth.ts");
    const at = src.indexOf('from("aeo_presence")');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 900);
    expect(block).toMatch(/const latestRun = rows\[0\]\.run_id/);
    expect(block).toMatch(/filter\(\(r: any\) => r\.run_id === latestRun\)/);
    expect(block).toMatch(/\.order\("run_at", \{ ascending: false \}\)/);
    expect(block).toMatch(/\.eq\("dealership_id", dealershipId\)/);
  });

  it("AND AN UNREADABLE TABLE COSTS THE LINE, NEVER THE EMAIL", () => {
    const src = code("src/lib/growth/dailyGrowth.ts");
    const at = src.indexOf('from("aeo_presence")');
    const block = src.slice(Math.max(0, at - 400), at + 900);
    expect(block).toMatch(/try \{/);
    expect(block).toMatch(/catch/);
    expect(block, "a failed read throws into the report").not.toMatch(/throw/);
  });
});
