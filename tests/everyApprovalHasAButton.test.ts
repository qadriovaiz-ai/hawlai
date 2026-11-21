// Every approval the chat creates reaches a button the owner can press.
//
// THIS IS THE THIRD TIME, and each time it was a different branch of
// the same file:
//
//   10 Oct 2026 — the email card. ArtifactCard's emailPreview branch
//     contained `{publishStrip}` and never `{approvalStrip}`. G-3 had
//     deleted the publish descriptor, so the branch had no button left.
//     The chat said "Press Approve on the card above".
//   21 Nov 2026, morning — edit_collection_text, publish_blog_post and
//     upload_store_image had no case in extractArtifact at all, so no
//     card was produced. The approvals existed in the database with no
//     way to take them.
//   21 Nov 2026, afternoon — generate_graphic. Its card IS produced,
//     correctly, carrying the approval. But the card is
//     `kind: "visual"`, and the conversation's visual branch rendered
//     only `artifact.publish` and `artifact.cannotPublish`. G-3 step 1b
//     had replaced publish with approval for that card, so nothing
//     rendered: "hit the button above to confirm", above no button.
//
// Each previous test was written for the branch that had just broken.
// This one is written for the PROPERTY, in both halves of the journey:
//
//   SERVER — a tool that creates an approval must produce a card
//            carrying it. Derived from the code, not a hand-kept list,
//            so a new tool is covered the day it is written.
//   CLIENT — a card carrying an approval must render an Approve
//            button, whatever its kind.
//
// renderToStaticMarkup needs no DOM and runs no effects, which is
// exactly the question: what does the first paint contain.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { code } from "./helpers/source";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { extractArtifact } from "@/lib/agents/masterBrainV2";
import { ArtifactCard, VisualArtifactStrip } from "@/components/chat/MasterChatPage";

const BRAIN = "src/lib/agents/masterBrainV2.ts";

const hasApprove = (html: string) => />\s*Approve\s*</.test(html);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * Every tool whose handler creates an approval, read off the code.
 *
 * DERIVED, NOT LISTED. A hand-kept list is a list someone forgets to
 * add to — which is how three tools shipped cardless in the morning.
 * A case body that calls requestApproval or createPublishAction (under
 * any local alias) is a case that can hand the owner a decision.
 *
 * Bodies are bounded at BOTH ends: the next case label OR the end of
 * the switch, whichever comes first. Without the second bound the
 * slice runs past the switch into module-level helpers — the
 * get_report_links slice came out 17,670 characters that way.
 */
