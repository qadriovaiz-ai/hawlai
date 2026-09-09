// Does the ad approval card actually reach the layout that draws it?
//
// FIVE ROUNDS OF DIAGNOSIS WENT PAST THIS. MasterChatPage contained an
// <img> for artifact.imageUrl — every source-reading test confirmed it,
// correctly. But an early return above it, `kind === "record" &&
// summary`, sent every record card with a summary to a compact layout
// with no fields and no image. The ad card is exactly that shape, so
// the <img> was present in the file and unreachable from the card.
//
// The approvalStrip rendered in that branch too, which is why the
// buttons appeared and the card looked finished.
//
// This is the test that answers the question grepping could not: given
// THIS artifact, which layout does it get?

import { describe, it, expect } from "vitest";
import { isSimpleConfirmation } from "@/lib/chat/cardLayout";
import { extractArtifact } from "@/lib/agents/masterBrainV2";

const adResult = {
  success: true,
  approval_id: "appr-1",
  action_id: "act-1",
  summary: 'Create a paused Meta campaign "Lavender Candle Sale" at ₹100.00/day.',
  headline: "Lavender Candle Sale",
  ad_copy: "Ghar ko banao ek calm sanctuary",
  image_url: "https://cdn.supabase/ad-creatives/d1/draft-1.png",
  photo_source: "hawlai_product",
  photo_product: "Lavender candle",
  audience: "Mumbai and nearby",
  daily_budget: "₹100.00",
  destination: 'Your "Lavender candle" product page',
  objective: "Getting people to the page (traffic)",
  warnings: [],
  note: "Ready for your approval below.",
};

describe("the real ad card gets the layout that can draw it", () => {
  it("is NOT treated as a simple confirmation", () => {
    // THE ONE THAT WOULD HAVE CAUGHT IT. Built from the real payload,
    // through the real card builder, then asked the real routing
    // question.
    const card = extractArtifact("launch_meta_campaign", {}, adResult)!;
    expect(card.imageUrl).toBeTruthy();
    expect(isSimpleConfirmation(card as any)).toBe(false);
  });

  it("the price-change approval card is not either", () => {
    // Same shape, same bug — its fields were never shown, only its
    // summary sentence and the buttons.
    const card = extractArtifact("propose_price_change", {}, {
      success: true,
      approval_id: "a1",
      action_id: "x1",
      summary: "Change the price of Blue Kurta.",
      product: "Blue Kurta",
      current_price: "₹1,299",
      new_price: "₹999",
      store_currency: "INR (₹)",
      warnings: [],
      note: "Ready for your approval below.",
    })!;
    expect(isSimpleConfirmation(card as any)).toBe(false);
  });

  it("the product picker is not either — its options must be visible", () => {
    const card = extractArtifact("launch_meta_campaign", {}, {
      needs_clarification: true,
      question: "Which product's photo should I use for this ad?",
      candidates: [{ variant_id: "p1", title: "Lavender candle", variant: null, image_url: "https://cdn/1.jpg", has_photo: true }],
    })!;
    expect(isSimpleConfirmation(card as any)).toBe(false);
  });
});

describe("the compact layout survives for what it was built for", () => {
  it("a plain confirmation sentence still gets it", () => {
    // "Added to your Products tab" reads better as one sentence than an
    // icon box with a label and an empty fields list. Fixing the ad
    // card must not flatten every confirmation into the heavy layout.
    expect(isSimpleConfirmation({ kind: "record", summary: '"Lavender candle" added to the Products tab.' })).toBe(true);
  });

  it.each([
    ["an image", { imageUrl: "https://cdn/x.png" }],
    ["an approval", { approval: { id: "a1" } }],
    ["fields", { fields: [{ label: "Price", value: "₹999" }] }],
    ["groups", { groups: [{ heading: "2 matches", items: [] }] }],
  ])("loses the compact layout as soon as it carries %s", (_label, extra) => {
    expect(isSimpleConfirmation({ kind: "record", summary: "Something happened.", ...extra })).toBe(false);
  });

  it("never applies to a non-record kind, or to a card with no summary", () => {
    expect(isSimpleConfirmation({ kind: "link", summary: "x" })).toBe(false);
    expect(isSimpleConfirmation({ kind: "record", summary: "" })).toBe(false);
    expect(isSimpleConfirmation({ kind: "record" })).toBe(false);
  });

  it("treats an empty fields array as still simple", () => {
    // An empty array is not "has fields" — otherwise every confirmation
    // that happens to build an empty list loses the compact layout.
    expect(isSimpleConfirmation({ kind: "record", summary: "Done.", fields: [] })).toBe(true);
  });
});
