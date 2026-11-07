// A5 — the AEO check on a schedule, and what must not drift.
//
// The measurement is not new and is not retested here (aeoAgent has its
// own tests). What is new is a CADENCE and a COST GATE, and the one
// thing that can quietly break: a scheduled run that asks a different
// set of questions lands in the same `aeo_presence` table as the
// fixed-set runs and makes every later trend meaningless.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAeoSchedule, aeoSchedulePaused, PAUSED_MESSAGE } from "@/lib/seo/aeoSchedule";
import { code, sourceWithComments } from "./helpers/source";
import { GROUPS, ALL } from "@/lib/automation/cronGroups";

vi.mock("@/lib/agents/aeoAgent", () => ({
  generateAeoCheck: vi.fn(),
}));
vi.mock("@/lib/claims/businessFacts", () => ({
  gatherBusinessFactsSafely: vi.fn(async () => ({
    products: [{ name: "a thing", kind: "product" }],
    businessModels: { models: ["online_store"] },
    category: "a category",
    city: "a city",
  })),
  factsPrompt: vi.fn(() => "\n\nFACTS"),
}));

import { generateAeoCheck } from "@/lib/agents/aeoAgent";

const FIRST = new Date("2026-12-01T06:00:00Z");
const NOT_FIRST = new Date("2026-12-14T06:00:00Z");

function good() {
  return {
    output: {
      visibilityScore: 42,
      scoreLabel: "Content citability",
      scoreBreakdown: [],
      competitivePositioning: [
        { promptTested: "q1", mentioned: true, competitorsMentioned: ["Someone Else"] },
        { promptTested: "q2", mentioned: false, competitorsMentioned: [] },
      ],
      recommendations: [],
      disclosure: "d",
    },
  };
}

