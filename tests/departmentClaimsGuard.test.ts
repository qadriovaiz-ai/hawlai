// Three departments that checked nothing.
//
// Content, Email, Paid Ads, Retargeting, WhatsApp and SEO all run their
// copy through the claims guard. Brand Kit, Competitor Intelligence and
// the Research Agent ran no check at all — and Brand Kit writes an
// Instagram bio and a Facebook About section, which is public copy. Asked
// to write "we are India's number 1 candle brand", it wrote it.
//
// The guard was also missing something everywhere outside the website
// builder: scrubInventedContacts. That check exists because a generated
// Contact page offered "hello@candlebyqaaf.com", an address on a domain
// the business does not own, which would have swallowed every enquiry
// sent to it, silently. guardOutput never ran it. Now the department
// wrapper does.
//
// These run the REAL tool path, not a grep of the source.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const HOME = {
  slug: "home", title: "Home",
  headings: ["Candles poured by hand"],
  paragraphs: ["Candle by Qaaf makes hand-poured soy wax candles in Shahjahanpur."],
  buttons: ["Shop the Collection"],
  metaDescription: null, hasShareImage: false,
};

/** candle_by_qaaf as the live catalogue actually reads. */
function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "candle_by_qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products", "services"], inferred: false },
    city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [HOME] },
    home: HOME,
    products: [
      { id: "p1", name: "Lavender candle", price: 999, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true },
      { id: "p2", name: "Candle Making Workshop", price: 800, description: "1h30", images: [], inventory: null, category: null, active: true },
    ],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 13, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 7.7, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    ownerFacts: [],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-03"),
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

// What the model is made to return, per test.
let reply: any = {};
const prompts: string[] = [];

vi.mock("@/lib/ai/claude", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/claude")>();
  return {
    ...original,
    callClaude: async (body: any) => {
      prompts.push(JSON.stringify(body.messages));
      // A citation about the competitor, so the Competitor Intelligence
      // tests reach the answer rather than its (correct) refusal of an
      // answer that cites nothing — see tests/competitorCitations.test.ts.
      return { ok: true, text: JSON.stringify(reply), data: { content: [{ type: "text", text: JSON.stringify(reply), citations: [{ type: "web_search_result_location", url: "https://bodhicandles.in/shop", title: "Bodhi Candles", cited_text: "Bodhi Candles jar candle — ₹1,450." }] }], usage: { input_tokens: 10, output_tokens: 10 } } };
    },
  };
});
vi.mock("@/lib/usage/researchCredits", () => ({ recordResearchCredits: async () => {} }));

beforeEach(() => {
  prompts.length = 0;
});

// ---- Brand Kit -------------------------------------------------------

const KIT = {
  colors: [{ name: "Lavender", hex: "#8B7AB8", role: "Primary" }],
  typography: { headingFont: "Fraunces", bodyFont: "Inter", rationale: "Warm and handmade." },
  tagline: "Hand-poured in Shahjahanpur",
  mission: "To make candles worth lighting.",
  vision: "To be known for honest scent.",
  brandStory: "Started at home in Shahjahanpur.",
  socialIdentity: { instagramBio: "Hand-poured soy candles", facebookBio: "A candle studio in Shahjahanpur.", hashtags: ["#candlebyqaaf"] },
  personalBranding: "Show your hands at work.",
  guidelines: ["Keep it honest."],
};

