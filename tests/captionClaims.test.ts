// THE CAPTION THAT WENT LIVE ON A REAL FACEBOOK PAGE, 8 October 2026.
//
// Five sentences, every one of them unbacked, and the claims guard
// flagged nothing. These are the sentences verbatim, as they appeared on
// the Page — not paraphrases, because a paraphrase is a test of the
// paraphrase.
//
// WHAT WAS NOT WRONG: the wiring. The chat's generate_content tool calls
// the same generateContent() the Content department calls, with the same
// guardGenerated() inside it, and `draft` mode strips claim problems
// exactly as `publish` does (it only spares PRICE-only sentences). The
// guard ran on every one of these sentences and had nothing to say.
//
// What was wrong, sentence by sentence:
//
//   1. COMPARATIVE and PRODUCT_COMPARATIVE both need a comparative
//      ADJECTIVE, and COMPARATIVE also needs the word "than". "carries
//      fragrance differently from paraffin" has neither, while naming
//      the rival outright.
//   2. Nothing looked for a comparison made by negation — "without the
//      sharp synthetic hit" asserts the fault belongs to the others.
//   3. CLAIM_TERMS held "clean burning" and "soot free"; the model wrote
//      "burns clean" and "no soot". One phrasing per claim catches only
//      the drafts that happen to agree with the list.
//   4. Nothing treated "exact" as a measurement claim.
//   5. Not a claims problem at all: platformRules knew that links do not
//      work on Instagram and nothing about "link in bio" being written
//      where they do.

