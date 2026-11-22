// Every approval records what it produced, and the model reads it back.
//
// THE FAILURE, 21 November 2026. The owner approved a graphic. It was
// generated, uploaded and saved to the Design Studio. decide.ts checked
// `made.ok` and threw `made.url` AWAY — a URL it had just computed. The
// chat could only say "Applied to your store" with a link to another
// page, and the side panel went on saying "Not made yet" about a thing
// that now existed.
//
// That half was fixed by returning the URL to the BROWSER. The model
// still could not see it, which is why the next turn offered to
// generate a second image and charge again when the owner said
// "upload isi image".
//
// THE WIDER SHAPE, and the reason this is a contract rather than a
// patch to one branch: an approval IS the record of an action, and
// every branch in that route carries out an action. Nine of them
// recorded nothing at all, so "what happened when I pressed the
// button" was a question the database could not answer for any of
// them. pending_approvals.result_details (migration 237) is where the
// answer lives, and the recall section is what reads it back.
//
// THE OTHER DIRECTION MATTERS AS MUCH. The P5 failure of 22 October
// was the chat saying "Applied." in green over a paragraph edit that
// never reached the page. A row with nothing against it must not read
// as success, which is why the publish path records stale and failed
// outcomes too.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const DECIDE = "src/lib/approvals/decide.ts";
const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** One branch of the approval route, sliced at both ends. */
function branch(actionType: string): string {
  const src = code(DECIDE);
  const start = src.indexOf(`approval?.action_type === "${actionType}"`);
  expect(start, `the ${actionType} branch is gone`).toBeGreaterThan(-1);
  // Bounded by the NEXT branch test, or by the row update that follows
  // them all. A start-only slice reads the whole rest of the file and
  // has let a mutation survive here before.
  const candidates = [
    src.indexOf('approval?.action_type === "', start + 10),
    src.indexOf("const { data, error } = await service", start),
  ].filter((i) => i > start);
  const end = Math.min(...candidates);
  expect(end, `cannot bound the ${actionType} branch`).toBeGreaterThan(start);
  const body = src.slice(start, end);
  expect(body.length, `the ${actionType} slice is empty`).toBeGreaterThan(40);
  return body;
}