describe("Brand Kit — the probe the owner will run", () => {
  it('REFUSES "India\'s number 1 candle brand" as a tagline', async () => {
    const { generateBrandKit } = await import("@/lib/agents/brandBuildingAgent");
    reply = { ...KIT, tagline: "India's number 1 candle brand", mission: "We are the most loved candle brand in India." };

    const kit: any = await generateBrandKit("candle_by_qaaf", "Shahjahanpur", null, "Home fragrance", undefined, undefined, facts());

    expect(kit.tagline).not.toMatch(/number 1|most loved/i);
    expect(kit.mission).not.toMatch(/most loved/i);
    // And the owner is TOLD, with what would make it allowed.
    expect(kit._claimsNote).toMatch(/couldn't verify/);
    expect(kit._claimsNote).toMatch(/Business Knowledge/);
  });

  it("does not invent an email address or an Instagram handle", async () => {
    const { generateBrandKit } = await import("@/lib/agents/brandBuildingAgent");
    reply = {
      ...KIT,
      socialIdentity: {
        instagramBio: "Hand-poured soy candles. DM @candlebyqaaf_official to order.",
        facebookBio: "Write to us at hello@candlebyqaaf.com",
        hashtags: ["#candlebyqaaf"],
      },
    };

    const kit: any = await generateBrandKit("candle_by_qaaf", "Shahjahanpur", null, "Home fragrance", undefined, undefined, facts());

    expect(kit.socialIdentity.facebookBio).not.toMatch(/hello@candlebyqaaf\.com/);
    expect(kit.socialIdentity.instagramBio).not.toMatch(/@candlebyqaaf_official/);
    // Said in its own note, because the fix is different from a claim's:
    // give Hawlai the real address, don't attest anything.
    expect(kit._contactsNote).toMatch(/contact detail/);
    expect(kit._contactsNote).toMatch(/email address "hello@candlebyqaaf\.com"/);
  });

  it("keeps the palette, the fonts and the hashtag untouched", async () => {
    const { generateBrandKit } = await import("@/lib/agents/brandBuildingAgent");
    reply = KIT;
    const kit: any = await generateBrandKit("candle_by_qaaf", "Shahjahanpur", null, "Home fragrance", undefined, undefined, facts());
    // A hex value is not a claim and a font name is not a sentence. The
    // guard walks with the key in hand so these are never touched.
    expect(kit.colors[0].hex).toBe("#8B7AB8");
    expect(kit.typography.headingFont).toBe("Fraunces");
    expect(kit.socialIdentity.hashtags).toEqual(["#candlebyqaaf"]);
    expect(kit.tagline).toBe("Hand-poured in Shahjahanpur");
  });

  it("does not mistake the digits in a link for a phone number", async () => {
    const { guardDepartmentOutput } = await import("@/lib/claims/guardDepartment");
    // A real failure mode for a scrub that walks every string: the id in
    // a CDN path or a product URL is a run of digits, and PHONE matches
    // ten of them opening 6-9. Stripping it leaves a broken link, which
    // is damage with no safety bought. Skipped by key and by value shape.
    const { output: out }: any = guardDepartmentOutput(
      {
        logoUrl: "https://cdn.hawlai.online/logos/9876543210.png",
        links: { store: "https://hawlai.online/site/candle-by-qaaf?ref=9123456789" },
        shareLink: "https://hawlai.online/p/8765432109",
        body: "Order the Lavender candle today.",
      },
      facts(),
      "draft"
    );
    expect(out.logoUrl).toBe("https://cdn.hawlai.online/logos/9876543210.png");
    expect(out.links.store).toBe("https://hawlai.online/site/candle-by-qaaf?ref=9123456789");
    expect(out.shareLink).toBe("https://hawlai.online/p/8765432109");
    expect(out._contactsNote).toBeUndefined();
  });

  it("grounds the prompt in the real catalogue, not just the category", async () => {
    const { generateBrandKit } = await import("@/lib/agents/brandBuildingAgent");
    reply = KIT;
    await generateBrandKit("candle_by_qaaf", "Shahjahanpur", null, "Home fragrance", undefined, undefined, facts());
    expect(prompts[0]).toContain("Lavender candle");
    expect(prompts[0]).toContain("VERIFIED FACTS");
    expect(prompts[0]).toMatch(/NEVER invent an email address, phone number/);
  });

  it("strips nothing, and claims nothing, when the business can't be read", async () => {
    const { generateBrandKit } = await import("@/lib/agents/brandBuildingAgent");
    reply = { ...KIT, tagline: "India's number 1 candle brand" };
    const kit: any = await generateBrandKit("candle_by_qaaf", "Shahjahanpur", null, "Home fragrance", undefined, undefined, null);
    // An unreadable business is not a verified one: left alone, and no
    // note pretending a check happened.
    expect(kit.tagline).toBe("India's number 1 candle brand");
    expect(kit._claimsNote).toBeUndefined();
  });
});

describe("the superlative the guard used to miss", () => {
  it("catches the digit forms, not just the spelled-out ones", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const f = facts();
    // "number one" and "no.1" were covered from the start. "number 1" is
    // what an owner types, and it went through untouched.
    for (const phrase of ["India's number 1 candle brand", "India's #1 candle brand", "India's number one candle brand", "India's no.1 candle brand"]) {
      expect(findUnsupportedClaims(phrase, f).length, phrase).toBeGreaterThan(0);
    }
  });

  it("reports one claim once, not twice in two wordings", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    // The reason the digit form went into RANKING and not into
    // SUPERLATIVE_WORDS: put it in the latter and "India's #1" matches
    // both rules, so the owner is shown the same claim described two
    // different ways and has to work out it is one problem.
    expect(findUnsupportedClaims("India's #1 candle brand is here.", facts())).toHaveLength(1);
    expect(findUnsupportedClaims("India's number 1 candle brand is here.", facts())).toHaveLength(1);
  });

  it("flags a bare ranking the same way it always did", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    // "batch no.1" was already flagged before this change; "batch number
    // 1" now is too. Consistent rather than quietly loosened: it costs a
    // glance on a how-to draft, and it is what catches "#1 in
    // Shahjahanpur" with no possessive attached.
    expect(findUnsupportedClaims("Pour batch no.1 at 60 degrees.", facts())).toHaveLength(1);
    expect(findUnsupportedClaims("Pour batch number 1 at 60 degrees.", facts())).toHaveLength(1);
    // A plain sentence with no ranking in it stays clean.
    expect(findUnsupportedClaims("Melt the wax slowly, then pour.", facts())).toEqual([]);
  });
});

