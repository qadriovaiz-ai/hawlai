// S7's EXIT TEST — WRITTEN FIRST, AND RED ON PURPOSE.
//
// CLOSED AT P7 ON 6 NOVEMBER 2026, and this file moved out of
// tests/open/ into the default suite, where it runs on every commit.
//
// It carried a STAGE_OPEN marker while it was red, and the machinery
// that kept it out of the suite — vitest.open.config.mts, the
// tests/open/** exclusion, the test:open script and
// tests/stageOpen.test.ts — was deleted with the move, because that
// guard said what to do when a stage closes and nothing replaces it:
// "the next person should delete the lot rather than inherit it." It is
// in git history for whoever opens S8.
//
// Relative imports changed with the directory: ./helpers, not
// ../helpers.
//
// The criterion, from docs/PLAN-CORE-ARCHITECTURE.md §3, unchanged:
//
//   > "Promotion and demotion both tested; spend never auto (test)"
//
// WHY IT IS WRITTEN BEFORE THE WORK, which is NOT what S5 and S6 did —
// both of those wrote their exit test at P6, last. Writing it last has
// a quiet failure mode: the test is shaped by what was built, so it
// cannot fail. S6's own exit test records me discovering that its first
// two assertions were satisfiable by any occurrence. Written first, the
// target is fixed before the work can move it, and every assertion
// below is a commitment made while it was still inconvenient.
//
// WHAT THIS FILE DOES NOT RE-PROVE, following S5 and S6. L0 and L1 are
// already held down by tests/autonomyLevels.test.ts — 27 invariants,
// including the walk over every spend action in the registry. The door
// every state change goes through is tests/stateChangeDoor.test.ts.
// Re-asserting either here would make this file decorative.
//
// WHAT IT ADDS, and nothing else states:
//
//   1. SPEND IS NEVER AUTO — the clause itself, extended to L2, and in
//      the DATABASE as well as the code. The one assertion here that is
//      partly green today, which is how this file proves it is not
//      vacuously red.
//   2. PROMOTION IS EARNED AND ASKS. Evidence from rows that already
//      exist; thresholds in one file; and the product never writes its
//      own permission.
//   3. DEMOTION IS AUTOMATIC, INSTANT AND UNGATED — and fires on the
//      FIRST published unsupported claim, not on a rate.
//   4. THE INSTRUMENT EXISTS. Without a record of what went out and a
//      monitor reading it, 2 and 3 are decoration.
//   5. THE FOUNDER'S SIX DECISIONS of 5 November, each as a number or a
//      list that cannot be edited without failing a test.
//   6. WHAT IS STILL UNVERIFIED LIVE when the stage closes.
//
// EVERY IMPORT IS DYNAMIC, so a missing module fails ITS OWN test with
// its own name instead of taking the file down at load time. While the
// stage is open this run is a ledger of what is left.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments, sql as sqlOf } from "./helpers/source";
import { ACTION_POLICIES, getActionPolicy } from "@/lib/executionPolicy";

/** The modules S7 is contracted to produce. Named here, before they exist. */
const POLICY = "@/lib/autonomy/policy";
const PROMOTION = "@/lib/autonomy/promotion";
const DEMOTION = "@/lib/autonomy/demotion";
const LEVELS = "@/lib/autonomyLevels";
const RECORD = "@/lib/claims/claimChecks";
const MONITOR = "@/lib/claims/outputMonitor";

/**
 * Where the plan has to write what the stage did NOT prove. P7 adds it.
 *
 * MATCHED AS A HEADING AT THE START OF A LINE, and that is not
 * fussiness. The first version used `plan.indexOf(heading)`, and at P1
 * both assertions below went GREEN without the section existing —
 * because §15's contract table has a row that NAMES this heading, and a
 * plain indexOf cannot tell a heading from a sentence about one.
 *
 * The same fault S6's exit test recorded twice: an assertion satisfiable
 * by any occurrence. It took three weeks to surface there; here it took
 * one phase, because the exit test was written before the plan grew.
 */
const EXIT_HEADING = /^### S7 EXIT — what this stage did not prove$/m;

/** The plan from its exit heading onward, or "" when there is no such heading. */
function exitSectionOf(plan: string): string {
  const at = plan.search(EXIT_HEADING);
  return at < 0 ? "" : plan.slice(at);
}

async function load(path: string): Promise<any> {
  return await import(/* @vite-ignore */ path);
}

