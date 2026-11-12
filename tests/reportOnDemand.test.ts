// The daily run stops emailing, and the one thing that depended on the
// email keeps its voice.
//
// THE FOUNDER'S DECISION, 12 November 2026: the growth agent keeps
// checking and fixing in the background, and a report is something he
// asks for rather than something that arrives every morning.
//
// WHAT I GOT WRONG WHILE PLANNING THIS, recorded because it nearly cost
// a real regression: I told him THREE things hung on the daily email —
// the Tier 3 interview question, the S7 demotion notice and the
// AI-failure notice. Only the first did. `lib/ai/claude.ts` emits a
// `platform_ai_unavailable` notification on every AI failure and
// `lib/autonomy/demotion.ts` emits `autonomy_lowered`, both without any
// help from the report. I had read two code comments — "the owner hears
// about a demotion in the daily email", "the only part of this loop that
// reaches the owner" — and believed them instead of checking what the
// code does. Both comments are true of their own loop and false of the
// product.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";

describe("1. THE DAILY RUN DOES THE WORK AND SENDS NOTHING", () => {
  const autopilot = () => code("src/lib/agents/autopilotAgent.ts");

  it("IT CALLS runGrowthWork, NOT runDailyGrowth", () => {
    const src = autopilot();
    expect(src).toMatch(/await runGrowthWork\(/);
    expect(src).not.toMatch(/await runDailyGrowth\(/);
  });

  it("AND NOTHING IN THE DAILY LOOP BUILDS OR SENDS A REPORT", () => {
    const src = autopilot();
    expect(src).not.toMatch(/buildGrowthReport|buildDailyReport|sendDealerEmail/);
  });

  it("THE RUN LOG SAYS WHY NOTHING WAS SENT", () => {
    // A bare `sent: false` with no reason is how a working product
    // looks broken to whoever reads the log next.
    const src = autopilot();
    expect(src).toMatch(/notSentBecause: "reports are built when the owner asks for one/);
  });

  it("and the work's own counts are what the log reports", () => {
    const src = autopilot();
    expect(src).toMatch(/findings: work\.findings\.length/);
    expect(src).toMatch(/suggestions: work\.suggestions\.length/);
    expect(src).toMatch(/setupSteps: work\.setupGoals\.length/);
  });

  it("AND THE REPORT BUILDER IS STILL THERE for the on-demand path", () => {
    // R2b removes the daily send, not the ability to produce a report.
    const growth = code("src/lib/growth/dailyGrowth.ts");
    expect(growth).toMatch(/export async function buildGrowthReport\(/);
    expect(growth).toMatch(/export async function runDailyGrowth\(/);
  });
});

describe("2. THE TIER 3 QUESTION KEEPS ITS VOICE", () => {
  const route = () => code("src/app/api/interview/route.ts");

  it("THE INTERVIEW CARD ASKS FOR A GAP BEFORE THE NEXT ON THE LIST", () => {
    // A fact that has already cost the owner a deleted line is worth
    // more than the next question in the registry's order.
    const src = route();
    expect(src).toMatch(/findMissingFact\(supabase, dealershipId\)/);
    expect(src).toMatch(/next = gapQuestion/);
  });

  it("AND IT SENDS THE REASON WITH IT", () => {
    // "I had to cut a line twice because I do not have your price
    // range" is a different request from "what is your price range".
    const src = route();
    // THE ASSIGNMENT, not the word. Mutation M7 deleted the line that
    // puts the reason on the response and survived, because /because/
    // still matched the variable's own declaration and the response
    // field beside it — satisfied by any occurrence, again.
    expect(src).toMatch(/because = gap\.line\.text;/);
    const card = code("src/components/settings/InterviewCard.tsx");
    expect(card).toMatch(/\{because &&/);
  });

  it("AN ORDINARY QUESTION CARRIES NO REASON, so none is invented", () => {
    const src = route();
    expect(src).toMatch(/let because: string \| null = null;/);
    const card = code("src/components/settings/InterviewCard.tsx");
    expect(card).toMatch(/setBecause\(typeof data\.because === "string"/);
  });

  it("SERVING IT RECORDS NOTHING — findMissingFact only reads", () => {
    // THE LOAD-BEARING ONE. The email version records the ask before
    // returning it, because an email is pushed whether or not it is
    // read. A card is not pushed: the question sits there until the
    // owner answers or skips, both of which nextGapToAsk already treats
    // as dealt with. Recording on a page view would burn the one
    // question the product gets to ask.
    const gaps = code("src/lib/onboarding/factGaps.ts");
    const finder = gaps.slice(
      gaps.indexOf("export async function findMissingFact"),
      gaps.indexOf("export async function askForMissingFact")
    );
    expect(finder.length).toBeGreaterThan(400);
    expect(finder).not.toMatch(/upsert|update\(|insert\(/);
  });

  it("AND THE PUSHING VERSION STILL RECORDS FIRST, for the email path", () => {
    const gaps = code("src/lib/onboarding/factGaps.ts");
    const pusher = gaps.slice(gaps.indexOf("export async function askForMissingFact"));
    expect(pusher).toMatch(/from\("interview_answers"\)\.upsert/);
  });

  it("a gap that cannot be read leaves the ordinary question standing", () => {
    const src = route();
    const block = src.slice(src.indexOf("findMissingFact"));
    expect(block).toMatch(/catch/);
    expect(block).not.toMatch(/catch[\s\S]{0,80}throw/);
  });
});

describe("3. THE TWO NOTICES THAT NEVER DEPENDED ON THE EMAIL", () => {
  it("AN AI FAILURE NOTIFIES BY ITSELF", () => {
    expect(code("src/lib/ai/claude.ts")).toMatch(/kind: "platform_ai_unavailable"/);
  });

  it("AND A DEMOTION NOTIFIES BY ITSELF, with a dedupe key", () => {
    const demotion = code("src/lib/autonomy/demotion.ts");
    expect(demotion).toMatch(/kind: "autonomy_lowered"/);
    // Without the key, a demotion that is re-detected every morning is
    // a notification every morning.
    expect(demotion).toMatch(/dedupeKey: `autonomy_lowered:/);
  });

  it("AND THE CORRECTION IS WRITTEN DOWN, so the comments stop misleading", () => {
    // The two comments I believed are still there and still true of
    // their own loop. What was missing was anywhere saying that the
    // product does not depend on them.
    const src = sourceWithComments("tests/reportOnDemand.test.ts");
    expect(src).toMatch(/Only the first did/);
  });
});
