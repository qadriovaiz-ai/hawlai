// A stranger's hospital waiting room, one generate from an Instagram ad.
//
// Candle by Qaaf's Business Story includes a real customer writing that
// her husband had been in an accident and she lit one of these candles
// through the hours of waiting at the hospital. The owner wrote it down
// because it moved her. It is the most powerful thing in the file and it
// is not hers to publish.
//
// formatFactsForCopy puts the Business Story into the prompt IN FULL,
// never truncated, under "use these specifics; they are what makes this
// business different" — and that block reaches Content, Email, Paid Ads,
// Retargeting, WhatsApp, the SEO and AEO toolkits, Brand Kit, Research
// and, since 01d6a44, the website builder. An AEO recommendation had
// already pointed at this story as "genuine content" worth showing
// people.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import { withheldFromCopy, splitStories } from "@/lib/claims/personalStories";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

/** The row as it sits in business_knowledge, in the owner's own words. */
const HOSPITAL = {
  category: "business_story",
  title: "Why I keep making these",
  content:
    "Ek customer ne mujhe likha ki unke husband ka accident ho gaya tha, aur hospital mein intezaar ki raat mein unhone meri lavender candle jalayi. Usne kaha ki us khushboo ne usse sambhala.",
};

const OWN_CRAFT = { category: "business_story", title: "How", content: "Hand-poured in small batches. Paraffin-free, soy wax only." };
const ORDINARY_CUSTOMER = { category: "business_story", title: "Diwali", content: "Ek customer ne Diwali ke liye chhe candles order ki thi — sab gift ke liye." };
const OWNERS_OWN = { category: "business_story", title: "Why I started", content: "After my own surgery I could not sleep, and the smell of lavender was the only thing that helped." };

function facts(story: any[]): BusinessFacts {
  const home = { slug: "home", pageType: "home", title: "Home", headings: [], paragraphs: [], buttons: [], metaDescription: null, hasShareImage: false } as any;
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [home] }, home,
    products: [{ id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [], shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 46, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 2.1, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: story as any,
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-04"), unreadable: [],
  } as BusinessFacts;
}

describe("what counts as somebody else's private situation", () => {
  it("withholds the hospital story", () => {
    const reason = withheldFromCopy(HOSPITAL);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/only you can say whether they agreed/);
  });

  it("withholds the same story told in English", () => {
    expect(
      withheldFromCopy({
        category: "business_story",
        title: "A message I got",
        content: "A customer wrote to say her husband had been in an accident, and she burned our candle in the hospital waiting room all night.",
      })
    ).toBeTruthy();
  });

  it("leaves the owner's own hard story alone — it is hers to tell", () => {
    // Withholding this would be the product deciding what she may say
    // about her own life.
    expect(withheldFromCopy(OWNERS_OWN)).toBeNull();
  });

  it("leaves an ordinary customer fact alone", () => {
    // "A customer ordered six for Diwali" is a fact about the business.
    // Withholding every mention of a customer would gut a small
    // business's story, which is why BOTH halves are required.
    expect(withheldFromCopy(ORDINARY_CUSTOMER)).toBeNull();
    expect(withheldFromCopy({ category: "business_story", title: "Feedback", content: "One lady said she loved the lavender one." })).toBeNull();
  });

  it("leaves the craft story alone", () => {
    expect(withheldFromCopy(OWN_CRAFT)).toBeNull();
  });

  it("covers bereavement, illness and crisis, not just accidents", () => {
    for (const content of [
      "A customer told me her mother had passed away and she lit this at the funeral.",
      "One client said she was going through chemo and the smell helped.",
      "A customer wrote that her divorce was finalised that week.",
      "Ek customer ne kaha uske papa aspataal mein the.",
    ]) {
      expect(withheldFromCopy({ category: "business_story", title: "A message", content }), content).toBeTruthy();
    }
  });
});