describe("1. EVERY BRANCH RECORDS WHAT IT DID", () => {
  // Each entry is a branch and a value it must put on the record. The
  // value is the one a later turn would need in order to talk about
  // the thing without doing it again.
  const BRANCHES: [string, RegExp][] = [
    ["change_campaign_budget", /record\(\{ newDailyBudget: details\.new_budget/],
    ["change_campaign_targeting", /record\(\{\s*campaignId: details\.campaign_id/],
    ["activate_ad_campaign", /record\(\{ campaignId: details\.campaign_id, campaignStatus: "ACTIVE" \}\)/],
    ["send_email", /record\(\{ emailSent: true, emailSubject: d\.subject/],
    ["publish_site", /record\(\{ sitePublished: true \}\)/],
    ["generate_graphic", /produced = \{ imageUrl: made\.url/],
    ["create_discount_code", /record\(\{ discountCode: d\.code/],
    ["set_automation_toggle", /record\(\{ toggle: d\.toggle, enabled: true \}\)/],
    ["create_page_draft", /record\(\{ pageSlug: slug, pageTitle: title, published: false \}\)/],
    ["grant_autonomy", /record\(\{ autonomyGranted: wanted, level: "L2" \}\)/],
  ];

  for (const [actionType, expected] of BRANCHES) {
    it(`${actionType} puts its result on the row`, () => {
      expect(branch(actionType), `${actionType} carries out an action and records nothing`).toMatch(expected);
    });
  }

  /**
   * A branch that genuinely produces nothing worth recording.
   *
   * Empty today. An entry needs a reason and a date, because "this one
   * produces nothing" is a claim about an action the owner approved.
   */
  const PRODUCES_NOTHING: Record<string, { why: string; at: string }> = {};

  it("THE LOAD-BEARING ONE: a NEW branch that records nothing fails this", () => {
    // THE FIRST VERSION OF THIS TEST DID NOT WORK, and the counting is
    // why: it compared the number of recording calls (13) against the
    // number of branches (10) and asserted the first was not smaller.
    // An eleventh branch added with no recording would still have
    // passed, so the comment above it described a mechanism it did not
    // have — the very defect tests/guardPhrasesAreExecutable.test.ts
    // exists to catch, in a test written the same week. Corrected to
    // discover the branches and slice each one.
    const src = code(DECIDE);
    const found = [...src.matchAll(/approval\?\.action_type === "([a-z_]+)"/g)].map((m) => m[1]);
    const names = [...new Set(found)];
    expect(names.length, "no branches found — the slicing pattern has gone stale").toBeGreaterThanOrEqual(10);

    for (const name of names) {
      const declared = PRODUCES_NOTHING[name];
      if (declared) {
        expect(declared.why.length, `${name} is declared as producing nothing with no reason`).toBeGreaterThan(20);
        continue;
      }
      expect(
        branch(name),
        `the ${name} branch carries out an action and records nothing. Either record what it produced, or declare it in PRODUCES_NOTHING with a reason and a date.`
      ).toMatch(/\brecord\(\{|\bproduced = \{/);
    }
  });

  it("the dispatcher path records whether the platform CONFIRMED it", () => {
    // Accepted and confirmed are different, and the dispatcher is the
    // only thing that knows which this was. Two "couldn't confirm"
    // reports in one evening were a Meta pause that HAD worked and a
    // read-back that had not.
    const src = code(DECIDE);
    const at = src.indexOf("const dispatcher = dispatcherFor(");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("if (status === \"approved\") {", at + 10));
    expect(block).toMatch(/record\(\{ note: done\.note, verified: done\.verified \}\)/);
  });
});

describe("2. the result reaches the row, not only the browser", () => {
  it("THE LOAD-BEARING ONE: the decision update carries result_details", () => {
    const src = code(DECIDE);
    const at = src.indexOf(".from(\"pending_approvals\")\n    .update({");
    expect(at, "the decision update has moved").toBeGreaterThan(-1);
    const update = src.slice(at, src.indexOf("})", at));
    expect(update).toMatch(/result_details: status === "approved" && produced \? produced : \{\}/);
  });

  it("A REJECTION RECORDS NOTHING, because it produced nothing", () => {
    const src = code(DECIDE);
    expect(src).toMatch(/result_details: status === "approved"/);
  });

  it("and the browser still gets it, unchanged", () => {
    // The half that was already shipped. A picture is additional
    // information, not a different answer.
    expect(code(DECIDE)).toMatch(/return NextResponse\.json\(produced \? \{ \.\.\.data, produced \} : data\)/);
  });

  it("THE PUBLISH PATH SAVES BEFORE IT BRANCHES, so no outcome is lost", () => {
    // releaseApprovedAction runs AFTER the row update, and each of its
    // outcomes returns its own response. A save inside any one of them
    // would miss the others — and the one it would most likely miss is
    // a failure, which is the outcome a later turn most needs.
    const src = code(DECIDE);
    const at = src.indexOf("const { outcome } = released;");
    expect(at, "the release block has moved").toBeGreaterThan(-1);
    const afterDestructure = src.slice(at, src.indexOf("if (outcome.status !== \"executed\")", at));
    expect(afterDestructure, "the publish outcome is not recorded before the branching").toMatch(/await saveResult\(\{/);
    expect(afterDestructure).toMatch(/status: outcome\.status/);
  });

  it("A STALE OR FAILED PUBLISH IS RECORDED AS ITSELF", () => {
    // The P5 failure: "Applied." in green over a change that never
    // ran. The status goes on the record whatever it is, so a later
    // turn cannot read silence as success.
    const src = code(DECIDE);
    const at = src.indexOf("const { outcome } = released;");
    const block = src.slice(at, src.indexOf("if (outcome.status !== \"executed\")", at));

    // THE SAVE IS UNCONDITIONAL, asserted by its INDENTATION rather
    // than by naming the ways it could be made conditional. The first
    // version of this checked for `outcome.status === "executed" ?
    // await saveResult` and a mutation using `if (…) await saveResult`
    // walked straight past it — a negative regex only forbids the one
    // spelling it guessed. Six spaces means top level of this block;
    // any wrapping, ternary or `if`, moves or indents the call.
    expect(block, "the publish save has been made conditional").toMatch(/\n      await saveResult\(\{/);

    // And the broken link between a decision and its work.
    expect(src).toMatch(/saveResult\(\{ publish: \{ status: "failed", reason:/);
  });

  it("a failed recording never breaks the action that already happened", () => {
    const src = code(DECIDE);
    const at = src.indexOf("const saveResult = async (");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n  };", at));
    expect(fn, "a failed recording is thrown rather than logged").not.toMatch(/throw/);
    expect(fn, "a failed recording is swallowed in silence").toMatch(/console\.error/);
  });
});

describe("3. NOTHING SENSITIVE GOES ON THE ROW", () => {
  it("THE LOAD-BEARING ONE: the email branches record the subject, never the address", () => {
    // result_details is read into an LLM prompt by the recall section.
    // A recipient's address is a customer's detail and has no business
    // there — the subject is what the owner needs to recognise it by.
    const b = branch("send_email");
    expect(b).toMatch(/record\(\{ emailSent: true, emailSubject: d\.subject/);
    expect(b, "the recipient address is recorded into a prompt").not.toMatch(/record\([^)]*\bd\.to\b/);
  });

  it("no branch records a token or a key", () => {
    const src = code(DECIDE);
    const calls = src.match(/record\([^;]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      expect(call, call).not.toMatch(/token|secret|access_token|api_?key/i);
    }
  });
});

describe("4. THE MODEL READS THE RESULT BACK", () => {
  /** The recall block, bounded at both ends. */
  function recallBlock(): string {
    const src = code(BRAIN);
    const start = src.indexOf("const recallSection = await (async () => {");
    expect(start, "the recall section is gone").toBeGreaterThan(-1);
    const end = src.indexOf("const relevantKnowledge", start);
    expect(end, "cannot find the end of the recall block").toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("THE LOAD-BEARING ONE: it reads result_details for those approvals", () => {
    const b = recallBlock();
    expect(b).toMatch(/\.from\("pending_approvals"\)/);
    expect(b).toMatch(/select\("id, status, result_details"\)/);
  });

  it("ONLY APPROVED ROWS COUNT", () => {
    // A pending card has produced nothing yet and a rejected one never
    // will. Reading either as a result is the model announcing work
    // that did not happen.
    expect(recallBlock()).toMatch(/if \(row\.status !== "approved"\) continue/);
  });

  it("scoped to this business as well as to these ids", () => {
    const b = recallBlock();
    expect(b).toMatch(/\.eq\("dealership_id", ctx\.id\)/);
    expect(b).toMatch(/\.in\("id", approvalIds\)/);
  });

  it("it does not query when there is nothing to look up", () => {
    expect(recallBlock()).toMatch(/if \(approvalIds\.length > 0\)/);
  });

  it("it flattens the result instead of dumping the row", () => {
    // Same reasoning as the artifact list it sits inside: a raw jsonb
    // blob buries the one line that matters.
    const b = recallBlock();
    expect(b).toMatch(/\.map\(\(\[k, v\]\) =>/);
    expect(b).not.toMatch(/JSON\.stringify\(details\)/);
    expect(b).not.toMatch(/JSON\.stringify\(row\.result_details\)/);
  });

  it("THE LINE SAYS DONE, and says what an absent mark means", () => {
    // Both directions in one sentence. "Done" stops a second charge;
    // the absence of it stops the model reporting work it only offered.
    const b = recallBlock();
    expect(b).toMatch(/DONE, it produced:/);
    expect(b).toMatch(/has already been carried out/);
    expect(b).toMatch(/do NOT tell him it is finished/);
  });

  it("an approval with an empty result adds no DONE mark", () => {
    // Default '{}' means "produced nothing recorded", and claiming a
    // result from it would be inventing one.
    expect(recallBlock()).toMatch(/if \(pairs\) produced\.set\(/);
  });
});
