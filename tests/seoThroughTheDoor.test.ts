// THE TWO SEO TASKS A STRANGER READS — S6/P5.
//
// `oneDoorForCopy.test.ts` carried `seoToolkitAgent.ts` on its
// MIGRATING list from 2026-10-11 with the debt written out: it HAD
// claims and provenance (`guardOrMark`), and it was MISSING "the
// genericness verdict and the key strip for its two customer-facing
// tasks, meta_tags and gbp_optimization". That entry is deleted now,
// which is what makes this file the thing that holds the claim up.
//
// WHAT A STRANGER READS. `meta_tags` writes the title and description
// in a search result; `gbp_optimization` writes what appears on Google
// Maps. Both are copy in front of a customer.
//
// AND THE EIGHT THAT STAY OUT, by the entry's own words: a keyword
// list, a technical audit, a competitor read — owner-facing advice. A
// door built for customer copy would put a customer-first ordering and
// a word cap on a table of keywords. So this file asserts the BOUNDARY
// as well as the migration: two tasks in, eight tasks out, and the
// difference visible in what the model is actually sent.
//
// WHY THESE ARE BEHAVIOURAL AND NOT GREPS: the key strip is the guard
// that failed in public on 11 October, when a Facebook caption carried
// the words "Concrete_details_used" — a key the MODEL invented. The
// only convincing test is to have a model invent one and watch it not
// come out.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { code } from "./helpers/source";

const claudeCall = vi.fn();
vi.mock("@/lib/ai/claude", () => ({
  callClaude: (...args: any[]) => claudeCall(...args),
  withAiFailure: (fallback: any) => fallback,
  aiFailureMessage: () => "AI unavailable",
}));
vi.mock("@/lib/seo/searchQueries", () => ({ formatQueriesForPrompt: () => "" }));

import { generateSeoTask } from "@/lib/agents/seoToolkitAgent";

function claudeReturns(json: object) {
  claudeCall.mockResolvedValue({ ok: true, text: JSON.stringify(json), data: { content: [] } });
}

/** The prompt text the model was actually sent. */
function promptSent(): string {
  const call = claudeCall.mock.calls.at(-1);
  return String(call?.[0]?.messages?.[0]?.content ?? "");
}

const run = (taskKey: string) =>
  generateSeoTask(taskKey, "Candle by Qaaf", "Shahjahanpur", "candles", null, undefined, undefined, []);

describe("1. THE KEY STRIP NOW RUNS ON WHAT A STRANGER READS", () => {
  beforeEach(() => claudeCall.mockReset());

  it("AN INVENTED KEY DOES NOT COME OUT OF meta_tags", async () => {
    // The 11 October leak, in this surface's shape. The key is not "_"
    // prefixed and is not on any denylist — it is refused by SHAPE,
    // because nobody can enumerate what a model will call a field it
    // made up for its own bookkeeping.
    claudeReturns({
      metaTitle: "Candle by Qaaf — Hand-poured soy candles in Shahjahanpur",
      metaDescription: "Soy candles poured by hand in small batches in Shahjahanpur.",
      Concrete_details_used: "small batches, Shahjahanpur",
    });
    const { output } = await run("meta_tags");
    expect(output).not.toHaveProperty("Concrete_details_used");
    expect(JSON.stringify(output)).not.toContain("Concrete_details_used");
    // And the real copy survived, which is the half a strip can break.
    expect(output.metaTitle).toContain("Candle by Qaaf");
    expect(output.metaDescription).toContain("Shahjahanpur");
  });

  it("AND NOT OUT OF gbp_optimization EITHER", async () => {
    // The task's REAL shape, from SEO_TASKS: {description, categories,
    // postIdeas}. Worth using verbatim, because a key strip that
    // deleted `categories` or `postIdeas` would be a silent data loss
    // and this is where it would show.
    claudeReturns({
      description: "Hand-poured soy candles made in Shahjahanpur.",
      categories: ["Candle store"],
      postIdeas: ["A new scent this week"],
      Invented_Bookkeeping_Key: "x",
    });
    const { output } = await run("gbp_optimization");
    expect(output).not.toHaveProperty("Invented_Bookkeeping_Key");
    expect(output.description).toContain("Shahjahanpur");
    expect(output.categories).toEqual(["Candle store"]);
    expect(output.postIdeas).toEqual(["A new scent this week"]);
  });

  it("A SNAKE_CASE CONTENT KEY IS KEPT, because the rule is shape and not punctuation", async () => {
    // The correction of 11 October: the first version of the rule
    // rejected every underscore and silently deleted a video script's
    // real fields. Lowercase snake_case is content.
    claudeReturns({ metaTitle: "T", metaDescription: "D", suggested_keywords: "soy candles shahjahanpur" });
    const { output } = await run("meta_tags");
    expect(output.suggested_keywords).toBe("soy candles shahjahanpur");
  });
});