describe("what the generators are handed", () => {
  it("keeps the hospital story out of the prompt entirely", async () => {
    const { formatFactsForCopy } = await import("@/lib/claims/businessFacts");
    const prompt = formatFactsForCopy(facts([OWN_CRAFT, HOSPITAL]));
    // The story's own words, not the word "accident" — the withheld
    // note itself says "an accident or similar" while naming nothing.
    expect(prompt).not.toContain("accident ho gaya");
    expect(prompt).not.toContain("hospital mein");
    expect(prompt).not.toContain("intezaar");
    expect(prompt).not.toContain(HOSPITAL.content.slice(0, 40));
    // And the craft story is still there, which is the point of not
    // withholding the whole file.
    expect(prompt).toContain("Hand-poured in small batches");
  });

  it("says the material exists and must not be substituted for", async () => {
    const { formatFactsForCopy } = await import("@/lib/claims/businessFacts");
    const prompt = formatFactsForCopy(facts([OWN_CRAFT, HOSPITAL]));
    // SILENTLY DROPPING IT IS NOT ENOUGH. A model that cannot see a
    // story will sometimes invent one to fill the same gap, and an
    // invented customer anecdote is a fabricated testimonial.
    expect(prompt).toMatch(/WITHHELD FROM YOU ON PURPOSE/);
    expect(prompt).toMatch(/must NOT invent a substitute anecdote/);
    expect(prompt).toMatch(/fabricated testimonial/);
    // And what to do if the owner asks for it.
    expect(prompt).toMatch(/confirm she has that customer's permission first/);
  });

  it("says nothing when there is nothing withheld", async () => {
    const { formatFactsForCopy } = await import("@/lib/claims/businessFacts");
    const prompt = formatFactsForCopy(facts([OWN_CRAFT, ORDINARY_CUSTOMER]));
    expect(prompt).not.toMatch(/WITHHELD FROM YOU ON PURPOSE/);
    expect(prompt).toContain("Diwali ke liye chhe candles");
  });

  it("reaches every surface, because they all read the same block", () => {
    // Not one gate per generator: factsPrompt is formatFactsForCopy plus
    // the truth rules, and these are its callers.
    for (const file of [
      "src/lib/agents/contentMarketingAgent.ts",
      "src/lib/agents/emailMarketingAgent.ts",
      "src/lib/agents/paidAdsAgent.ts",
      "src/lib/agents/whatsappMarketingAgent.ts",
      "src/lib/agents/websiteBuilderAgent.ts",
      "src/lib/agents/brandBuildingAgent.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/factsPrompt|formatFactsForCopy/);
    }
  });
});

describe("the row itself is untouched", () => {
  it("withholds without rewriting, hiding or deleting anything", () => {
    const before = JSON.stringify([OWN_CRAFT, HOSPITAL]);
    const split = splitStories([OWN_CRAFT, HOSPITAL]);
    // The owner still has her story, word for word, wherever she reads
    // her own Business Knowledge.
    expect(JSON.stringify([OWN_CRAFT, HOSPITAL])).toBe(before);
    expect(split.withheld[0].fact.content).toBe(HOSPITAL.content);
  });

  it("and it still counts as evidence for the facts inside it", async () => {
    const { knownText } = await import("@/lib/claims/businessFacts");
    // If she has written that her candles are lavender inside that same
    // paragraph, that fact is still hers and still counts. What stops is
    // repeating somebody's grief to sell a candle.
    expect(knownText(facts([HOSPITAL]))).toContain("lavender");
  });
});

// ---- the second path, which is the one the AEO answer came down -----

describe("the chat's own grounding block is gated too", () => {
  it("filters the knowledge facts it sends into every prompt", () => {
    // THIS WAS A SEPARATE LEAK. businessFactsSection is built from every
    // knowledge row and goes into groundingContext, which reaches the
    // chat's own replies and every generator — bypassing
    // formatFactsForCopy and its gate completely. Two routes, one story.
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/const \{ usable: usableFacts, withheld: withheldFacts \} = splitStories\(ctx\.knowledgeFacts as any\)/);
    expect(brain).toMatch(/\$\{usableFacts\.map/);
    // It used to map ctx.knowledgeFacts straight in.
    expect(brain).not.toMatch(/\$\{ctx\.knowledgeFacts\.map\(\(f\) => `- \$\{f\.title\}/);
    // And says what it withheld rather than going quiet.
    // toContain rather than a regex: an escaped newline in a regex
    // literal is a real newline, while the source holds two characters.
    expect(brain).toContain("withheldNote(withheldFacts)");
  });
});