function db(over: any = {}) {
  const inserted: any[] = [];
  const client = {
    inserted,
    from(table: string) {
      if (table === "dealerships") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                over.dealership ?? {
                  data: { dealership_name: "A Business", city: "A City", business_category: "a category" },
                  error: null,
                },
            }),
          }),
        };
      }
      if (table === "seo_toolkit_items") {
        return {
          insert: async (row: any) => {
            inserted.push(row);
            return over.saveError ? { error: { message: over.saveError } } : { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as any;
}

beforeEach(() => {
  vi.mocked(generateAeoCheck).mockReset();
  process.env.AEO_SCHEDULE_ENABLED = "true";
});
afterEach(() => {
  delete process.env.AEO_SCHEDULE_ENABLED;
});

describe("1. OFF BY DEFAULT, AND A TYPO DOES NOT TURN IT ON", () => {
  it("IS PAUSED WHEN THE FLAG IS ABSENT", () => {
    delete process.env.AEO_SCHEDULE_ENABLED;
    expect(aeoSchedulePaused()).toBe(true);
  });

  it("AND WHEN IT IS ANYTHING OTHER THAN THE EXACT STRING true", () => {
    for (const v of ["false", "TRUE", "True", "1", "yes", "on", " true", ""]) {
      process.env.AEO_SCHEDULE_ENABLED = v;
      expect(aeoSchedulePaused(), `"${v}" must not start the spend`).toBe(true);
    }
    process.env.AEO_SCHEDULE_ENABLED = "true";
    expect(aeoSchedulePaused()).toBe(false);
  });

  it("A PAUSED RUN CALLS NO MODEL AND SAVES NOTHING", async () => {
    delete process.env.AEO_SCHEDULE_ENABLED;
    const client = db();
    const run = await runAeoSchedule(client, "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.skipped).toMatch(/off/i);
    expect(generateAeoCheck).not.toHaveBeenCalled();
    expect(client.inserted).toHaveLength(0);
  });

  it("and the paused message tells the owner the on-demand check still works", () => {
    // A flag that reads as "the feature is gone" is worse than no flag:
    // the check itself has always run from the SEO toolkit.
    expect(PAUSED_MESSAGE).toMatch(/SEO toolkit/i);
    expect(PAUSED_MESSAGE).toMatch(/trend/i);
  });
});

describe("2. MONTHLY, AND IT DECIDES THAT ITSELF", () => {
  it("RUNS ON THE FIRST", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const run = await runAeoSchedule(db(), "d1", { now: FIRST });
    expect(run.ran).toBe(true);
    expect(run.skipped).toBeNull();
  });

  it("AND ON NO OTHER DAY, WITHOUT CALLING THE MODEL", async () => {
    const client = db();
    const run = await runAeoSchedule(client, "d1", { now: NOT_FIRST });
    expect(run.ran).toBe(false);
    expect(run.skipped).toMatch(/first of the month/i);
    expect(generateAeoCheck).not.toHaveBeenCalled();
  });

  it("the day it decides about is India-local, not UTC", async () => {
    // 2026-11-30T19:00Z is already 1 December in India (+5:30), and a
    // run that used UTC would skip the month entirely for a cron that
    // fires at 03:30 IST.
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const run = await runAeoSchedule(db(), "d1", { now: new Date("2026-11-30T19:00:00Z") });
    expect(run.day).toBe("2026-12-01");
    expect(run.ran).toBe(true);
  });
});

describe("3. THE QUESTION SET MUST NOT DRIFT", () => {
  it("THE FIXED QUESTIONS ARE PASSED TO THE AGENT", async () => {
    // THE LOAD-BEARING ONE. recordPresence writes every run into
    // aeo_presence whatever was asked, and aeoTrend compares the last
    // run with the one before. A run with no question set lets the model
    // choose its own, and that row then breaks the NEXT comparison too.
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const run = await runAeoSchedule(db(), "d1", { now: FIRST });
    // Index 6: name, city, category, brandProfile, logContext,
    // groundingContext, THEN questions. Asserted by POSITION on purpose
    // — the agent takes seven positional arguments and a list handed to
    // the wrong slot would be silently ignored, which is exactly the
    // failure this section exists to catch.
    const args = vi.mocked(generateAeoCheck).mock.calls[0];
    expect(args).toHaveLength(7);
    const questions = args[6] as string[];
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    expect(run.questions).toEqual(questions);
  });

  it("AND THEY ARE THE SAME ONES THE ON-DEMAND PATH BUILDS", () => {
    // Both call aeoQuestionsFor with the dealership row and the facts.
    // If this file ever builds its own list, the two paths diverge and
    // the trend silently compares two different measurements.
    const scheduled = code("src/lib/seo/aeoSchedule.ts");
    const onDemand = code("src/app/api/seo/toolkit/route.ts");
    expect(scheduled).toMatch(/aeoQuestionsFor\(dealership, facts\)/);
    expect(onDemand).toMatch(/aeoQuestionsFor\(dealership, facts\)/);
  });

  it("AND THE SAME FACTS PROMPT, through the same gatherer", () => {
    const scheduled = code("src/lib/seo/aeoSchedule.ts");
    expect(scheduled).toMatch(/gatherBusinessFactsSafely\(supabase, dealershipId\)/);
    expect(scheduled).toMatch(/factsPrompt\(facts\)/);
  });

  it("AN EMPTY QUESTION SET SKIPS THE MONTH instead of letting the model choose", async () => {
    const { gatherBusinessFactsSafely } = await import("@/lib/claims/businessFacts");
    vi.mocked(gatherBusinessFactsSafely).mockResolvedValueOnce({} as any);
    const client = db({
      dealership: { data: { dealership_name: "A Business", city: null, business_category: null }, error: null },
    });
    const run = await runAeoSchedule(client, "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.skipped).toMatch(/no fixed questions/i);
    expect(generateAeoCheck).not.toHaveBeenCalled();
  });
});

describe("4. A BUSINESS WITH NO NAME IS NOT MEASURED", () => {
  it("THE SIGNUP PLACEHOLDER IS NOT JUDGED AS A BUSINESS", async () => {
    // A2 made the same call for the JSON-LD business name: the question
    // is "who does X here, and is THIS business named", and asking it
    // about a business called nothing records an answer about nobody.
    for (const nameValue of [null, "", "   "]) {
      vi.mocked(generateAeoCheck).mockReset();
      const client = db({
        dealership: { data: { dealership_name: nameValue, city: "A City", business_category: "a category" }, error: null },
      });
      const run = await runAeoSchedule(client, "d1", { now: FIRST });
      expect(run.ran).toBe(false);
      expect(run.skipped).toMatch(/no name/i);
      expect(generateAeoCheck).not.toHaveBeenCalled();
    }
  });

  it("and the real name is what is sent, not a fallback string", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    await runAeoSchedule(db(), "d1", { now: FIRST });
    expect(vi.mocked(generateAeoCheck).mock.calls[0][0]).toBe("A Business");
  });

  it("a failed read of the business asks nothing", async () => {
    const client = db({ dealership: { data: null, error: { message: "boom" } } });
    const run = await runAeoSchedule(client, "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.skipped).toMatch(/boom/);
    expect(generateAeoCheck).not.toHaveBeenCalled();
  });
});

describe("5. A FAILURE RECORDS NOTHING, because a saved zero is a lie", () => {
  it("AN AI FAILURE SAVES NO ROW", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue({
      output: good().output,
      _aiFailure: { kind: "overloaded", message: "The AI service is busy." },
    } as any);
    const client = db();
    const run = await runAeoSchedule(client, "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.score).toBeNull();
    expect(client.inserted).toHaveLength(0);
    // The words come from lib/ai/claude.ts, not rewritten here.
    expect(run.skipped).toContain("The AI service is busy.");
  });

  it("AND NEITHER DOES THE AGENT'S OWN FALLBACK", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue({ output: good().output, _fallback: true } as any);
    const client = db();
    const run = await runAeoSchedule(client, "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.score).toBeNull();
    expect(client.inserted).toHaveLength(0);
  });

  it("A SAVE THAT FAILS IS NOT REPORTED AS A RUN", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const run = await runAeoSchedule(db({ saveError: "no room" }), "d1", { now: FIRST });
    expect(run.ran).toBe(false);
    expect(run.skipped).toMatch(/could not be saved/i);
  });
});

describe("6. THE RUN IS VISIBLE WHERE THE OWNER ALREADY LOOKS", () => {
  it("IT IS SAVED AS AN aeo_check TOOLKIT ITEM", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const client = db();
    await runAeoSchedule(client, "d1", { now: FIRST });
    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0].task_type).toBe("aeo_check");
    expect(client.inserted[0].dealership_id).toBe("d1");
    expect(client.inserted[0].output.visibilityScore).toBe(42);
  });

  it("and it counts how many questions named the business", async () => {
    vi.mocked(generateAeoCheck).mockResolvedValue(good() as any);
    const run = await runAeoSchedule(db(), "d1", { now: FIRST });
    expect(run.mentionedIn).toBe(1);
    expect(run.score).toBe(42);
  });

  it("a score that is not a number is reported as unknown, not as zero", async () => {
    const r = good();
    (r.output as any).visibilityScore = undefined;
    vi.mocked(generateAeoCheck).mockResolvedValue(r as any);
    const run = await runAeoSchedule(db(), "d1", { now: FIRST });
    expect(run.ran).toBe(true);
    expect(run.score).toBeNull();
  });
});