function approvalCreatingTools(): string[] {
  const src = code(BRAIN);
  const labels: [string, number][] = [];
  for (const m of src.matchAll(/case "([a-z0-9_]+)":/g)) labels.push([m[1], m.index!]);

  const creators = new Set<string>();
  for (let i = 0; i < labels.length; i++) {
    const start = labels[i][1];
    const nextLabel = i + 1 < labels.length ? labels[i + 1][1] : src.length;
    const re = /\n {2}\}/g;
    re.lastIndex = start;
    const m = re.exec(src);
    const body = src.slice(start, Math.min(nextLabel, m ? m.index : src.length));
    // `createMetaAction`, `createTextAction`, `createPostAction` … are
    // all local aliases of createPublishAction, so the import name is
    // matched rather than each alias.
    if (/requestApproval\(|createPublishAction|create\w*Action\(/.test(body)) creators.add(labels[i][0]);
  }
  return [...creators].sort();
}

describe("1. the sweep knows which tools to sweep", () => {
  it("finds the tools that create approvals, from the code", () => {
    const tools = approvalCreatingTools();
    // Not vacuous, and it must include the ones that have broken.
    expect(tools.length).toBeGreaterThanOrEqual(6);
    for (const known of [
      "edit_collection_text",
      "publish_blog_post",
      "upload_store_image",
      "generate_graphic",
      "propose_page_meta",
      "edit_page_text",
    ]) {
      expect(tools, `${known} should be detected as creating an approval`).toContain(known);
    }
  });
});

describe("2. SERVER: a tool that creates an approval produces a card carrying it", () => {
  /**
   * A plausible success payload. Covers both spellings, because the
   * handlers genuinely differ: the publish-action path returns
   * `approval_id`, and requestApproval's path returns `approvalId`.
   * A card reading the wrong one renders no button, which is the bug
   * in miniature.
   */
  const payload = {
    success: true,
    approval_id: "ap-1",
    approvalId: "ap-1",
    action_id: "act-1",
    summary: "a summary",
    note: "Ready for your approval below.",
    confirm: "This does the thing.",
    warnings: [],
    changed: [],
    page: "home",
    collection: "frontpage",
    collection_title: "Home page",
    blog: "news",
    image_url: "https://example.supabase.co/x.png",
    _imageQuote: { designType: "social_post", prompt: "a brief", costInr: 3.4, depictionNote: null },
    // Fields particular card builders read and would throw without.
    // Found by running the sweep: set_automation_toggle calls
    // `result.toggle.replace(...)`. A builder crashing on a thin
    // payload is this TEST being unrealistic, not the product being
    // broken — but it is reported separately below rather than
    // swallowed, because a crash could also be a real bug.
    toggle: "auto_reply_dm",
    enabled: true,
    headline: "a headline",
    current_status: "PAUSED",
    daily_budget: "500",
  };

  /**
   * Two tools whose approval is CONDITIONAL and whose success shape is
   * bespoke, so one flat payload cannot reach the right branch.
   *
   * NAMED, WITH THE TEST THAT COVERS THEM, rather than quietly skipped
   * — and the sweep below asserts those files exist, so the exemption
   * cannot become a way of avoiding the question.
   *
   *   send_email       — its card needs `to` / `subject` /
   *                      `_emailPreview` to reach the branch that
   *                      carries the approval. Verified: that branch
   *                      does carry it, and the button is rendered in
   *                      tests/approveButtonRenders.test.ts, which
   *                      exists because this exact card lost its
   *                      button on 10 October.
   *   generate_content — only asks for an approval when the content is
   *                      a social post with somewhere to publish it,
   *                      and returns it inside a `withApproval`
   *                      object. Covered by
   *                      tests/socialPostApprovalRecord.test.ts.
   *
   * A third tool must not join this list without the same treatment:
   * a reason, and a named test that really asserts the button.
   */
  const COVERED_ELSEWHERE: Record<string, string> = {
    send_email: "tests/approveButtonRenders.test.ts",
    generate_content: "tests/socialPostApprovalRecord.test.ts",
  };

  it("the exemptions name real test files", () => {
    // An exemption pointing at a file that does not exist is an
    // exemption pointing at nothing.
    for (const [tool, file] of Object.entries(COVERED_ELSEWHERE)) {
      expect(() => code(file), `${tool} is exempted via ${file}, which cannot be read`).not.toThrow();
    }
  });

  it("THE LOAD-BEARING ONE: every one of them, no exceptions", () => {
    const missing: string[] = [];
    const threw: string[] = [];
    for (const tool of approvalCreatingTools()) {
      if (COVERED_ELSEWHERE[tool]) continue;
      let card: any;
      try {
        card = extractArtifact(tool, {}, payload);
      } catch (e) {
        // NOT SWALLOWED. Usually this fixture being thinner than the
        // real result, but it could be a card builder that crashes on
        // a shape the handler can genuinely produce — so it is named
        // in its own list rather than counted as a pass.
        threw.push(`${tool}: ${(e as Error).message}`);
        continue;
      }
      if (!card) {
        missing.push(`${tool}: no card at all`);
        continue;
      }
      if (!card.approval?.id) missing.push(`${tool}: card carries no approval`);
    }
    expect(
      missing,
      `These tools create an approval the owner cannot see or take:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
    expect(
      threw,
      `These card builders threw on the sweep payload. Add the field they read to it, or fix the builder:\n  ${threw.join(
        "\n  "
      )}`
    ).toEqual([]);
  });
});

describe("3. CLIENT: a card carrying an approval renders a button", () => {
  const render = (artifact: any) => renderToStaticMarkup(createElement(ArtifactCard as any, { artifact }));
  const renderVisual = (artifact: any) =>
    renderToStaticMarkup(createElement(VisualArtifactStrip as any, { artifact }));

  it("THE LOAD-BEARING ONE: the graphic quote, which is what broke", () => {
    // kind "visual", type "image_quote", approval present — and the
    // conversation's visual branch had no approval strip at all.
    const html = renderVisual({
      kind: "visual",
      type: "image_quote",
      label: "Image to generate",
      summary: "a festive display",
      approval: { id: "ap-graphic-1" },
      confirm: "This makes one AI image now. It costs about ₹3.40.",
    });
    expect(hasApprove(html), "the graphic quote has no Approve button").toBe(true);
  });

  it("and the price is on screen above the button", () => {
    // A button that spends with no sentence saying what it costs is
    // the 8 October incident in miniature.
    const html = renderVisual({
      kind: "visual",
      type: "image_quote",
      label: "Image to generate",
      approval: { id: "ap-1" },
      confirm: "This makes one AI image now. It costs about ₹3.40.",
    });
    expect(html).toContain("3.40");
    expect(html.indexOf("3.40")).toBeLessThan(html.indexOf(">Approve<"));
  });

  it("EVERY KIND, so the next card shape cannot lose its button", () => {
    // The property rather than the branch. Each of these is a shape a
    // tool actually produces.
    const shapes: [string, any][] = [
      ["record", { kind: "record", label: "x", approval: { id: "a" }, confirm: "c", fields: [] }],
      ["document", { kind: "document", label: "x", approval: { id: "a" }, confirm: "c", changes: [] }],
      ["metric", { kind: "metric", label: "x", approval: { id: "a" }, confirm: "c", metric: { heroValue: "1", heroLabel: "l" } }],
      ["link", { kind: "link", label: "x", approval: { id: "a" }, confirm: "c" }],
    ];
    const missing: string[] = [];
    for (const [name, artifact] of shapes) {
      if (!hasApprove(render(artifact))) missing.push(name);
    }
    expect(missing, `these kinds render no Approve button: ${missing.join(", ")}`).toEqual([]);
  });

  it("a visual card with NO approval still renders, and offers nothing", () => {
    // The ordinary case — a generated image. It must not grow a button
    // it has no authority for.
    const html = renderVisual({ kind: "visual", type: "image", label: "Generated Image", url: "https://x/y.png" });
    expect(hasApprove(html)).toBe(false);
    expect(html).toContain("Generated Image");
  });

  it("and a visual card with a publish descriptor keeps its own strip", () => {
    // The website draft still uses PublishStrip. Adding the approval
    // card must not double up on it.
    const html = renderVisual({
      kind: "visual",
      type: "website",
      label: "Website Draft",
      // `payload` is required: PublishStrip reads
      // publish.payload.image_source.
      publish: { kind: "site", label: "Publish", confirm: "This makes it public.", payload: {} },
    });
    expect(html).toContain("Website Draft");
  });
});

describe("4. A CARD AWAITING A DECISION DOES NOT CLAIM IT IS DONE", () => {
  // THE OTHER HALF OF THE 21 NOVEMBER FINDING, and the half a
  // button-only sweep misses. These three labels survived the gating
  // of their actions in Phase 2B:
  //
  //   "Published to YouTube"      — nothing was published
  //   "Call placed"               — no call was placed
  //   "Discount code created"     — nothing was created
  //
  // Reverting one of them while KEEPING the approval survived the
  // sweep above, which is how a card can be honest about having a
  // button and dishonest about what it means.
  //
  // A write that writes nothing must not report success. A card is a
  // read of that same rule.

  /** Past tense, which is the claim. "Create" is a request; "created" is a lie. */
  const CLAIMS_DONE =
    /\b(published|placed|created|sent|added|posted|saved|uploaded|changed|updated|launched|done|live)\b/i;

  const payload = {
    approvalId: "ap-1",
    approval_id: "ap-1",
    action_id: "act-1",
    confirm: "This does the thing.",
    summary: "s",
    note: "n",
    warnings: [],
    changed: [],
    toggle: "dm_auto_reply",
    enabled: true,
    page: "home",
    collection: "frontpage",
    collection_title: "Home page",
    blog: "news",
    image_url: "https://example.supabase.co/x.png",
    headline: "h",
    current_status: "PAUSED",
    daily_budget: "500",
    _imageQuote: { designType: "social_post", prompt: "a brief", costInr: 3.4, depictionNote: null },
  };

  it("THE LOAD-BEARING ONE: no pending card's label is in the past tense", () => {
    const lying: string[] = [];
    for (const tool of approvalCreatingTools()) {
      let card: any;
      try {
        card = extractArtifact(tool, {}, payload);
      } catch {
        continue; // reported by the sweep above
      }
      if (!card?.approval?.id) continue; // reported by the sweep above
      const label = String(card.label ?? "");
      if (CLAIMS_DONE.test(label)) {
        lying.push(`${tool}: "${label}" — this is waiting for approval, so nothing has happened yet`);
      }
    }
    expect(
      lying,
      `These cards tell the owner an action is done while asking him to approve it:\n  ${lying.join("\n  ")}`
    ).toEqual([]);
  });

  it("the detector really detects — it is the point of the test above", () => {
    // A regex that matched nothing would make the sweep vacuous.
    for (const past of ["Published to YouTube", "Call placed", "Discount code created", "Email sent"]) {
      expect(CLAIMS_DONE.test(past), past).toBe(true);
    }
    // And it does not fire on a request.
    for (const asking of [
      "Publish to YouTube — approve to go ahead",
      "Place the call — approve to dial",
      "Create the discount code — approve to add it",
      "Add a picture to the store's files",
      "Image to generate",
    ]) {
      expect(CLAIMS_DONE.test(asking), asking).toBe(false);
    }
  });
});

describe("5. THE TOGGLE'S ON PATH, which crashed rather than losing a button", () => {
  // Turning a gated automation ON returns requestApproval's object and
  // NOTHING else — no `toggle`, no `enabled`. The card did
  // `result.toggle.replace(...)` and threw, so enabling any of the six
  // gated automations from chat was broken from 2026-10-09.
  //
  // Switching OFF is never gated (the safe direction must not be the
  // slow one), returns toggle/enabled, and worked throughout — which is
  // why nobody noticed.
  const onPath = { approvalId: "ap-toggle-1", risk: "medium", confirm: "This turns on DM auto-reply." };

  it("THE LOAD-BEARING ONE: it does not throw", () => {
    expect(() => extractArtifact("set_automation_toggle", {}, onPath)).not.toThrow();
  });

  it("and it carries the approval, so the owner can start it", () => {
    const card: any = extractArtifact("set_automation_toggle", {}, onPath);
    expect(card?.approval?.id).toBe("ap-toggle-1");
    expect(card?.confirm).toContain("turns on");
  });

  it("switching OFF still needs no approval and still reads correctly", () => {
    const offCard: any = extractArtifact("set_automation_toggle", {}, {
      success: true,
      toggle: "dm_auto_reply",
      enabled: false,
      note: "Switched off.",
    });
    expect(offCard.approval).toBeUndefined();
    expect(JSON.stringify(offCard.fields)).toContain("Turned off");
  });

  it("and a malformed result does not take the chat turn down with it", () => {
    // The guard that made the crash impossible rather than unlikely.
    expect(() => extractArtifact("set_automation_toggle", {}, { success: true })).not.toThrow();
  });
});