/** Every action the registry says cannot be taken back or costs money. */
function pinnedKeys(): string[] {
  return Object.keys(ACTION_POLICIES).filter((key) => {
    const p = getActionPolicy(key)!;
    return p.actionType === "spend" || p.actionType === "delete" || p.riskLevel === "critical";
  });
}

describe("1. SPEND IS NEVER AUTO — the clause, in the code and in the database", () => {
  it("THE REGISTRY STILL CONTAINS SPEND AND CRITICAL ACTIONS TO PIN", () => {
    // GREEN TODAY, and it is here so this file is not vacuously red. A
    // test that walks a list proves nothing if the list can empty, and
    // "0 of 0 spend actions are pinned" is the shape of a guard that
    // has quietly stopped guarding.
    // FOUR, COUNTED ON 5 NOVEMBER 2026 rather than guessed — my first
    // version of this line asserted "more than 8" and failed, which is
    // the small version of the mistake this file exists to prevent.
    // activate_ad_campaign and change_campaign_budget and refund_approve
    // spend; update_product_price is critical. Nothing deletes, yet.
    const pinned = pinnedKeys();
    expect(pinned.length, "nothing in the registry spends, deletes or is critical any more").toBeGreaterThanOrEqual(4);
    for (const key of ["activate_ad_campaign", "change_campaign_budget", "refund_approve", "update_product_price"]) {
      expect(pinned, `${key} lost the classification that pins it`).toContain(key);
    }
  });

  it("NO SPEND, DELETE OR CRITICAL ACTION CAN REACH L2, FOR ANY OF THEM", async () => {
    // The exit test's own clause. Asserted over the whole registry
    // rather than the one action I thought of — the shape
    // tests/autonomyLevels.test.ts established for L1.
    const levels = await load(LEVELS);
    expect(typeof levels.maxLevelFor, `${LEVELS} must export maxLevelFor(actionKey, { hasUndo })`).toBe("function");
    for (const key of pinnedKeys()) {
      expect(levels.maxLevelFor(key, { hasUndo: true }), `${key} could be raised above L0`).toBe("L0");
      expect(levels.canHoldL2(key, { hasUndo: true }).ok, `${key} was allowed to hold L2`).toBe(false);
    }
  });

  it("AND THE DATABASE REFUSES L2 FOR THEM, not merely fails to spell it", async () => {
    // RESTATED, NOT WEAKENED — the founder's decision of 5 November.
    // tests/autonomyLevels.test.ts:73 asserts the CHECK cannot say 'L2'
    // at all, and migration 209's own comment says why a code-only
    // guard is not enough: "A code-only guard would be one edit away
    // from gone; a row that cannot be written is not."
    //
    // The invariant being protected was never "L2 cannot exist". It was
    // "a level cannot be written that the code has not earned the right
    // to honour". So the CHECK widens and a SECOND database rule
    // refuses L2 for anything not on the allowlist — which is stricter
    // than today, because today nothing in SQL knows about allowlists
    // at all.
    // READ THROUGH sql(), AND THE FIRST VERSION DID NOT — found on
    // 6 November 2026 by mutation-checking this file. It read the
    // migration with `sourceWithComments`, and 220's header explains
    // the allowlist at length while naming `update_page_meta`. So
    // replacing the actual constraint with `action_key is not null`
    // left this green: the assertion was satisfied by the explanation
    // of the rule rather than by the rule.
    //
    // tests/helpers/source.ts's `sql()` strips `--`, which `code()`
    // does not. Rule 8, in the file whose job is to say what is true.
    const migrations = await import("node:fs");
    const files = migrations.readdirSync("supabase/migrations").filter((f: string) => f.endsWith(".sql"));
    const widening = files.filter((f: string) => sqlOf(`supabase/migrations/${f}`).includes("'L2'"));
    expect(widening.length, "no migration teaches action_levels about L2").toBeGreaterThan(0);

    const ddl = widening.map((f: string) => sqlOf(`supabase/migrations/${f}`)).join("\n");
    // The CHECK admits L2 …
    expect(ddl).toMatch(/check\s*\(\s*level\s+in\s*\(\s*'L0'\s*,\s*'L1'\s*,\s*'L2'\s*\)/i);
    // … and a second rule names the keys it may be written for,
    // SCOPED TO THAT CONSTRAINT so the whole file cannot satisfy it.
    const allowlist = ddl.slice(ddl.indexOf("action_levels_l2_allowlist"));
    expect(allowlist.length, "no allowlist constraint in the DDL").toBeGreaterThan(40);
    expect(allowlist, "the allowlist constraint names no action key").toMatch(/action_key in \('update_page_meta'\)/);
    // The reason is written beside it, like every other guard here —
    // and THIS one is about the comment, so it reads the raw file.
    expect(sourceWithComments(`supabase/migrations/${widening[0]}`)).toMatch(/allowlist|earned/i);
  });

  it("and an unattended level is never what switches an automation ON", async () => {
    // AUTOMATION_TOGGLES' four critical toggles are already pinned by
    // risk. This states the consequence plainly: the thing that turns
    // off every other gate can never itself be automatic.
    const levels = await load(LEVELS);
    const { AUTOMATION_TOGGLES } = await import("@/lib/executionPolicy");
    expect(Object.keys(AUTOMATION_TOGGLES).length).toBeGreaterThan(5);
    expect(levels.maxLevelFor("set_automation_toggle", { hasUndo: true })).toBe("L0");
  });
});

describe("2. PROMOTION IS EARNED, AND IT ASKS", () => {
  it("THE EVIDENCE THRESHOLD IS THE FOUNDER'S, IN ONE PLACE", async () => {
    // Decision 4, 5 November 2026: ten as-requested approvals, no
    // rejections, no modifications, thirty days, and at least one
    // measured outcome that is neither worsened nor not_measurable.
    //
    // ONE FILE, so changing the rule is one visible edit rather than a
    // number in a query somebody reads once.
    const policy = await load(POLICY);
    expect(policy.PROMOTION_EVIDENCE).toEqual({
      approvalsAsRequested: 10,
      rejections: 0,
      modifications: 0,
      days: 30,
      measuredOutcomes: 1,
    });
  });

  it("A MODIFIED APPROVAL IS NOT EVIDENCE, AND NOR IS AN IGNORED CARD", async () => {
    // The two readings that would let this product promote itself on
    // its own inaccuracy. Migration 127 exists because the owner
    // sometimes approves ₹3,000 where we asked for ₹5,000; a row
    // nobody ever touched is him not looking.
    const { earnsL2 } = await load(PROMOTION);
    const clean = {
      approvalsAsRequested: 10,
      modifications: 0,
      rejections: 0,
      ignored: 0,
      firstApprovalDaysAgo: 40,
      measuredOutcomes: 1,
      worsened: 0,
      notMeasurable: 0,
    };
    expect(earnsL2("update_page_meta", clean).ok, "clean evidence was refused").toBe(true);
    expect(earnsL2("update_page_meta", { ...clean, modifications: 1 }).ok).toBe(false);
    expect(earnsL2("update_page_meta", { ...clean, rejections: 1 }).ok).toBe(false);
    // TEN APPROVED AND TEN IGNORED IS NOT TEN APPROVED. Counted apart,
    // and an owner who is not reading the cards is not agreeing.
    expect(earnsL2("update_page_meta", { ...clean, ignored: 10 }).ok).toBe(false);
    // "We could not tell" is not a pass. S5 made not_measurable a
    // first-class verdict for exactly this reason.
    expect(earnsL2("update_page_meta", { ...clean, measuredOutcomes: 0, notMeasurable: 2 }).ok).toBe(false);
    expect(earnsL2("update_page_meta", { ...clean, worsened: 1 }).ok).toBe(false);
    // And time cannot be bought with volume.
    expect(earnsL2("update_page_meta", { ...clean, approvalsAsRequested: 40, firstApprovalDaysAgo: 3 }).ok).toBe(false);
    // Every refusal says why, in words the owner could read.
    expect(String(earnsL2("update_page_meta", { ...clean, rejections: 1 }).why ?? "")).not.toBe("");
  });

  it("ONLY update_page_meta IS ON THE ALLOWLIST, AND NOTHING WITHOUT AN UNDO", async () => {
    // Decision 3. The search title and description: reversible,
    // undo-backed, nothing spends, nothing reaches an inbox. Every
    // other action waits for its platform to implement undo() — today
    // only hawlaiSite has one.
    const policy = await load(POLICY);
    expect(policy.L2_ALLOWLIST).toEqual(["update_page_meta"]);
    const levels = await load(LEVELS);
    expect(levels.canHoldL2("update_page_meta", { hasUndo: true }).ok).toBe(true);
    expect(levels.canHoldL2("update_page_meta", { hasUndo: false }).ok, "L2 without an undo").toBe(false);
    // An action nobody classified, and one that is classified but not
    // allowlisted, are both refused.
    expect(levels.canHoldL2("something_nobody_wrote_down", { hasUndo: true }).ok).toBe(false);
    expect(levels.canHoldL2("update_post", { hasUndo: true }).ok, "a non-allowlisted action reached L2").toBe(false);
  });

  it("AND THE PRODUCT NEVER WRITES ITS OWN PERMISSION — IT ASKS ONCE", async () => {
    // Decision 2, and the one that decides what kind of product this
    // is. Earning L2 raises a pending_approvals row with the evidence
    // on it; the level is written only after the owner presses the
    // button. A promotion that wrote action_levels directly would be
    // the product widening its own powers because a counter moved.
    const promotion = await load(PROMOTION);
    expect(typeof promotion.proposePromotion).toBe("function");
    const src = code("src/lib/autonomy/promotion.ts");
    expect(src, "promotion writes action_levels itself").not.toMatch(/from\("action_levels"\)\s*\n?\s*\.(insert|update|upsert)/);
    expect(src).toMatch(/requestApproval|pending_approvals/);
    // THE EVIDENCE IS ON THE CARD. "Shall I do this on my own?" with no
    // numbers is a question the owner cannot answer.
    expect(src).toMatch(/PROMOTION_EVIDENCE|approvalsAsRequested/);
  });

  it("and a promoted action is capped, for the first action and the first month", async () => {
    // Decision 6: three unattended actions per business per day. A cap
    // that is too low is a line in one file; a cap that is too high is
    // a morning he reads about afterwards.
    const policy = await load(POLICY);
    expect(policy.L2_DAILY_CAP).toBe(3);
  });
});

describe("3. DEMOTION IS AUTOMATIC, INSTANT AND UNGATED", () => {
  it("ONE PUBLISHED UNSUPPORTED CLAIM IS ENOUGH — NOT A RATE", async () => {
    // A rate needs a denominator and a window, and both are arguments
    // to have while a wrong claim is live on a customer's screen.
    //
    // THE SURFACE NAME IS A REAL ONE — 6 November 2026. P0 wrote
    // "page", which is not a surface anything produces: migration 217
    // and claimChecks.ts name them page_meta and page_text. It PASSED
    // at P3 anyway, because an unclassified surface resolves to the
    // widest reach — so the assertion was being satisfied by the
    // fallback it was not about. Third time this exact shape has
    // appeared in this file; the fixtures are now the real values.
    const { demoteAfter } = await load(DEMOTION);
    const one = { surface: "page_meta", published: true, unsupported: 1 };
    expect(demoteAfter([one]).demote, "one published unsupported claim did not demote").toBe(true);
    // A claim that was CAUGHT is the system working, and must not
    // demote anything. A table that cannot tell those apart makes this
    // fire on its own successes.
    expect(demoteAfter([{ ...one, published: false }]).demote).toBe(false);
    expect(demoteAfter([{ ...one, unsupported: 0 }]).demote).toBe(false);
    expect(demoteAfter([]).demote).toBe(false);
  });

  it("A PUBLIC OUTPUT TAKES EVERY L2 ON THAT BUSINESS DOWN WITH IT", async () => {
    // Decision 5. A claim that is wrong on a public page is usually
    // wrong in the next email too; one that went to a single inbox is
    // narrower.
    const { demoteAfter } = await load(DEMOTION);
    for (const surface of ["page_meta", "page_text", "social", "product_description"]) {
      expect(demoteAfter([{ surface, published: true, unsupported: 1 }]).reach, surface).toBe("business");
    }
    for (const surface of ["email", "whatsapp", "lead_message"]) {
      expect(demoteAfter([{ surface, published: true, unsupported: 1 }]).reach, surface).toBe("action");
    }
    // AND THE OWNER'S OWN WORDS DEMOTE NOTHING AT ALL, which is the
    // column P1 added and the one way this rule could be cruel.
    expect(demoteAfter([{ surface: "page_meta", published: true, unsupported: 1, ownerWords: true }]).demote).toBe(false);
  });

  it("AND IT ASKS NOBODY — the safe direction is never the slow one", async () => {
    // CLAUDE.md rule 6. effectiveLevel already returns before
    // consulting anything when the direction is "disable"; demotion
    // takes the same shape. A demotion that waited for an approval
    // click would leave an unattended action running while it waited.
    const src = code("src/lib/autonomy/demotion.ts");
    expect(src, "demotion creates an approval").not.toMatch(/requestApproval|pending_approvals/);
    // It is recorded as a decision, so a revoked permission is
    // measurable rather than a silent correction.
    expect(src).toMatch(/automation_switched|recordDecision/);
    // And the owner is told. A limit that lives only in a log is a
    // limit nobody knows about — S6 paid for that twice.
    expect(src).toMatch(/notif|email|told|report/i);
  });

  it("AND A MONITOR THAT COULD NOT RUN IS NOT A PASS", async () => {
    // F-01's lesson, which autonomyLevelsStore.ts already applies to
    // levels: a site that cannot read its own permissions must ask, not
    // act. An autonomous product whose supervisor quietly died is the
    // worst state this plan can produce, and it is the state that looks
    // exactly like everything being fine.
    const monitor = await load(MONITOR);
    expect(typeof monitor.MONITOR_BLIND_DAYS).toBe("number");
    expect(monitor.MONITOR_BLIND_DAYS).toBeGreaterThan(0);
    const { demoteAfter } = await load(DEMOTION);
    expect(demoteAfter([], { blindDays: monitor.MONITOR_BLIND_DAYS }).demote, "a blind monitor did not suspend L2").toBe(true);
  });
});

describe("4. THE INSTRUMENT EXISTS — without it, 2 and 3 are decoration", () => {
  it("THERE IS A ROW PER CUSTOMER-FACING OUTPUT, AND IT SAYS WHETHER IT WENT OUT", async () => {
    // Measured on 5 November 2026: generateCopy computes `removed`,
    // `substantiation` and `publishable` and throws all three away;
    // src/lib/claims is nine files of reads with no writes;
    // email_sends stores the subject and not the body. So "how often
    // did an unsupported sentence reach a customer this month" had no
    // answer at all.
    const record = await load(RECORD);
    expect(typeof record.recordClaimCheck).toBe("function");
    const migrations = await import("node:fs");
    const files = migrations.readdirSync("supabase/migrations").filter((f: string) => f.endsWith(".sql"));
    // THROUGH sql() AND AS COLUMN DECLARATIONS — 6 November 2026.
    // These read `code()` and matched the words anywhere, and 217's
    // header explains every column it creates: renaming `published` to
    // `went_out` in the DDL left this green, because the explanation
    // still said "published". The same fault as the one above, in the
    // same file, found by the same mutation run.
    const table = files.filter((f: string) => sqlOf(`supabase/migrations/${f}`).includes("create table if not exists claim_checks"));
    expect(table.length, "no migration creates claim_checks").toBe(1);
    const ddl = sqlOf(`supabase/migrations/${table[0]}`);
    // THE LOAD-BEARING COLUMN, as a declaration. Caught-and-removed is
    // the system working; published is the system failing.
    expect(ddl, "no `published` column").toMatch(/^\s*published boolean/m);
    expect(ddl, "no `claims_unsupported` column").toMatch(/^\s*claims_unsupported integer/m);
    expect(ddl).toMatch(/row level security/i);
  });

  it("AND SOMETHING READS THOSE ROWS, ON A SCHEDULE, WITHOUT BEING ASKED", async () => {
    // THE TARGET MOVED, AND HERE IS WHY — 6 November 2026, at P2.
    //
    // P0 wrote `GROUPS.signals` because the plan said "a daily
    // subsystem in the signals group". Reading cronGroups.ts settles
    // it the other way: signals is "database-only and fast… so it runs
    // FIRST and never queues behind LLM calls", and the monitor calls a
    // model on every row. Putting it in signals would have broken that
    // file's own rule, which exists because one post reached Facebook
    // in 28 days while a group full of LLM work ran ahead of it.
    //
    // Changing an exit test's expectation is the thing writing it first
    // was meant to prevent, so it is changed in ONE direction only: the
    // assertion is now STRICTER than it was. It pins the group AND the
    // position, because where it sits is the decision that matters.
    const monitor = await load(MONITOR);
    expect(typeof monitor.runOutputMonitor).toBe("function");
    const { GROUPS } = await import("@/lib/automation/cronGroups");
    expect(GROUPS.heavy, "the monitor is not in the daily run").toContain("output_monitor");
    expect(GROUPS.signals, "a model-calling subsystem is in the database-only group").not.toContain("output_monitor");
    // BEFORE THE EMAIL THAT TELLS HIM. daily_autopilot sends the daily
    // report, so a monitor running after it reports today's escape
    // tomorrow. It is also the entry that went unreached for two days
    // when the dispatcher's secret went stale.
    expect(GROUPS.heavy.indexOf("output_monitor")).toBeLessThan(GROUPS.heavy.indexOf("daily_autopilot"));
  });

  it("and it is the gate that already exists, not a second judge of the same thing", () => {
    // scripts/eval/outputGate.eval.ts already re-asks the extractor
    // about a finished run's surviving sentences from scratch — "THE
    // RUN CANNOT BE THE JUDGE OF THE RUN" — for about ₹3 a run. The
    // monitor is that pass pointed at live rows. A second, differently
    // written judge would give two answers to one question.
    // THE IMPORT, NOT THE WORD — 6 November. This matched
    // `/outputGate|findUnsupportedClaims|extractor/i` against the raw
    // file, and the monitor's header names outputGate.eval.ts while
    // explaining where the instrument came from. So replacing the
    // imports with local stubs — a second, differently-written judge,
    // exactly what this test is against — left it green.
    const src = code("src/lib/claims/outputMonitor.ts");
    expect(src, "the refused types are no longer the gate's own").toMatch(
      /import \{[^}]*UNLICENSABLE_TYPES[^}]*\} from "@\/lib\/facts\/extractClaims"/
    );
    expect(src).toMatch(/NEEDS_RECIPIENT_RECORD/);
    // AND THE FILE STILL SAYS WHERE THE INSTRUMENT CAME FROM, which IS
    // about the comment and so reads the raw file.
    expect(sourceWithComments("src/lib/claims/outputMonitor.ts")).toMatch(/outputGate\.eval\.ts/);
  });
});

