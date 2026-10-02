// The claims check on SEO copy, and whose words it may touch.
//
// SEO was the one copy surface that never ran the guard — Content,
// Email, Paid Ads, Retargeting and WhatsApp all did. So chat could
// propose "No paraffin, no fake fragrance" as the meta description of a
// business whose Business Story says nothing of the kind, and the line
// would have gone to the front page of Google.
//
// Decision C, and it is the point of this file: the guard governs what
// HAWLAI writes. Wording the owner typed themselves is theirs — kept
// exactly, with a warning on the card instead of an edit.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import type { BusinessFacts } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

process.env.MARKETING_ENCRYPTION_KEY = process.env.MARKETING_ENCRYPTION_KEY ?? "a".repeat(64);

const created: any[] = [];
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/publish/create", () => ({
  createPublishAction: async (_s: any, _p: any, input: any) => {
    created.push(input);
    return { ok: true, actionId: "a1", approvalId: "ap1", preview: { summary: "", changes: [], warnings: [] } };
  },
}));

const HOME = {
  slug: "home",
  title: "Home",
  headings: ["Candles poured by hand"],
  paragraphs: ["Candle by Qaaf makes hand-poured soy wax candles."],
  buttons: ["Shop the Collection"],
  metaDescription: null,
  hasShareImage: false,
};

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "candle_by_qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [HOME] },
    home: HOME,
    products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Hand-poured soy wax", images: [], inventory: null, category: null, active: true }],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 13, chatOpens: 0, leads: 0, orders: 1, abandonedCarts: 0, conversionRate: 7.7, cartAbandonmentRate: null },
    allTime: { paidOrders: 1, leads: 0 },
    // On record, so "hand-poured in small batches" is backed and the only
    // thing left to strip is the superlative this file is about. Without
    // it the whole description goes and the tool refuses, which is
    // correct behaviour and a different test.
    ownerFacts: [{ category: "business_story", title: "How our candles are made", content: "Hand-poured soy wax in small batches." } as any],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-09-29"),
    unreadable: [],
    ...over,
  } as BusinessFacts;
}

vi.mock("@/lib/claims/businessFacts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/claims/businessFacts")>();
  return { ...original, gatherBusinessFactsSafely: async () => facts() };
});

import { executeTool, TOOLS } from "@/lib/agents/masterBrainV2";

const CTX: any = { id: "d1", name: "Candle by Qaaf", city: "Shahjahanpur", category: "candles", team: [], toneOfVoice: null };

function db() {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        limit: async () => ({ data: [] }),
        order: async () => ({ data: [{ id: "p1", slug: "home", title: "Home" }] }),
        maybeSingle: async () => ({ data: table === "websites" ? { id: "w1", slug: "candle-by-qaaf", published: true } : null }),
      };
      return chain;
    },
  };
}

// "best in India" is unsupported under every fixture — a superlative
// about ranking, which no Business Story can make true.
// Two sentences on purpose: the guard removes the SENTENCE carrying an
// unsupported claim, so a one-sentence fixture would leave nothing and
// exercise the refusal branch instead of the strip.
const HAWLAI_WROTE = "Hand-poured soy candles from Shahjahanpur, in small batches. The best candles in India.";
const OWNER_WROTE = "Hand-poured soy candles made by hand in Shahjahanpur. The best candles in India. Shop now.";

