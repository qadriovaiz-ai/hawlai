// S6's EXIT TEST — S6/P6.
//
// The criterion, restated by the founder on 4 November 2026 and
// recorded in docs/PLAN-CORE-ARCHITECTURE.md §3 and §4.3:
//
//   > "Nothing that changes state is reachable except through an
//   >  Action"
//
// …replacing the original first clause, "tool count falls", which could
// be satisfied by deleting the analytics tool. The second half — "no
// surface writes copy outside C2" — is tests/oneDoorForCopy.test.ts and
// predates this stage.
//
// WHAT THIS FILE DOES NOT RE-PROVE, following S5's exit test. The
// clause itself is measured by tests/stateChangeDoor.test.ts; the
// classification by tests/toolFamilies.test.ts; the envelope by
// tests/dispatchEnvelope.test.ts; one approval per card by
// tests/approvalExecution.test.ts. Re-asserting them here would make
// this file decorative and would mean two places to change when one
// rule moves.
//
// WHAT IT ADDS, and nothing else states:
//
//   1. THE SCOPE of the clause, and the limit of the instrument that
//      measures it — measured, not estimated.
//   2. THAT THE INSTRUMENT CAN SEE AT ALL: the same walk, with the
//      doors removed, DOES find the senders. A green result from a
//      blind measure would look identical to a green result from a
//      guarded product.
//   3. THAT THE COPY DOOR'S BACKLOG IS SHORTER than when the stage
//      began, with the remaining entries named and their deferral on
//      record.
//   4. WHAT IS STILL UNVERIFIED LIVE, because a stage that closes
//      without saying so is a stage somebody later assumes was proved.

import { describe, it, expect } from "vitest";
import { code, sourceWithComments } from "./helpers/source";
import { functionIndex, reachable } from "./helpers/reachability";
import { UNGATED_BY_DECISION } from "./helpers/ungatedByDecision";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

const OUTBOUND = ["triggerVapiCall", "uploadVideoToYouTube", "sendDealerEmail", "setCampaignStatus"];
const DOORS = ["createPublishAction", "requestApproval", "createMetaPlatform"];

function caseBodyOf(tool: string): string {
  const src = code(BRAIN);
  const body = src.slice(src.indexOf("export async function executeTool"), src.indexOf("export interface ChatTurnResult"));
  const from = body.indexOf(`\n    case "${tool}"`);
  const next = body.indexOf('\n    case "', from + 10);
  return body.slice(from, next < 0 ? undefined : next);
}

describe("1. THE CLAUSE'S SCOPE, AND THE LIMIT OF THE MEASURE", () => {
  it("THE WALK IS SOUND FROM A TOOL AND UNSOUND FROM A ROUTE, and here is why", () => {
    // MEASURED ON 5 NOVEMBER 2026, after trying it. The walk resolves
    // calls BY NAME. A chat tool's case body calls distinctive things —
    // `activateMetaCampaign`, `switchMetaCampaign` — so the graph it
    // opens is the real one. A route handler's body is reached through
    // `POST`, and `POST` is declared in 145 files: walking from one
    // route arrives at every other route's handler, and from there at
    // everything.
    //
    // The attempt reported 147 of 273 API routes as reaching every
    // sender in the product, including /api/admin/invoices placing a
    // phone call. None of it was true.
    //
    // SO THE CLAUSE IS TESTED OVER THE CHAT SURFACE, which is where all
    // five audited incidents came from, and extending it to routes
    // needs a different instrument — a type-aware call graph, not this
    // one. Recorded here so the next person does not spend the evening
    // I spent.
    const index = functionIndex();
    const handlers = index.get("POST") ?? [];
    expect(
      handlers.length,
      "POST no longer resolves to many bodies — re-check whether a route-level walk is sound now"
    ).toBeGreaterThan(50);

    // And the limitation is written where someone reading the walker
    // will find it, not only here.
    const walker = sourceWithComments("tests/helpers/reachability.ts");
    expect(walker).toMatch(/resolves by\s+\/\/ NAME|resolves by NAME/);
    expect(walker).toMatch(/conflated/);
  });

  it("AND THE CONFLATION CANNOT HIDE A SENDER, which is why the green result stands", () => {
    // The direction matters. Resolving by name adds EDGES: it can
    // invent a path that does not exist — a false alarm, which a person
    // reads — and it cannot remove one. A sender is reported if ANY
    // path reaches it, so an over-connected graph cannot produce a
    // quiet pass.
    //
    // ASSERTED AS THE MECHANISM, not by example. The first version of
    // this test picked an Internal tool and expected the generous
    // graph to drag it to a sender; it did not, because a TOOL's body
    // calls distinctive names and does not explode. That was a wrong
    // assumption about where the conflation lives — it lives in
    // `POST`, not in the tools — and the measure above is what
    // actually found it.
    //
    // So: a call to a name with many bodies walks ALL of them, which is
    // the property that makes the conflation additive.
    const index = functionIndex();
    const viaSharedName = reachable("{ await POST(request); }", ["triggerVapiCall"], [], { index });
    expect(
      viaSharedName.found,
      "a name with 145 bodies no longer walks all of them — the conflation may now be able to hide a path"
    ).toContain("triggerVapiCall");
  });
});