describe("5. WHAT S7 DID NOT PROVE, written down rather than assumed", () => {
  it("THE PLAN RECORDS THAT AN L2 ACTION HAS NOT RUN UNATTENDED FOR A MONTH", () => {
    // The limit no plan can shorten, and the one somebody will later
    // assume was lifted. Asserted in the plan's own exit section,
    // because S6 learned that matching the whole file lets the
    // sentence be deleted from the place a person actually reads.
    // ANCHORED ON A STABLE HEADING, not a section number. This plan
    // gains a section per phase, the way S6's did (§8 to §17), so a
    // number fixed today is a number that moves.
    const exitSection = exitSectionOf(code("docs/PLAN-S7-AUTONOMY.md"));
    expect(exitSection.length, "the plan has no exit section yet").toBeGreaterThan(400);
    expect(exitSection).toMatch(/[Uu]nverified live/);
    // THE CLAIM, NOT THE WORD — 6 November. `/unattended/` appears
    // several times in the section, so deleting the sentence that makes
    // the admission left this green. The sentence a person reads first
    // is the one that has to be there.
    expect(exitSection, "the section no longer says nothing ran unattended").toMatch(
      /\*\*Nothing has ever run unattended\.\*\*/
    );
    // And the reason it is arithmetic rather than an omission.
    expect(exitSection).toMatch(/proved by test and \*\*none by a morning\*\*/);
  });

  it("AND THAT THE MONITOR ONLY SEES WHAT THE EXTRACTOR CAN SEE", () => {
    // outputGate's own header says it: "It can only catch what the
    // extractor sees; a vague claim riding on a true fact still needs a
    // person." An exit test that implied otherwise would be claiming
    // the product is safer than it is.
    // ASSERTED AS THE SECTION'S OWN CLAIM, NOT AS THE WORD
    // "EXTRACTOR" — 6 November 2026, found by mutation-checking this
    // file for the first time. `toMatch(/extractor/i)` was satisfied by
    // any of several occurrences, so deleting the sentence that makes
    // the point left it green. It is the fifth time in this stage that
    // an assertion has been satisfiable by any occurrence of its own
    // subject, and the fix is the same every time: assert the claim.
    const exitSection = exitSectionOf(code("docs/PLAN-S7-AUTONOMY.md"));
    expect(exitSection.length, "the plan has no exit section yet").toBeGreaterThan(400);
    // The limit, stated as a limit.
    expect(exitSection).toMatch(/only sees what the extractor sees/i);
    // AND WHAT A CLEAN VERDICT IS NOT. A section naming the limit and
    // still implying a certificate would be worse than silence.
    expect(exitSection).toMatch(/not a certificate/i);
  });
});
