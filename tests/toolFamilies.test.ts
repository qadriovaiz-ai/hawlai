// WHICH TOOLS CHANGE ANYTHING, AND WHAT — S6/P2.
//
// S6's exit clause is "nothing that changes state is reachable except
// through an Action". To check that over all 59 chat tools, something
// has to say which tools change anything at all — otherwise a tool
// nobody classified is invisible to the check, and the next one added
// in a hurry is exactly the one that would be.
//
// SO THE LABELS ARE RE-CHECKED AGAINST THE CODE, NOT TRUSTED. Every
// assertion below walks the call graph out of the tool's own case body
// with the Actions treated as walls (tests/helpers/reachability.ts) and
// compares what it finds to the label in the registry. A tool that
// grows a send stops matching "read", and the suite says so by name.
//
// WHAT A LABEL IS NOT: a promise that the tool is safe. It says what
// KIND of change the tool makes. Whether that change is gated is
// stateChangeDoor.test.ts's question, and the two share one list of
// recorded exemptions so they cannot drift apart.

import { describe, it, expect } from "vitest";
import {
  TOOL_FAMILIES,
  familyOf,
  stateChangingTools,
  toolsInFamily,
  type ToolFamily,
} from "@/lib/businessBrain/toolRegistry";
import { dispatchedActionTypes } from "@/lib/dispatch/registry";
import { code, sourceWithComments } from "./helpers/source";
import { functionIndex, reachable } from "./helpers/reachability";
import { UNGATED_BY_DECISION, ungatedSymbolsFor } from "./helpers/ungatedByDecision";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

/** Everything that reaches the outside world, or spends. */
const OUTBOUND = [
  "sendDealerEmail",
  "sendMarketingEmail",
  "triggerVapiCall",
  "uploadVideoToYouTube",
  "postPhotoToPage",
  "postTextToPage",
  "postPhotoToInstagram",
  "sendDmReply",
  "sendCommentReply",
  "sendWhatsAppText",
  "sendWhatsAppImage",
  "setCampaignStatus",
];

/** The Actions. The walk stops at each of these. */
const DOORS = [
  "createPublishAction",
  "requestApproval",
  "createMetaPlatform",
  "createShopifyPlatform",
  "createHawlaiShopPlatform",
  "createHawlaiSitePlatform",
  "createPlatformRegistry",
];

function toolCases(): Map<string, string> {
  const src = code(BRAIN);
  const start = src.indexOf("export async function executeTool");
  const end = src.indexOf("export interface ChatTurnResult");
  const body = src.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/\n    case "([a-z_0-9]+)"/g)) {
    const from = body.indexOf(`\n    case "${m[1]}"`);
    const next = body.indexOf('\n    case "', from + 10);
    out.set(m[1], body.slice(from, next < 0 ? undefined : next));
  }
  return out;
}

/**
 * A fall-through case shares its body with the NEXT one that has a
 * body, which is how `propose_campaign_budget_change` works. Reading
 * its own slice gives one line and no calls, so a walk from it would
 * find nothing and every label would pass.
 *
 * A FALL-THROUGH IS AN EMPTY SLICE, NOT A BRACELESS ONE — the first
 * version of this looked for a `{` and therefore treated
 *
 *     case "activate_meta_campaign":
 *       return activateMetaCampaign(ctx, supabase, input);
 *
 * as a fall-through, walked `pause_meta_campaign`'s body instead, and
 * reported the money step as reaching no Action at all. A delegating
 * one-liner is the whole point of S6: the work is one hop away, not
 * absent.
 */
function bodyFor(cases: Map<string, string>, tool: string): string {
  const names = [...cases.keys()];
  // A fall-through slice is ITS OWN LABEL AND NOTHING ELSE. Stripping
  // the label and looking for anything left is the test; the first
  // version split on newlines and kept the label, so it never detected
  // one.
  const isEmpty = (body: string) => !body.trim().replace(/^case\s+"[a-z_0-9]+":\s*/, "").trim();
  let at = names.indexOf(tool);
  let body = cases.get(tool) ?? "";
  while (at >= 0 && at < names.length - 1 && isEmpty(body)) {
    at += 1;
    body = cases.get(names[at]) ?? "";
  }
  return body;
}