describe("2. THE MEASURE CAN SEE, AND THE DOOR IS WHAT STOPS IT", () => {
  const index = functionIndex();

  it("WITH THE DOORS OPEN, THE MONEY STEP REACHES META", () => {
    // THE ASSERTION THAT MAKES THE GREEN ONE MEAN SOMETHING. A measure
    // that found nothing because it cannot see would report exactly
    // what a guarded product reports. So: open the doors, and the walk
    // must arrive at the live Meta call.
    const open = reachable(caseBodyOf("activate_meta_campaign"), OUTBOUND, [], { index });
    expect(open.found, "the walk can no longer see the Meta call at all").toContain("setCampaignStatus");
  });

  it("AND WITH THE DOORS CLOSED, IT DOES NOT", () => {
    const closed = reachable(caseBodyOf("activate_meta_campaign"), OUTBOUND, DOORS, { index });
    expect(closed.found).toEqual([]);
    expect(closed.walls).toContain("createPublishAction");
  });

  it("AND A SEND CANNOT BE REACHED FROM ITS TOOL AT ALL, which is S6/P1's shape", () => {
    // A DIFFERENT AND STRONGER RESULT than the campaign one above, and
    // the first version of this test expected the wrong thing.
    //
    // `activate_meta_campaign` can reach Meta from its own module, so
    // the door is what stops it — doors open, sender visible; doors
    // closed, not. A SEND is not like that: `trigger_call` raises an
    // approval and returns, and the call is placed later by the
    // dispatcher, from the approvals route. So the sender is not
    // reachable from the tool even with every door open. There is no
    // path to wall off, which is the strongest form of the clause.
    const open = reachable(caseBodyOf("trigger_call"), OUTBOUND, [], { index });
    expect(open.found, "the tool can now reach the sender directly, which is what the envelope removed").toEqual([]);

    // And the dispatcher — the thing the approvals route calls — is
    // where the sender actually lives.
    const dispatcher = reachable(code("src/lib/dispatch/call.ts"), OUTBOUND, [], { index });
    expect(dispatcher.found).toContain("triggerVapiCall");
  });

  it("and the two recorded exemptions are the only ungated paths", () => {
    // Not a second copy of stateChangeDoor's sweep — just that the
    // list this stage leaves behind is the one it says it leaves.
    expect(Object.keys(UNGATED_BY_DECISION).sort()).toEqual(["pause_meta_campaign", "send_email"]);
  });
});