import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function db() {
  const from = (table: string) => {
    const api: any = {
      select: () => api, eq: () => api, gte: () => api, lt: () => api, order: () => api, limit: () => api,
      not: () => api, is: () => api, in: () => api, ilike: () => api,
      insert: () => api, update: () => api,
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

import { gatherBusinessFacts } from "@/lib/claims/businessFacts";
import { findUnsupportedClaims, stripUnsupported } from "@/lib/claims/claimCheck";
import { fixLinkInBio, applyBioRule, bioRuleNote, linksWork } from "@/lib/content/platformRules";

// ---------------------------------------------------------------------
// The five sentences, verbatim.
// ---------------------------------------------------------------------

const S1 = "Soy wax carries fragrance differently from paraffin.";
const S2 =
  "It releases slowly, evenly, and without the sharp synthetic hit that fades almost as quickly as it arrives.";
const S3 = "The candle burns clean, with no soot collecting at the rim.";
const S4 = "The wick is set at the exact centre, by hand.";
const S5 = "Link in bio.";
const LIVE_CAPTION = [S1, S2, S3, S4, S5].join(" ");

/** candle_by_qaaf as its records actually stood. */
beforeEach(() => {
  tables = {
    dealerships: [{ id: "d1", dealership_name: "candle_by_qaaf", business_category: "Home fragrance", city: "Lucknow" }],
    websites: [{ id: "w1", slug: "candle-by-qaaf", published: true, shipping_mode: "flat", shipping_rate: 60 }],
    website_pages: [],
    products: [{ name: "Lavender Soy Wax Candle", price: 550, description: "Hand-poured soy wax" }],
    discount_codes: [], orders: [], leads: [], page_events: [], abandoned_carts: [],
    // The Business Story says paraffin SMOKES MORE. It does not say this
    // candle produces none, and "more than paraffin" is not "none".
    business_knowledge: [
      {
        category: "story",
        title: "Business Story",
        content:
          "Paraffin candles se zyada smoke hota hai. Soy wax use karte hain. Wick ko sahi center mein fix karna zaroori hai.",
      },
    ],
    brand_profiles: [{ tone_of_voice: "warm", messaging_pillars: [] }],
  };
});

const facts = () => gatherBusinessFacts(db(), "d1");

describe("the five sentences that went live", () => {
  it("1. a comparison that names the rival with no comparative word is still a comparison", async () => {
    const flags = findUnsupportedClaims(S1, await facts());
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatch(/"differently from paraffin"/);
    expect(flags[0]).toMatch(/comparison with another product/);
  });

  it("2. a comparison made by negation says the fault belongs to the others", async () => {
    const flags = findUnsupportedClaims(S2, await facts());
    expect(flags.join(" ")).toMatch(/"without the sharp synthetic hit"/);
    expect(flags.join(" ")).toMatch(/claim about them, not about yours/);
  });

  it("3. BOTH burn claims are caught, in the wording the model actually used", async () => {
    const flags = findUnsupportedClaims(S3, await facts());
    // "clean burning" and "soot free" were already on the list. These
    // two are what was written.
    expect(flags.join(" ")).toMatch(/"no soot"/);
    expect(flags.join(" ")).toMatch(/"burns clean"/);
  });

  it("4. \"exact\" is a measurement, and nothing measures it", async () => {
    const flags = findUnsupportedClaims(S4, await facts());
    expect(flags.join(" ")).toMatch(/"exact centre"/);
    expect(flags.join(" ")).toMatch(/"exact" is a measurement/);
  });

  it("5. \"Link in bio\" on Facebook is a platform problem, not a claim", async () => {
    // Correctly NOT a claims flag: there is nothing untrue about it.
    expect(findUnsupportedClaims(S5, await facts())).toEqual([]);
    // Facebook posts carry real links, so this is where the rule lives.
    expect(linksWork("facebook_post")).toBe(true);
    expect(linksWork("instagram_post")).toBe(false);
  });

  it("THE WHOLE CAPTION: every sentence but the link line is stripped", async () => {
    const f = await facts();
    const stripped = stripUnsupported(LIVE_CAPTION, f);
    for (const gone of ["differently from paraffin", "synthetic hit", "no soot", "burns clean", "exact centre"]) {
      expect(stripped.text).not.toMatch(gone);
    }
    // Five flags, one per sentence, plus the second burn claim.
    expect(stripped.removed.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------
// Suppression: a comparison can never be suppressed, a claim the owner
// recorded always can.
// ---------------------------------------------------------------------

describe("what the business's own records can and cannot license", () => {
  it("RECORDING THE COMPARISON DOES NOT LICENSE IT", async () => {
    // Nothing a business writes about itself establishes a claim about
    // someone else's wax. This is the 3 Oct 2026 suppression rule, and
    // the two new comparison detectors obey it.
    tables.business_knowledge.push({
      category: "story",
      title: "Why soy",
      content: "Soy wax carries fragrance differently from paraffin and without the sharp synthetic hit.",
    });
    const flags = findUnsupportedClaims(`${S1} ${S2}`, await facts());
    expect(flags.join(" ")).toMatch(/differently from paraffin/);
    expect(flags.join(" ")).toMatch(/sharp synthetic hit/);
  });

  it("but a recorded burn claim licenses its other phrasings", async () => {
    // An owner who writes "soot free" has said "no soot". Asking her to
    // attest both spellings would be the software failing to understand
    // its own question.
    tables.business_knowledge.push({ category: "product", title: "Burn", content: "Soot free, and a clean burn every time." });
    expect(findUnsupportedClaims(S3, await facts())).toEqual([]);
  });

  it("and a recorded measurement licenses the precision claim", async () => {
    tables.business_knowledge.push({ category: "process", title: "Wick", content: "Every wick is set at the exact centre." });
    expect(findUnsupportedClaims(S4, await facts())).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// No new false positives. Each of these is honest copy that the new
// rules must leave alone.
// ---------------------------------------------------------------------

describe("honest copy is left alone", () => {
  const FINE = [
    "A better way to unwind after a long day.",
    "Lavender, poured into glass, lit at dusk.",
    "Different people like different scents.",
    "Order without the wait — ships the same day.",
    "Exactly what your evening was missing.",
    "Hand-poured soy wax, 550 rupees.",
    "Soy wax is what we use.",
    "Paraffin was not for us.",
    "A quiet room, a small flame, nothing else.",
  ];

  it("none of these is flagged", async () => {
    const f = await facts();
    for (const line of FINE) {
      expect(findUnsupportedClaims(line, f), `flagged: ${line}`).toEqual([]);
    }
  });

  it("\"different\" about people, not products, is not a comparison", async () => {
    expect(findUnsupportedClaims("Different from what you're used to, in a good way.", await facts()).length).toBeGreaterThan(0);
    // ...but a difference between two of the customer's own choices is not.
    expect(findUnsupportedClaims("Pick whichever is different to your usual.", await facts())).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The platform rule, both directions.
// ---------------------------------------------------------------------

describe("link in bio, where links work", () => {
  it("becomes the business's OWN store address, never an invented one", () => {
    const r = fixLinkInBio("Order via link in bio!", "https://hawlai.online/site/candle-by-qaaf");
    expect(r.text).toBe("Order via https://hawlai.online/site/candle-by-qaaf!");
    expect(r.fixed).toBe(1);
    // The sentence's own punctuation survives.
    expect(r.text.endsWith("!")).toBe(true);
  });

  it("WITH NO SITE, THE WHOLE SENTENCE GOES — not just the phrase", () => {
    // Deleting the phrase alone left "Order via ." behind, which is
    // worse than the dead end it replaced.
    const r = fixLinkInBio("A quiet evening, bottled. Order via link in bio! Free gift wrap.", null);
    expect(r.text).toBe("A quiet evening, bottled. Free gift wrap.");
    expect(r.dropped).toBe(1);
    expect(r.fixed).toBe(0);
  });

  it("every phrasing of the habit", () => {
    for (const phrase of ["link in bio", "Link in my bio.", "the link is in our bio", "🔗 link in bio"]) {
      expect(fixLinkInBio(`Shop now. ${phrase}`, null).dropped, phrase).toBe(1);
    }
  });

  it("an INSTAGRAM caption is left exactly as written", () => {
    // There, "link in bio" is correct and the other rule put it there.
    const r = applyBioRule("instagram_post", { text: "Shop now. Link in bio." }, "https://hawlai.online/site/c");
    expect(r.output).toEqual({ text: "Shop now. Link in bio." });
    expect(r.fixed).toBe(0);
  });

  it("a Facebook caption is fixed, and the owner is told which happened", () => {
    const r = applyBioRule("facebook_post", { text: "Shop now. Link in bio." }, "https://hawlai.online/site/c");
    expect((r.output as any).text).toBe("Shop now. https://hawlai.online/site/c.");
    expect(bioRuleNote(r.fixed, r.dropped)).toMatch(/links work here, so Hawlai used your own store link/);
    expect(bioRuleNote(0, 1)).toMatch(/sends a reader nowhere on this platform/);
    expect(bioRuleNote(0, 0)).toBeNull();
  });

  it("metadata keys are not rewritten", () => {
    const r = applyBioRule("facebook_post", { text: "Shop now. Link in bio.", _claimsNote: "link in bio" }, null);
    expect((r.output as any)._claimsNote).toBe("link in bio");
  });
});

// ---------------------------------------------------------------------
// End to end, through the real chat tool.
// ---------------------------------------------------------------------

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db() }));
vi.mock("@/lib/usage/logUsage", () => ({ logClaudeUsage: async () => {}, logGeminiImageUsage: async () => {} }));

import { generateContent } from "@/lib/agents/contentMarketingAgent";

/** Anthropic returning the live caption, whatever it is asked. */
function anthropicReturns(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
      headers: { get: () => null },
    }))
  );
}

describe("the live caption, through the real content agent", () => {
  it("THE WHOLE THING IS CAUGHT ON THE PATH THAT PUBLISHED IT", async () => {
    anthropicReturns({ text: LIVE_CAPTION, hashtags: ["#candles"] });
    const f = await facts();
    const { output } = await generateContent(
      "facebook_post",
      "candle_by_qaaf",
      "Home fragrance",
      "Lavender candle",
      { tone_of_voice: "warm", messaging_pillars: [] },
      { supabase: db(), dealershipId: "d1" },
      "",
      f,
      "draft"
    );
    const out = output as any;
    for (const gone of ["differently from paraffin", "synthetic hit", "no soot", "burns clean", "exact centre"]) {
      expect(out.text ?? "", gone).not.toMatch(gone);
    }
    // The owner is told, rather than handed a quietly shortened caption.
    expect(out._claimsNote).toBeTruthy();
    expect(out._claimsNote).toMatch(/soot|paraffin|synthetic|exact/);
    // And the Instagram habit is gone from a Facebook post.
    expect(out.text ?? "").not.toMatch(/link in bio/i);
  });
});