/**
 * TOOLS THAT SHARE ONE BODY, and what that costs this file.
 *
 * `case "a": case "b": { … }` means the walk cannot tell them apart —
 * it sees one body and every call in it, whichever tool it started
 * from. The same branch-insensitivity made the money step read as
 * ungated in S6/P0, and there the answer was to split the function.
 *
 * HERE THE LABELS ARE ASSERTED BY READING INSTEAD, and the pair is
 * written down so that is a visible choice rather than a silent pass.
 * Found by listing every case whose own slice holds nothing but its
 * label — not one at a time.
 */
const SHARE_A_BODY: Record<string, { with: string; why: string }> = {
  read_page: {
    with: "edit_page_text",
    why:
      "2026-11-04: one body serves both, branching on the tool name inside. read_page returns the page's blocks; edit_page_text changes them through createPublishAction. The walk sees the edit path from either, so read_page's `read` label is asserted by reading the code, not by walking it. Splitting them is a later phase: the body is long and page text is live.",
  },
  propose_campaign_budget_change: {
    with: "propose_campaign_targeting_change",
    why:
      "2026-11-04: one body resolves the campaign and raises an approval for whichever field was asked about. Both are ResourceEdits through the same door, so sharing a body costs the walk nothing here — recorded for completeness.",
  },
};