describe("3. THE COPY DOOR'S BACKLOG IS SHORTER THAN WHEN THE STAGE BEGAN", () => {
  it("FOUR ENTRIES ON 11 OCTOBER, THREE NOW", () => {
    // S6/P5 migrated seoToolkitAgent's two customer-facing tasks and
    // deleted its entry, which is the only way that list may shrink:
    // a file that is through the door and still listed fails
    // oneDoorForCopy.test.ts.
    const door = code("tests/oneDoorForCopy.test.ts");
    const block = door.slice(door.indexOf("const MIGRATING"), door.indexOf("};", door.indexOf("const MIGRATING")));
    const entries = block.match(/"src\/[^"]+":/g) ?? [];
    expect(entries).toHaveLength(3);
    expect(block).not.toContain("seoToolkitAgent");
  });

  it("AND THE THREE THAT REMAIN ARE THE ONES THE FOUNDER DEFERRED", () => {
    // Named, so "three left" cannot quietly become three different
    // ones. brandBuildingAgent and chatbotAgent were deferred on
    // 11 October and again on 4 November; websiteBuilderAgent's
    // block-aware door is a design decision he left for later.
    const door = code("tests/oneDoorForCopy.test.ts");
    const block = door.slice(door.indexOf("const MIGRATING"), door.indexOf("};", door.indexOf("const MIGRATING")));
    for (const file of ["websiteBuilderAgent", "brandBuildingAgent", "chatbotAgent"]) {
      expect(block, `${file} is no longer the entry it was`).toContain(file);
    }
  });

  it("and each one still carries its date and its step", () => {
    // oneDoorForCopy enforces this too; asserted here because "three
    // left" is only meaningful if each says why.
    const door = sourceWithComments("tests/oneDoorForCopy.test.ts");
    const block = door.slice(door.indexOf("const MIGRATING"), door.indexOf("};", door.indexOf("const MIGRATING")));
    expect(block.match(/2026-10-11/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("4. WHAT S6 DID NOT PROVE, written down rather than assumed", () => {
  it("THE PLAN RECORDS WHAT IS UNVERIFIED LIVE", () => {
    // The same assertion S5's exit test carries, for the same reason: a
    // limit that lives only in a commit message is a limit somebody
    // later assumes was lifted. Nothing in S6 was rehearsed against a
    // real customer, a real call or a real upload.
    // ASSERTED IN THE EXIT SECTION, NOT ANYWHERE IN THE FILE. The
    // first version matched "unverified live" anywhere in the plan —
    // and it appears five times, so deleting the exit section's own
    // statement left the test green. The place somebody reads the
    // stage's RESULT is the place that has to carry it.
    const plan = code("docs/PLAN-S6-ACTIONS.md");
    const exitSection = plan.slice(plan.indexOf("## 17. P6"));
    expect(exitSection.length, "the exit section is gone").toBeGreaterThan(500);
    expect(exitSection).toMatch(/[Uu]nverified live/);
    // \s+ BETWEEN THE WORDS, because the plan is wrapped prose and the
    // sentence crosses a line break. The first version matched on one
    // line only and failed against a paragraph that says exactly what
    // it asked for.
    expect(exitSection).toMatch(/real customer,\s+a real call or a\s+real upload/);
  });

  it("AND THAT FOUR OF THE EIGHT DUPLICATE ROWS WERE NEVER CHECKED", () => {
    // P4 checked four and withdrew all four. The other four rows are
    // still in §4.2 and must not read as promises.
    const arch = code("docs/PLAN-CORE-ARCHITECTURE.md");
    expect(arch).toMatch(/FOUR OF EIGHT CHECKED AND WITHDRAWN/);
    expect(arch).toMatch(/treated as unverified/);
  });

  it("AND THAT THE CLAUSE COVERS THE CHAT SURFACE, not every route", () => {
    // The honest boundary of the stage's own exit criterion. If this
    // sentence ever disappears from the plan, the clause will start
    // reading as a claim about the whole product.
    // Again in the exit section, and as a HEADING: the scope is the
    // first thing that stops being read if it is only a line in a
    // paragraph. "chat surface" appears twice in the plan, so matching
    // the whole file proved nothing.
    const plan = sourceWithComments("docs/PLAN-S6-ACTIONS.md");
    const exitSection = plan.slice(plan.indexOf("## 17. P6"));
    expect(exitSection).toMatch(/^### The scope, stated plainly: the CHAT SURFACE$/m);
    expect(exitSection).toMatch(/147 of 273/);
  });
});
