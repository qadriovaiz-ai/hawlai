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
import { imageGenerateAction } from "@/lib/chat/publishActions";
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

describe("the price is on the button", () => {
  it("THE FIGURE IS THE REAL ONE, from the pricing table", () => {
    // $0.039 x 87. If the table moves, this moves with it rather than
    // showing a number somebody typed into a string once.
    expect(costOfGeminiImageInr(1)).toBeCloseTo(3.393, 3);
    const a = imageGenerateAction({ designType: "poster", prompt: "Christmas poster", costInr: costOfGeminiImageInr(1) });
    expect(a.label).toBe("Generate the image (about ₹3.39)");
  });

  it("the confirmation says it costs money AND that it eats the monthly allowance", () => {
    const a = imageGenerateAction({ designType: "poster", prompt: "x", costInr: 3.393 });
    expect(a.confirm).toMatch(/makes one AI image now/);
    expect(a.confirm).toMatch(/about ₹3\.39/);
    expect(a.confirm).toMatch(/monthly image allowance/);
  });

  it("THE BUTTON CALLS THE PAGE'S OWN ENDPOINT, which runs the cap again", () => {
    // A quote that spent money on its own, or through a chat-only path
    // that skipped the plan cap, would just move the problem.
    const a = imageGenerateAction({ designType: "poster", prompt: "Christmas poster", costInr: 3.393 });
    expect(a.endpoint).toBe("/api/graphic-design/generate");
    expect(a.method).toBe("POST");
    expect(a.payload).toEqual({ designType: "poster", prompt: "Christmas poster" });
    expect(a.target).toBe("image");
  });

  it("why the product isn't in the picture rides along in the confirmation", () => {
    const a = imageGenerateAction({
      designType: "poster",
      prompt: "x",
      costInr: 3.393,
      depictionNote: "There's no photo of \"Lavender Soy Wax Candle\" on file, so I haven't drawn it.",
    });
    expect(a.confirm).toMatch(/haven't drawn it/);
  });
});