describe("1. EVERY TOOL IS CLASSIFIED, AND EVERY CLASSIFICATION IS A TOOL", () => {
  const cases = toolCases();

  it("NOT ONE TOOL IS UNCLASSIFIED — a new one fails this by default", () => {
    // THE HOLE THIS CLOSES. A tool added without a family is a tool
    // the exit check cannot see, and "I'll classify it later" is how
    // the 59th got here.
    const missing = [...cases.keys()].filter((t) => !familyOf(t));
    expect(
      missing,
      `These chat tools have no family in TOOL_FAMILIES. Add each one with its reason:\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("AND NOTHING IS CLASSIFIED THAT IS NOT A TOOL", () => {
    // A label for a tool that was renamed or deleted is a label nobody
    // checks, and it makes the count above look complete.
    const stale = Object.keys(TOOL_FAMILIES).filter((t) => !cases.has(t));
    expect(stale, `These are classified but are not chat tools any more — delete them:\n${stale.join("\n")}`).toEqual([]);
  });

  it("the four families are the only ones, and each has members", () => {
    const families: ToolFamily[] = ["read", "Internal", "ResourceEdit", "Dispatch"];
    expect([...new Set(Object.values(TOOL_FAMILIES))].sort()).toEqual([...families].sort());
    for (const f of families) expect(toolsInFamily(f).length, f).toBeGreaterThan(0);
  });

  it("and the registry answers for what it holds, and nothing else", () => {
    expect(familyOf("send_email")).toBe("Dispatch");
    expect(familyOf("toString")).toBeNull();
    expect(familyOf("a_tool_that_does_not_exist")).toBeNull();
  });
});


describe("2. A LABEL IS CHECKED AGAINST THE CODE, NOT TRUSTED", () => {
  const cases = toolCases();
  const index = functionIndex();

  it("A `read` TOOL CANNOT REACH THE OUTSIDE WORLD", () => {
    // The load-bearing one. "It only reads" is the easiest thing to
    // believe about a tool and the easiest to stop being true: one
    // helper grows a send, and a tool labelled read is posting.
    const offences: string[] = [];
    for (const tool of toolsInFamily("read")) {
      // A shared body cannot be walked for ONE of its tools. See
      // SHARE_A_BODY: the pair is recorded with the reason.
      if (SHARE_A_BODY[tool]) continue;
      const r = reachable(bodyFor(cases, tool), OUTBOUND, DOORS, { index });
      for (const symbol of r.found) {
        if (ungatedSymbolsFor(tool).includes(symbol)) continue;
        offences.push(`${tool} is labelled "read" but can reach ${symbol}`);
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("AND NEITHER CAN AN `Internal` ONE", () => {
    // Internal means this product's own rows. A draft, a goal, a task
    // — nothing a customer or a platform can see.
    const offences: string[] = [];
    for (const tool of toolsInFamily("Internal")) {
      const r = reachable(bodyFor(cases, tool), OUTBOUND, DOORS, { index });
      for (const symbol of r.found) {
        if (ungatedSymbolsFor(tool).includes(symbol)) continue;
        offences.push(`${tool} is labelled "Internal" but can reach ${symbol}`);
      }
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("AND NEITHER TOUCHES THE RESOURCE-EDIT MACHINERY", () => {
    // THE OTHER HALF, AND A MUTATION FOUND IT MISSING: relabelling
    // propose_price_change as "Internal" passed everything, because
    // the Internal check only asks whether it reaches a SENDER — and a
    // price change reaches none, it goes through createPublishAction.
    //
    // `publish/` exists to edit a resource on a platform. A tool that
    // reaches it is editing one, whatever its label says.
    const EDIT_MACHINERY = ["createPublishAction", "createMetaPlatform", "createShopifyPlatform", "createHawlaiShopPlatform", "createHawlaiSitePlatform", "createPlatformRegistry"];
    const offences: string[] = [];
    for (const tool of [...toolsInFamily("read"), ...toolsInFamily("Internal")]) {
      if (SHARE_A_BODY[tool]) continue;
      const r = reachable(bodyFor(cases, tool), EDIT_MACHINERY, ["requestApproval"], { index });
      for (const symbol of r.found) {
        offences.push(`${tool} is labelled "${familyOf(tool)}" but reaches ${symbol} — that is a ResourceEdit`);
      }
    }
    expect(offences, offences.join("; ")).toEqual([]);
  });

  it("A `ResourceEdit` OR `Dispatch` TOOL REACHES AN ACTION", () => {
    // The other direction: a tool that says it changes something
    // outside must have a way of doing it that goes through an Action
    // — or be on the recorded exemption list with its date.
    const offences: string[] = [];
    for (const tool of [...toolsInFamily("ResourceEdit"), ...toolsInFamily("Dispatch")]) {
      if (SHARE_A_BODY[tool]) continue;
      const body = bodyFor(cases, tool);
      const doors = reachable(body, DOORS, [], { index });
      if (doors.found.length) continue;
      if (ungatedSymbolsFor(tool).length) continue;
      offences.push(`${tool} is labelled "${familyOf(tool)}" but reaches no Action at all`);
    }
    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("NO TOOL WRITES ITS OWN APPROVAL ROW", () => {
    // S6/P2a. This started as a DEFECT LIST with two entries and a
    // named fix, on the shrink-only rule oneDoorForCopy.test.ts
    // already runs: a fixed entry fails the suite until it is deleted.
    // The fix landed, both entries went, and the rule is now universal
    // — which is the end state that list existed to reach.
    //
    // WHY IT MATTERS, from requestApproval's own header: one writer,
    // "so the three places a decision happens cannot each invent their
    // own shape". A direct insert skips the ACTION_POLICIES check
    // (which refuses an action nobody classified), the risk level, and
    // the approval id the inline card needs.
    const direct: string[] = [];
    for (const [tool] of cases) {
      if (/from\("pending_approvals"\)\s*\.insert/.test(bodyFor(cases, tool))) direct.push(tool);
    }
    expect(
      direct,
      `These tools write an approval row themselves. Route them through requestApproval instead:\n${direct.join("\n")}`
    ).toEqual([]);
  });

  it("AND NO TOOL SENDS THE OWNER TO ANOTHER PAGE TO APPROVE SOMETHING", () => {
    // The owner-visible half of the same thing. Every card is decided
    // in the message it appears in — the tool registry's own entries
    // say "Never directs them to a separate page", and before P2a the
    // two campaign tools did exactly that because they had no approval
    // id to put on a card.
    const offenders: string[] = [];
    for (const [tool] of cases) {
      if (/dashboard\/approvals/.test(bodyFor(cases, tool))) offenders.push(tool);
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });

  it("AND THE TWO CAMPAIGN TOOLS NOW REACH THE ONE WRITER", () => {
    // Named, because they are what P2a was: a general rule that is
    // true because nothing currently breaks it is weaker than a rule
    // plus the case it was written for.
    // EACH NAMES ITS OWN ACTION TYPE. A pattern matching either one
    // passed when they were swapped, which would route a targeting
    // change through the budget policy — a different risk level and a
    // different threshold.
    const expected: Record<string, string> = {
      propose_campaign_budget_change: "change_campaign_budget",
      propose_campaign_targeting_change: "change_campaign_targeting",
    };
    for (const [tool, actionType] of Object.entries(expected)) {
      const body = bodyFor(cases, tool);
      expect(body, tool).toMatch(/requestApproval\(/);
      // The two branches live in one body, so each is sliced by its own
      // `toolName ===` test rather than searched for in the whole.
      const branch = tool.includes("budget")
        ? body.slice(body.indexOf('if (toolName === "propose_campaign_budget_change")'), body.indexOf("} else {"))
        : body.slice(body.indexOf("} else {"));
      expect(branch.length, `${tool}: the branch could not be sliced`).toBeGreaterThan(200);
      expect(branch, `${tool} must name ${actionType}`).toContain(`actionType: "${actionType}"`);
      expect(branch, `${tool} must not name the other action type`).not.toContain(
        `actionType: "${actionType === "change_campaign_budget" ? "change_campaign_targeting" : "change_campaign_budget"}"`
      );
    }
    // AND THE BUDGET ONE STILL SENDS THE AMOUNT, which is what the
    // approval threshold reads. Losing it would let any budget pass a
    // manager's ceiling.
    expect(bodyFor(cases, "propose_campaign_budget_change")).toMatch(/amount: proposal\.new_budget/);
  });

  it("AND THEIR CARD CARRIES THE APPROVAL, so Approve is in the message", () => {
    // The owner-visible half of P2a. A grep for `confirm: result.confirm`
    // anywhere in the file passed while THIS card lost its id — the
    // string appears in three other branches.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const at = brain.indexOf('case "propose_campaign_budget_change":', brain.indexOf("export function extractArtifact"));
    expect(at, "the card branch is gone").toBeGreaterThan(-1);
    const branch = brain.slice(at, brain.indexOf('case "manage_watch"', at));
    expect(branch).toMatch(/approval: \{ id: result\.approvalId \}/);
    expect(branch).toMatch(/confirm: result\.confirm/);
    // And it no longer tells him it is merely waiting.
    expect(branch).not.toMatch(/Waiting for approval/);
  });

  it("THE TOOLS THAT SHARE A BODY ARE EXACTLY THE ONES ON RECORD", () => {
    // A third pair appearing is a third place the walk cannot tell two
    // tools apart, and it must be a decision rather than a discovery.
    // This finds them the way they were found: every case whose own
    // slice holds nothing but its label.
    const names = [...cases.keys()];
    const found: string[] = [];
    for (const [i, tool] of names.entries()) {
      const slice = cases.get(tool) ?? "";
      const bare = slice.trim().replace(/^case\s+"[a-z_0-9]+":\s*/, "").trim();
      if (!bare && i < names.length - 1) found.push(tool);
    }
    expect(found.sort()).toEqual(Object.keys(SHARE_A_BODY).sort());
    for (const [tool, entry] of Object.entries(SHARE_A_BODY)) {
      expect(names, `${tool} is not a tool any more`).toContain(tool);
      expect(names, `${entry.with} is not a tool any more`).toContain(entry.with);
      expect(entry.why, `${tool} needs the date of the decision`).toMatch(/20\d\d-\d\d-\d\d/);
      expect(entry.why.length, tool).toBeGreaterThan(80);
    }
  });

  it("and the walk really is looking at a body, for every tool", () => {
    // Without this, a parsing slip would make section 2 pass over
    // empty strings — the shape of vacuous green this suite has
    // produced twice today.
    for (const tool of Object.keys(TOOL_FAMILIES)) {
      const body = bodyFor(cases, tool);
      // It is THIS tool's body, or the one it genuinely falls through
      // to — never the bare slice between two case labels.
      expect(body.trim().replace(/^case\s+"[a-z_0-9]+":\s*/, "").trim().length, tool).toBeGreaterThan(40);
    }
  });
});

describe("3. THE TWO REGISTRIES AGREE", () => {
  it("EVERY DISPATCHED ACTION'S TOOL IS LABELLED Dispatch", () => {
    // src/lib/dispatch/ carries out place_outbound_call and
    // publish_video. The tools that raise them are trigger_call and
    // publish_to_youtube, and a classification that called either of
    // them Internal would be describing a different product.
    const byAction: Record<string, string> = {
      place_outbound_call: "trigger_call",
      publish_video: "publish_to_youtube",
    };
    for (const action of dispatchedActionTypes()) {
      const tool = byAction[action];
      expect(tool, `${action} has a dispatcher but this test does not know which tool raises it`).toBeTruthy();
      expect(familyOf(tool), tool).toBe("Dispatch");
    }
  });

  it("AND EVERY Dispatch TOOL IS EITHER ENVELOPED OR ACCOUNTED FOR", () => {
    // send_email is the one Dispatch tool with no dispatcher yet, and
    // the registry says why in its own notes. A second one appearing
    // here unaccounted for is the thing to catch.
    const enveloped = new Set(["trigger_call", "publish_to_youtube"]);
    // sourceWithComments, NOT code(), AND THE REASON IS THE POINT OF
    // RULE 8: what this asserts IS a comment — the registry's own notes
    // on why each remaining send has not moved. Reading it through
    // `code()` strips those notes, which is how the first version of
    // this assertion failed against a registry that does say why.
    const registry = sourceWithComments("src/lib/dispatch/registry.ts");
    for (const tool of toolsInFamily("Dispatch")) {
      if (enveloped.has(tool)) continue;
      const action = tool === "send_email" ? "send_email" : tool;
      expect(
        registry.includes(action),
        `${tool} is a Dispatch with no dispatcher and no note in lib/dispatch/registry.ts saying why`
      ).toBe(true);
    }
  });

  it("A TOOL THAT REACHES A SENDER BY DECISION CANNOT BE LABELLED read OR Internal", () => {
    // THE GAP THIS CLOSES, noticed while writing the mutation for it:
    // the exemption list is per tool and per symbol, so it was ALSO
    // excusing a wrong family. Relabelling send_email as "Internal"
    // would have passed section 2 — the sender it reaches is exempt —
    // while describing a tool that emails customers as one that
    // touches nothing outside this product.
    for (const tool of Object.keys(UNGATED_BY_DECISION)) {
      const family = familyOf(tool);
      expect(family, `${tool} is exempt but unclassified`).toBeTruthy();
      expect(["ResourceEdit", "Dispatch"], `${tool} reaches the outside world, so it is not ${family}`).toContain(family);
    }
  });

  it("the exemptions are one list, shared with the door test", () => {
    // Two lists of exemptions in two files is two lists that drift.
    expect(Object.keys(UNGATED_BY_DECISION).sort()).toEqual(["pause_meta_campaign", "send_email"]);
    const door = code("tests/stateChangeDoor.test.ts");
    expect(door).toMatch(/from "\.\/helpers\/ungatedByDecision"/);
    expect(door).not.toMatch(/const UNGATED_BY_DECISION/);
  });
});

describe("4. the count is reported, and not a target", () => {
  it("SAYS HOW MANY TOOLS CHANGE SOMETHING, without requiring the number to fall", () => {
    // The founder withdrew "tool count falls" on 4 November 2026
    // because it is satisfied by deleting reads. The number is worth
    // KNOWING — it is the size of the surface the exit clause covers —
    // and worth nothing as a target.
    const changing = stateChangingTools();
    const reads = toolsInFamily("read");
    expect(changing.length + reads.length).toBe(Object.keys(TOOL_FAMILIES).length);
    // Deliberately a floor and not a ceiling: this must not become a
    // reason to delete a read.
    expect(changing.length).toBeGreaterThan(20);
    expect(reads.length).toBeGreaterThan(15);
  });

  it("and the restated clause is the one on record", () => {
    const plan = code("docs/PLAN-CORE-ARCHITECTURE.md");
    expect(plan).toMatch(/Nothing that changes state is reachable except through an Action/);
    expect(plan).toMatch(/withdrawn/);
  });
});