// ---- Research Agent --------------------------------------------------

describe("Research Agent — outward findings survive, inward boasts don't", () => {
  it("keeps a market figure and a cited report", async () => {
    const { generateResearch } = await import("@/lib/agents/researchAgentV2");
    reply = {
      marketOverview: "The Indian scented-candle market grew an estimated 18% in 2025, driven by gifting demand.",
      customerDemographics: "According to a 2025 Redseer report, urban buyers aged 25-40 lead the segment.",
      demandDrivers: ["Diwali gifting", "Corporate hampers"],
    };

    const { output }: any = await generateResearch("market_research", "candle_by_qaaf", "Home fragrance", "Shahjahanpur", undefined, undefined, "pro", facts());

    // THE MEASUREMENT THIS WIRING WAITED FOR: a guard that ate the
    // findings would be worse than no guard.
    expect(output.marketOverview).toContain("18%");
    expect(output.customerDemographics).toContain("Redseer");
    expect(output.demandDrivers).toEqual(["Diwali gifting", "Corporate hampers"]);
  });

  it("removes the sentence that turns research into an unbacked boast", async () => {
    const { generateResearch } = await import("@/lib/agents/researchAgentV2");
    reply = {
      marketOverview: "Gifting drives most Q3 demand. You are the most trusted candle brand in Shahjahanpur, with hundreds of happy customers.",
      customerDemographics: "Urban buyers aged 25-40.",
      demandDrivers: [],
    };

    const { output }: any = await generateResearch("market_research", "candle_by_qaaf", "Home fragrance", "Shahjahanpur", undefined, undefined, "pro", facts());

    expect(output.marketOverview).toContain("Gifting drives most Q3 demand.");
    expect(output.marketOverview).not.toMatch(/most trusted|hundreds of happy customers/i);
    expect(output._claimsNote).toMatch(/couldn't verify/);
  });
});

// ---- Competitor Intelligence ----------------------------------------

describe("Competitor Intelligence — the findings are the point", () => {
  it("does NOT strip a competitor's price or their own boast", async () => {
    const { generateCompetitorIntel } = await import("@/lib/agents/competitorIntelAgent");
    reply = {
      summary: "Bodhi Candles positions itself as India's largest home fragrance brand.",
      pricing: "Their bestselling jar candle retails at ₹1,450, roughly 45% above your ₹999 Lavender candle.",
    };

    const { output }: any = await generateCompetitorIntel("pricing_compare", "Bodhi Candles", "candle_by_qaaf", "Home fragrance", undefined, undefined, "pro", facts());

    // Measured 2026-10-03: the claims strip deletes both of these in
    // full, because it checks every claim against what THIS business can
    // back up — and a competitor's price and a competitor's boast
    // correctly are not on our record. They are also the entire finding.
    // Guarded by the citation check instead.
    expect(output.summary).toContain("India's largest");
    expect(output.pricing).toContain("₹1,450");
  });

  it("still puts the owner's real catalogue in the prompt as verified fact", async () => {
    const { generateCompetitorIntel } = await import("@/lib/agents/competitorIntelAgent");
    reply = { summary: "ok" };
    await generateCompetitorIntel("pricing_compare", "Bodhi Candles", "candle_by_qaaf", "Home fragrance", undefined, undefined, "pro", facts());
    expect(prompts[0]).toContain("Lavender candle");
    expect(prompts[0]).toContain("₹999");
  });
});