describe("7. IT IS IN THE HEAVY GROUP, and the plan was wrong about that", () => {
  it("IT IS IN heavy AND NOT IN signals", () => {
    // cronGroups' own rule: signals is "database-only and fast". This
    // one calls a model with live web search. In signals it would put an
    // LLM call in front of the export email.
    expect(GROUPS.heavy).toContain("aeo_schedule");
    expect(GROUPS.signals).not.toContain("aeo_schedule");
  });

  it("IT RUNS BEFORE daily_autopilot, or it would never run at all", () => {
    // This test asserted the opposite first, and tests/dailyJobs.test.ts
    // disagreed — it pins daily_autopilot as the last subsystem because
    // that is where the budget goes. Last would not mean "lost
    // gracefully", it would mean never reached on the one day a month
    // this does any work. Corrected 7 November 2026.
    expect(GROUPS.heavy.indexOf("aeo_schedule")).toBeLessThan(GROUPS.heavy.indexOf("daily_autopilot"));
    expect(GROUPS.heavy[GROUPS.heavy.length - 1]).toBe("daily_autopilot");
  });

  it("and it sits with the other monthly, flagged-off, third-party work", () => {
    expect(GROUPS.heavy.indexOf("aeo_schedule")).toBe(GROUPS.heavy.indexOf("page_speed") + 1);
  });

  it("and it is registered exactly once, in one group", () => {
    expect(ALL.filter((k) => k === "aeo_schedule")).toHaveLength(1);
  });

  it("THE REASON IT IS NOT IN signals IS WRITTEN DOWN", () => {
    // The plan said signals. A future reader moving it back would be
    // following the plan, so the correction lives beside the key.
    const src = sourceWithComments("src/lib/automation/cronGroups.ts");
    expect(src).toMatch(/A5[\s\S]{0,400}?THE PLAN SAID/);
  });

  it("every subsystem key has a runner, this one included", async () => {
    const { DAILY_RUNNERS } = await import("@/lib/automation/dailyRunners");
    for (const key of ALL) {
      expect(typeof DAILY_RUNNERS[key], `${key} has no runner`).toBe("function");
    }
  });
});

describe("8. THE FLAG IS DOCUMENTED, with what it costs", () => {
  it("THE ENV EXAMPLE DECLARES IT OFF", () => {
    const env = code(".env.example");
    expect(env).toMatch(/^AEO_SCHEDULE_ENABLED=false$/m);
  });

  it("AND SAYS WHAT TURNING IT ON SPENDS", () => {
    // G4's flag assertion once matched a COMMENTED-OUT variable, because
    // code() strips // and not #. So this reads the commentary on
    // purpose and the line above is anchored to the start of a line.
    const env = sourceWithComments(".env.example");
    const at = env.indexOf("AEO_SCHEDULE_ENABLED");
    const section = env.slice(Math.max(0, at - 900), at);
    expect(section).toMatch(/web search/i);
    expect(section).toMatch(/month/i);
  });
});
