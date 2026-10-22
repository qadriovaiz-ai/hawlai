// APPROVED, CONFIRMED, AND NOTHING HAPPENED — S3, 22 October 2026.
//
// The founder approved a paragraph edit and an undo of a page title.
// Both cards confirmed. Neither reached the live page, and no error
// appeared anywhere. Two different features, one symptom, so the fault
// had to be in a shared layer — and it is.
//
// `releaseApprovedAction` answers `not_a_publish_action` when no
// publish action carries the approval's id. That is a LEGITIMATE answer
// for an ad budget change, so the approve route fell through to a plain
// 200 with no `publish` key — and the chat card, seeing no publish
// verdict, says "Applied." in green.
//
// The two cases were always distinguishable and were never
// distinguished: an approval raised by createPublishAction carries
// `action_details.publish_action_id`. If that is there and no action
// links back, the decision has been recorded and the work can never
// run.
//
// And the link itself was written without checking its error — the one
// discarded `await` in createPublishAction. Both halves are fixed here,
// because either one alone leaves the other able to produce the same
// silence.

import { describe, it, expect } from "vitest";
import { code } from "./helpers/source";

const ROUTE = code("src/app/api/approvals/[id]/route.ts");
const CREATE = code("src/lib/publish/create.ts");

describe("1. a broken link is reported, not congratulated", () => {
  it("THE ROUTE TELLS THE OWNER WHEN THE WORK CANNOT BE FOUND", () => {
    expect(ROUTE).toMatch(/released\.kind === "not_a_publish_action" && \(approval\?\.action_details as any\)\?\.publish_action_id/);
  });

  it("AND SAYS NOTHING WAS APPLIED, in those words", () => {
    const block = ROUTE.slice(ROUTE.indexOf('released.kind === "not_a_publish_action"'), ROUTE.indexOf('if (released.kind === "ran")'));
    expect(block).toMatch(/status: "failed"/);
    expect(block).toMatch(/nothing was applied/);
    // And offers the way forward, because a half-done change is the
    // owner's real worry here.
    expect(block).toMatch(/Nothing is half-done/);
  });

  it("while an approval that never had an action stays a plain success", () => {
    // An ad budget change is not a publish action and must not start
    // reporting a failure. The guard is the publish_action_id, not the
    // kind alone.
    const block = ROUTE.slice(ROUTE.indexOf('released.kind === "not_a_publish_action"'), ROUTE.indexOf('if (released.kind === "ran")'));
    expect(block).toMatch(/publish_action_id/);
  });
});

describe("2. the link between a decision and its work is checked", () => {
  it("THE approval_id WRITE NO LONGER DISCARDS ITS ERROR", () => {
    expect(CREATE).toMatch(/const \{ error: linkError \} = await supabase/);
    expect(CREATE).toMatch(/if \(linkError\) \{/);
  });

  it("AND A FAILED LINK FAILS THE ACTION rather than leaving it awaiting", () => {
    const block = CREATE.slice(CREATE.indexOf("if (linkError) {"), CREATE.indexOf("publishLog(\"create.awaiting_approval\""));
    expect(block).toMatch(/status: "failed"/);
    expect(block).toMatch(/Could not link the approval/);
  });

  it("AND REFUSES THE WHOLE THING, so no card is shown for work that cannot run", () => {
    const block = CREATE.slice(CREATE.indexOf("if (linkError) {"), CREATE.indexOf("publishLog(\"create.awaiting_approval\""));
    expect(block).toMatch(/return \{ ok: false/);
    // The owner is not asked to approve something that could not then
    // be carried out.
    expect(block).toMatch(/I couldn't connect that to its approval card/);
  });

  it("and it is logged where the other publish failures are logged", () => {
    expect(CREATE).toMatch(/create\.link_failed/);
  });
});

describe("3. the executor's own preconditions are unchanged", () => {
  it("RELEASE STILL FINDS THE ACTION BY approval_id", () => {
    // The lookup this whole failure mode hangs off. If it ever changes
    // shape, the guard in the route changes with it.
    const release = code("src/lib/publish/release.ts");
    expect(release).toMatch(/\.eq\("approval_id", approvalId\)/);
    expect(release).toMatch(/if \(!action\) return \{ kind: "not_a_publish_action" \}/);
  });
});
