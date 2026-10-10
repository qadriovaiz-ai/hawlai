// NOBODY AGREED TO SPEND THAT MONEY.
//
// 8 October 2026. "MAKE POST AND WRITE A INSTAGRAM CAPTION FOR LAVENDER
// CANDLE" — one sentence — ran Generate Graphic, a paid Gemini image
// call, while Graphic Design was on hold by the owner's own decision for
// exactly that reason. No price was mentioned, nothing asked, and the
// result went public on a real Facebook Page.
//
// Three things were missing and all three are pinned here: the hold was
// not enforced anywhere in code, the chat tool spent money by itself,
// and the price was never said.
//
// The cost figure comes from the repo's own pricing table
// (src/lib/usage/pricing.ts: $0.039/image, usdToInr 87 → ₹3.393), not
// from a live api_usage_logs read, which only Ovaiz can run.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { code } from "./helpers/source";
import { costOfGeminiImageInr } from "@/lib/usage/pricing";
import { isFeatureEnabled, unavailableMessage, KILL_SWITCH_LABELS } from "@/lib/featureFlags";

const HELD = "NEXT_PUBLIC_GRAPHIC_DESIGN_ENABLED";

beforeEach(() => delete process.env[HELD]);
afterEach(() => delete process.env[HELD]);

describe("the hold is a thing the code knows about", () => {
  it("DEFAULT IS HELD: an absent variable reads as off", () => {
    expect(isFeatureEnabled("graphicDesign")).toBe(false);
  });

  it("only the exact string lifts it — a typo leaves the hold on", () => {
    process.env[HELD] = "TRUE";
    expect(isFeatureEnabled("graphicDesign")).toBe(false);
    process.env[HELD] = "yes";
    expect(isFeatureEnabled("graphicDesign")).toBe(false);
    process.env[HELD] = "true";
    expect(isFeatureEnabled("graphicDesign")).toBe(true);
  });

  it("the message is not an upgrade prompt, and says past work is safe", () => {
    const msg = unavailableMessage("graphicDesign");
    expect(msg).toMatch(/AI Graphic Design isn't part of Hawlai right now/);
    expect(msg).toMatch(/still in your library/);
    // No plan buys back something that has been switched off.
    expect(msg).not.toMatch(/upgrade/i);
    expect(KILL_SWITCH_LABELS.graphicDesign).toBe("AI Graphic Design");
  });

  it("it is scoped to Graphic Design — logos, ad creatives and video keep their own switches", () => {
    process.env.NEXT_PUBLIC_VIDEO_GENERATION_ENABLED = "true";
    expect(isFeatureEnabled("videoGeneration")).toBe(true);
    expect(isFeatureEnabled("graphicDesign")).toBe(false);
    delete process.env.NEXT_PUBLIC_VIDEO_GENERATION_ENABLED;
  });
});

describe("the price is on the card the owner reads", () => {
  // G-3 step 1b (2026-10-09) replaced imageGenerateAction with an
  // approval record, so these tests moved off the descriptor. Testing
  // a function no card calls any more would have kept passing while
  // the real confirm text drifted - which is worse than no test.
  //
  // The figure and the wording are asserted at their real source now:
  // the row the chat tool writes, in tests/graphicApprovalRecord.test.ts,
  // and here against the pricing table itself.
  it("THE FIGURE IS THE REAL ONE, from the pricing table", () => {
    // $0.039 x 87. If the table moves, this moves with it rather than
    // showing a number somebody typed into a string once.
    expect(costOfGeminiImageInr(1)).toBeCloseTo(3.393, 3);
  });

  it("THE CONFIRM SAYS IT COSTS MONEY AND EATS THE ALLOWANCE", () => {
    // Read from the tool that writes it, so a reworded confirm fails
    // here rather than passing against a dead helper.
    // Scoped to the TOOL: `const confirmText` also appears in the
    // website card, earlier in the file, and indexOf found that one.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const tool = brain.slice(brain.indexOf('case "generate_graphic": {'), brain.indexOf('case "get_customer_sentiment"'));
    const at = tool.indexOf("const confirmText =");
    expect(at).toBeGreaterThan(-1);
    const confirm = tool.slice(at, at + 400);
    expect(confirm).toMatch(/makes one AI image now/);
    expect(confirm).toMatch(/costOfGeminiImageInr\(1\)\.toFixed\(2\)/);
    expect(confirm).toMatch(/monthly image allowance/);
  });

  it("why the product isn't in the picture rides along in it", () => {
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const tool = brain.slice(brain.indexOf('case "generate_graphic": {'), brain.indexOf('case "get_customer_sentiment"'));
    const at = tool.indexOf("const confirmText =");
    expect(tool.slice(at, at + 400)).toMatch(/depictionNote \? ` \$\{depictionNote\}`/);
  });

  it("AND THE QUOTE ITSELF SPENDS NOTHING", () => {
    // The whole point of the 8 October fix: the tool quotes, it does not
    // generate. Proved by execution in
    // tests/graphicApprovalRecord.test.ts; named here because this file
    // is where the cost story lives.
    const brain = code("src/lib/agents/masterBrainV2.ts");
    const tool = brain.slice(brain.indexOf('case "generate_graphic": {'), brain.indexOf('case "get_customer_sentiment"'));
    expect(tool).not.toMatch(/generateGraphic\(/);
    expect(tool).toMatch(/requestApproval\(/);
  });
});

