// What the card ACTUALLY becomes, for a real tool payload.
//
// Every previous test of this card read the source and asserted that
// certain lines appear in it. Four card bugs survived that: a field the
// renderer never reads (`url` on a record card), a test that required
// the bug to pass (`ai_generate`), a pinned JSX shape, and a pinned
// message string. Source-grepping cannot answer "what does this
// function return for this input" — which is the only question that
// matters here.
//
// So this runs it.

import { describe, it, expect } from "vitest";
import { extractArtifact } from "@/lib/agents/masterBrainV2";

/** A realistic success payload from launch_meta_campaign. */
const success = (over: Record<string, unknown> = {}) => ({
  success: true,
  already_pending: false,
  approval_id: "appr-1",
  action_id: "act-1",
  summary: 'Create a paused Meta campaign "Lavender Candle Sale" at ₹100.00/day.',
  headline: "Lavender Candle Sale",
  ad_copy: "Ghar ko banao ek calm sanctuary",
  image_url: "https://cdn.supabase/ad-creatives/d1/draft-1.png",
  photo_source: "hawlai_product",
  photo_product: "Lavender candle",
  photo_reason: null,
  audience: "Mumbai and nearby",
  daily_budget: "₹100.00",
  budget_raised: false,
  account_minimum: "₹94.91/day",
  destination: 'Your "Lavender candle" product page',
  objective: "Getting people to the page (traffic)",
  warnings: [],
  note: "Ready for your approval below.",
  ...over,
});

describe("the success card carries the picture", () => {
  it("sets imageUrl to the built creative", () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT ALL OF THIS. Not "the source
    // contains imageUrl:" — what the function actually returns.
    const card = extractArtifact("launch_meta_campaign", {}, success());
    expect(card).not.toBeNull();
    expect(card!.imageUrl).toBe("https://cdn.supabase/ad-creatives/d1/draft-1.png");
  });

  it("carries the approval so the buttons render", () => {
    const card = extractArtifact("launch_meta_campaign", {}, success());
    expect(card!.approval).toEqual({ id: "appr-1", publishActionId: "act-1" });
  });

  it("is a record card, which is the branch that draws the inline image", () => {
    expect(extractArtifact("launch_meta_campaign", {}, success())!.kind).toBe("record");
  });

  it("names the real listing in the Photo field", () => {
    const photo = extractArtifact("launch_meta_campaign", {}, success())!.fields!.find((f) => f.label === "Photo");
    expect(photo!.value).toMatch(/real photo from your "Lavender candle" listing/);
  });

  it("shows where the ad sends people and what it optimises for", () => {
    const fields = extractArtifact("launch_meta_campaign", {}, success())!.fields!;
    expect(fields.find((f) => f.label === "Sends people to")!.value).toMatch(/Lavender candle/);
    expect(fields.find((f) => f.label === "Optimising for")!.value).toMatch(/traffic/i);
  });
});

describe("the card is honest when there is no picture", () => {
  it("warns instead of claiming a photo when image_url is missing", () => {
    const card = extractArtifact("launch_meta_campaign", {}, success({ image_url: null }));
    const photo = card!.fields!.find((f) => f.label === "Photo");
    expect(card!.imageUrl).toBeUndefined();
    expect(photo!.value).toMatch(/don't approve this until you can see it/i);
  });

  it("treats an EMPTY STRING as no image, not as a picture", () => {
    // `""` is falsy, so `|| undefined` handles it — but asserting it
    // rather than trusting it, because an empty string reaching the
    // renderer would produce an <img src=""> that resolves to the page
    // itself and renders as a broken box.
    const card = extractArtifact("launch_meta_campaign", {}, success({ image_url: "" }));
    expect(card!.imageUrl).toBeUndefined();
    expect(card!.fields!.find((f) => f.label === "Photo")!.value).toMatch(/until you can see it/i);
  });
});

describe("the picker card, when the product is ambiguous", () => {
  const ambiguous = {
    needs_clarification: true,
    question: "Which product's photo should I use for this ad?",
    candidates: [
      { variant_id: "p1", title: "Lavender candle", variant: null, image_url: "https://cdn/1.jpg", has_photo: true },
      { variant_id: "p2", title: "Lavender candle large", variant: null, image_url: null, has_photo: false },
    ],
  };

  it("returns a picker, not a proposal — no approval buttons", () => {
    const card = extractArtifact("launch_meta_campaign", {}, ambiguous);
    expect(card!.approval).toBeUndefined();
    expect(card!.label).toMatch(/which product/i);
  });

  it("numbers the options and flags the one with no photo", () => {
    const items = extractArtifact("launch_meta_campaign", {}, ambiguous)!.groups![0].items;
    expect(items[0].label).toMatch(/^1\. Lavender candle/);
    expect(items[1].note).toMatch(/no photo/i);
  });
});

describe("an errored tool result produces no card at all", () => {
  it("returns null rather than a card claiming something happened", () => {
    expect(extractArtifact("launch_meta_campaign", {}, { error: "Facebook isn't connected yet." })).toBeNull();
  });
});

describe("a degraded creative still produces a card", () => {
  it("says the real photo was NOT used, and why", () => {
    // The failure mode this replaces: the photo step threw, the tool
    // returned { error }, extractArtifact returned null, and the
    // merchant saw NO CARD while the model narrated the campaign it
    // had planned as though it existed. A degraded card that explains
    // itself beats a confident sentence with nothing behind it.
    const card = extractArtifact("launch_meta_campaign", {}, {
      ...success({
        photo_source: "ai_generated",
        photo_reason: "couldn't use your product photo (the photo link returned 404), so I generated an image instead",
      }),
    });
    const photo = card!.fields!.find((f) => f.label === "Photo");
    expect(photo!.value).toMatch(/AI-generated image/);
    expect(photo!.value).toMatch(/404/);
    // Still a real card with the picture and the buttons.
    expect(card!.imageUrl).toBeTruthy();
    expect(card!.approval).toBeTruthy();
  });
});