describe("2. AND THE EIGHT OWNER-FACING TASKS STAY OUT", () => {
  beforeEach(() => claudeCall.mockReset());

  it("AN OWNER-FACING TASK IS NOT SENT THROUGH THE DOOR", async () => {
    // Observable in the PROMPT: the door always appends the copy truth
    // rules, and this agent's own path never did.
    claudeReturns({ keywords: [{ keyword: "soy candles shahjahanpur", intent: "transactional", note: "ready to buy" }] });
    await run("competitor_keywords");
    expect(promptSent()).toContain("You are an SEO specialist working on an Indian");
    expect(promptSent()).not.toContain("TRUTH RULES");
  });

  it("AND A CUSTOMER-FACING ONE IS", async () => {
    claudeReturns({ metaTitle: "T", metaDescription: "D" });
    await run("meta_tags");
    expect(promptSent()).toContain("TRUTH RULES");
  });

  it("an owner-facing task keeps every field it was given", async () => {
    // The boundary matters in both directions: stripping a field from a
    // keyword table would delete the owner's data, not protect a
    // customer.
    claudeReturns({ keywords: [{ keyword: "a", intent: "informational", note: "n" }], Volume_Estimates: "made up" });
    const { output } = await run("competitor_keywords");
    expect(output).toHaveProperty("Volume_Estimates");
  });
});

describe("3. THE COST OF THIS PATH DID NOT CHANGE", () => {
  beforeEach(() => claudeCall.mockReset());

  it("ONE MODEL CALL, NOT TWO — the genericness repair is not armed here", async () => {
    // The door's anti-generic step is a VERDICT in pure code plus a
    // repair that is a second model call, gated behind `revise`. This
    // path passes revise: false, so a generic verdict is reported and
    // never retried — the entry asked for the verdict, not for a new
    // bill on every SEO task.
    // A WORN OPENER, so the verdict genuinely fires. The first version
    // of this test used bland-but-unworn copy, nothing was judged
    // generic, and it passed without exercising the retry gate at all
    // — a mutation arming `revise: true` survived it.
    claudeReturns({
      metaTitle: "Candle by Qaaf",
      metaDescription: "Are you tired of candles that do not last? Shop with us today.",
    });
    const result: any = await run("meta_tags");
    expect(claudeCall.mock.calls, "a retry was billed on a path that must not retry").toHaveLength(1);
    // AND THE VERDICT IS REPORTED RATHER THAN SWALLOWED, which is what
    // the MIGRATING entry actually asked for.
    expect(result._generic).toBe(true);
  });

  it("AND THE RECORDS ARE PASSED, so the guard has something to check against", () => {
    // `facts: null` is a STATE in this codebase, not an absence: the
    // guard then runs its fact-independent subset. Passing null here
    // would quietly downgrade every SEO draft's check, and nothing in
    // this file would have noticed.
    const src = code("src/lib/agents/seoToolkitAgent.ts");
    const call = src.slice(src.indexOf("await generateCopy({"), src.indexOf("});", src.indexOf("await generateCopy({")));
    expect(call).toMatch(/^\s*facts,$/m);
    expect(call).not.toMatch(/facts: null/);
  });

  it("AND NO WORD CAP IS APPLIED, because a meta description has a character limit", () => {
    // `contentTypeKey` absent means no cap — "absent means no cap,
    // which is NOT a cap of zero" (CopyRequest). A word cap on a meta
    // description would be the wrong unit entirely.
    const src = code("src/lib/agents/seoToolkitAgent.ts");
    const call = src.slice(src.indexOf("await generateCopy({"), src.indexOf("});", src.indexOf("await generateCopy({")));
    expect(call.length).toBeGreaterThan(200);
    expect(call).not.toMatch(/contentTypeKey/);
    expect(call).toMatch(/revise: false/);
  });
});

describe("4. the debt is paid, and the list says so", () => {
  it("THE MIGRATING ENTRY IS DELETED — the backlog only shrinks", () => {
    // oneDoorForCopy.test.ts fails for a file that is through the door
    // and still listed, which is what forced this. Asserted here too so
    // the deletion is not undone quietly.
    const door = code("tests/oneDoorForCopy.test.ts");
    expect(door).not.toMatch(/agents\/seoToolkitAgent\.ts":/);
  });

  it("AND THE FILE IS GENUINELY THROUGH THE DOOR, by a static import", () => {
    // A dynamic import would work at runtime and read as unguarded to
    // the suite, which is how the first version of this change looked:
    // genuinely through the door, and reported as not.
    const src = code("src/lib/agents/seoToolkitAgent.ts");
    expect(src).toMatch(/import \{ generateCopy \} from "@\/lib\/content\/generateCopy";/);
    expect(src).toMatch(/taskKey === "meta_tags" \|\| taskKey === "gbp_optimization"/);
  });

  it("and the owner's own words are still restored AFTER the guard", () => {
    // Decision C of 2026-09-29, unchanged by the move: the guard runs
    // on what Hawlai wrote, and a claim the owner typed is his to make.
    // seoOwnerWords.test.ts proves the behaviour; this pins the ORDER,
    // which the move could have inverted.
    const src = code("src/lib/agents/seoToolkitAgent.ts");
    const call = src.indexOf("await generateCopy({");
    const restore = src.indexOf("keepOwnerWords(taskKey, copy.output", call);
    expect(restore).toBeGreaterThan(call);
  });
});