describe("what Hawlai writes goes through the claims check", () => {
  it("strips an unsupported claim from a description Hawlai wrote", async () => {
    created.length = 0;
    const result = await executeTool(db(), CTX, "propose_page_meta", { metaDescription: HAWLAI_WROTE }, "");
    expect(result.success).toBe(true);
    const sent = created[0].requestedChanges.metaDescription;
    expect(sent).not.toMatch(/best candles in India/i);
    expect(created[0].requestedChanges.claimWarnings.join(" ")).toMatch(/Business Story doesn't support it/);
  });

  it("refuses rather than proposing an empty description when it was all claim", async () => {
    const result = await executeTool(db(), CTX, "propose_page_meta", { metaDescription: "The best candles in India." }, "");
    expect(result.success).toBeUndefined();
    expect(result.error).toMatch(/can't back up/);
    // And it says nothing was stored, per 49a5a79.
    expect(result.saved).toBe(false);
  });
});

describe("what the OWNER writes is kept exactly, and warned about", () => {
  it("saves their wording character for character, claim and all", async () => {
    created.length = 0;
    const result = await executeTool(
      db(), CTX, "propose_page_meta",
      { metaDescription: OWNER_WROTE, writtenByOwner: ["metaDescription"] },
      ""
    );
    expect(result.success).toBe(true);
    // Not edited. Not shortened. Theirs.
    expect(created[0].requestedChanges.metaDescription).toBe(OWNER_WROTE);
  });

  it("still tells them which part their Business Story doesn't back up", async () => {
    created.length = 0;
    await executeTool(db(), CTX, "propose_page_meta", { metaDescription: OWNER_WROTE, writtenByOwner: ["metaDescription"] }, "");
    const warnings = created[0].requestedChanges.claimWarnings.join(" ");
    expect(warnings).toMatch(/saved exactly as you wrote it/i);
    expect(warnings).toMatch(/you're the one standing behind that claim/i);
    expect(warnings).not.toMatch(/Taken out of/);
  });

  it("carries those warnings onto the approval card", () => {
    const platform = readFileSync("src/lib/publish/platforms/hawlaiSite.ts", "utf8");
    expect(platform).toContain("action.requestedChanges.claimWarnings");
  });
});

describe("the tool and the toolkit are wired for it", () => {
  it("tells the model which fields are the owner's own", () => {
    const tool: any = TOOLS.find((t: any) => t.name === "propose_page_meta");
    expect(tool.input_schema.properties.writtenByOwner).toBeTruthy();
    expect(tool.input_schema.properties.writtenByOwner.description).toMatch(/Anything you wrote yourself must NOT be listed here/);
    // And the length rule the health check enforces.
    expect(tool.input_schema.properties.metaDescription.description).toMatch(/WITHIN 160 characters/);
  });

  it("shows the character count on the card", () => {
    const brain = readFileSync("src/lib/agents/masterBrainV2.ts", "utf8");
    expect(brain).toMatch(/Description \$\{safeDescription\.length\}\/160/);
    expect(brain).toMatch(/label: "Length"/);
  });

  it("runs the guard in the SEO toolkit generator too, in draft mode", () => {
    const agent = readFileSync("src/lib/agents/seoToolkitAgent.ts", "utf8");
    expect(agent).toMatch(/guardGenerated\(generated, facts, "draft"\)/);
    // And the owner's words are restored AFTER the guard, never stripped.
    expect(agent.indexOf("guardGenerated(generated")).toBeLessThan(agent.indexOf("keepOwnerWords(taskKey, guarded.output"));
  });
});

describe("the materials terms are enabled", () => {
  it("every approved term is live in CLAIM_TERMS", async () => {
    // Approved 2026-10-02 after the dry run. Enabling them changes what
    // EVERY guarded surface may say — content, email, paid ads,
    // retargeting, WhatsApp — not just SEO, which is why it waited.
    const { PROPOSED_MATERIAL_TERMS } = await import("../scripts/materialClaimsDryRun.mjs");
    const guard = readFileSync("src/lib/claims/claimCheck.ts", "utf8");
    const live = guard.slice(guard.indexOf("const CLAIM_TERMS"), guard.indexOf("];", guard.indexOf("const CLAIM_TERMS")));
    const missing = PROPOSED_MATERIAL_TERMS
      // The bare noun was dropped on review: "no paraffin" and
      // "paraffin free" are claims, "paraffin" on its own is a material
      // being discussed, and gating it flagged a content idea about why
      // paraffin was rejected.
      .filter((term: string) => term !== "paraffin" && !term.includes(","))
      .filter((term: string) => !live.includes(`"${term}"`));
    expect(missing).toEqual([]);
    expect(live).not.toMatch(/"paraffin",/);
  });

  it("the dry run flags a term the business never says, and spares one it does", async () => {
    const { wouldFlag } = await import("../scripts/materialClaimsDryRun.mjs");
    // The live site says "No paraffin. No synthetic shortcuts." — so
    // "no paraffin" is backed by the business's own copy, and "no fake
    // fragrance" is a rewording that appears nowhere.
    const known = "No paraffin. No synthetic shortcuts. Just clean-burning candles.";
    expect(wouldFlag("No paraffin, no fake fragrance.", known)).toEqual(["no fake fragrance"]);
    expect(wouldFlag("No paraffin here.", known)).toEqual([]);
  });
});

describe("one fact, however it is worded", () => {
  it("accepts paraffin-free as having said no paraffin", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const recorded = facts({ ownerFacts: [{ category: "business_story", title: "Materials", content: "Paraffin-free. Soy wax only." } as any] });
    // The owner said it once, in their own words. Asking them to attest
    // the same fact again in a different spelling is the software
    // failing to understand its own question.
    expect(findUnsupportedClaims("No paraffin in any of our candles.", recorded)).toEqual([]);
    expect(findUnsupportedClaims("Paraffin-free soy wax.", recorded)).toEqual([]);
  });

  it("accepts hand-poured as having said handmade and handcrafted", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const recorded = facts({ ownerFacts: [{ category: "business_story", title: "How", content: "Hand-poured in small batches." } as any] });
    expect(findUnsupportedClaims("Handmade candles.", recorded)).toEqual([]);
    expect(findUnsupportedClaims("Handcrafted in Shahjahanpur.", recorded)).toEqual([]);
  });

  it("does NOT let a narrow claim license a broad one", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const recorded = facts({ ownerFacts: [{ category: "business_story", title: "Fragrance", content: "Natural fragrance oils." } as any] });
    // "All natural" is a claim about the whole product, not the scent.
    expect(findUnsupportedClaims("All natural candles.", recorded).length).toBeGreaterThan(0);
  });

  it("still flags a material nobody has mentioned", async () => {
    const { findUnsupportedClaims } = await import("@/lib/claims/claimCheck");
    const recorded = facts({ ownerFacts: [{ category: "business_story", title: "Materials", content: "Paraffin-free." } as any] });
    expect(findUnsupportedClaims("Lead-free cotton wicks.", recorded).length).toBeGreaterThan(0);
  });
});
