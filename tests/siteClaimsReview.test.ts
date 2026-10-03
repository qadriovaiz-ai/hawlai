// Stage 2: the owner going through the claims Hawlai wrote on their site.
//
// The loop this closes: the claims guard checks copy against what the
// business says about itself, and that included its own website — which
// the builder wrote. An invented line became the evidence approving the
// same line everywhere else. Excluding machine-written text fixes it, and
// doing so without asking would strip the owner's live copy with no
// warning, so the exclusion waits until they have been through the list.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { reviewPage, factsWithoutGeneratedCopy, withoutSentence, sentencesOf } from "@/lib/claims/siteClaimsReview";
import { ownerWritten, blocksText } from "@/lib/claims/businessFacts";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

function facts(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf", category: "Home fragrance", categoryKnown: true,
    businessModels: { models: ["products"], inferred: false }, city: "Shahjahanpur",
    site: { url: "/site/candle-by-qaaf", published: true, pages: [] }, home: null,
    products: [{ id: "p1", name: "Lavender candle", price: 550, description: "Soy wax", images: [], inventory: null, category: null, active: true } as any],
    offers: [], shipping: null,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 0, leads: 0 }, // On record, so copy repeating how the candles are made is backed
    // (materials joined CLAIM_TERMS on 2026-10-02).
    ownerFacts: [{ category: "business_story", title: "How our candles are made", content: "Hand-poured soy wax in small batches." } as any],
    brand: { tone: null, voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [], links: { store: "https://hawlai.online/site/candle-by-qaaf", products: [] },
    season: seasonFor([], "2026-10-02"), unreadable: [], ...over,
  } as BusinessFacts;
}

const generated = (id: string, props: Record<string, any>) => ({ id, type: "text", props: { ...props, _source: "generated" } });
// A block the owner edited, marked the way the builder now marks one:
// WHICH prop they wrote, not just that they were in the block. One mark
// per block is what hid the About page — editing a heading exempted the
// paragraph beside it from the review and made it evidence for itself.
const edited = (id: string, props: Record<string, any>) => ({
  id,
  type: "text",
  props: { ...props, _source: "edited", _edited: Object.keys(props).filter((k) => ["text", "heading", "html", "label"].includes(k)) },
});

const page = (sections: any[]) => ({ id: "p-home", slug: "home", title: "Home", sections });

describe("what lands on the list", () => {
  it("flags a claim nothing on record supports", () => {
    const items = reviewPage(page([generated("b1", { html: "<p>India's most loved candle brand.</p>" })]), facts());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "claim", pageTitle: "Home", blockId: "b1", field: "html" });
    expect(items[0].reason).toMatch(/superlative/);
  });

  it("flags a contact detail the business never gave — the worst of the three", () => {
    const items = reviewPage(page([generated("b1", { html: "<p>Email: hello@candlebyqaaf.com</p>" })]), facts());
    expect(items.some((i) => i.kind === "contact" && /hello@candlebyqaaf\.com/.test(i.reason))).toBe(true);
  });

  it("flags an offer the page promises and nothing on record mentions", () => {
    const items = reviewPage(page([
      generated("b1", { html: "<p>Planning corporate Diwali hampers or wedding favours?</p>" }),
      generated("b2", { html: "<p>Slide into our DMs for restock alerts.</p>" }),
    ]), facts());
    const offers = items.filter((i) => i.kind === "offer").map((i) => i.reason);
    expect(offers.join(" ")).toMatch(/gift sets|bulk or corporate orders|wedding favours/);
    expect(offers.join(" ")).toMatch(/restock alerts/);
  });

  it("does NOT flag an offer the catalogue actually sells", () => {
    const withWorkshop = facts({
      products: [{ id: "p2", name: "Candle Making Workshop", price: 800, description: "A 90-minute hands-on workshop", images: [], inventory: null, category: null, active: true } as any],
    });
    const items = reviewPage(page([generated("b1", { html: "<p>Join our candle making workshop.</p>" })]), withWorkshop);
    expect(items.filter((i) => i.kind === "offer")).toEqual([]);
  });

  it("LEAVES THE OWNER'S OWN WORDS ALONE", () => {
    // Putting a line the owner wrote on a review list would be telling
    // them their own sentence needs their approval.
    const items = reviewPage(page([edited("b1", { html: "<p>India's most loved candle brand.</p>" })]), facts());
    expect(items).toEqual([]);
  });

  it("reaches into children, where the copy actually lives", () => {
    const tree = [{ id: "s", type: "section", props: {}, children: [generated("b1", { text: "India's most loved candle brand" })] }];
    expect(reviewPage(page(tree), facts())).toHaveLength(1);
  });

  it("splits a paragraph into sentences, so one bad line doesn't condemn the rest", () => {
    expect(sentencesOf("<p>Hand-poured in Shahjahanpur. India's most loved brand. Shop now.</p>")).toEqual([
      "Hand-poured in Shahjahanpur.",
      "India's most loved brand.",
      "Shop now.",
    ]);
    const items = reviewPage(page([generated("b1", { html: "<p>Hand-poured in Shahjahanpur. India's most loved brand.</p>" })]), facts());
    expect(items).toHaveLength(1);
    expect(items[0].sentence).toBe("India's most loved brand.");
  });
});

describe("removing one line", () => {
  it("takes the sentence out and leaves the rest of the paragraph", () => {
    const before = "<p>Hand-poured in Shahjahanpur. India's most loved brand. Shop now.</p>";
    const after = withoutSentence(before, "India's most loved brand.");
    expect(after).toContain("Hand-poured in Shahjahanpur.");
    expect(after).toContain("Shop now.");
    expect(after).not.toContain("most loved");
  });

  it("drops a paragraph that held nothing else", () => {
    expect(withoutSentence("<p>India's most loved brand.</p>", "India's most loved brand.")).toBe("");
  });

  it("changes nothing when the line is not there any more", () => {
    const value = "<p>Hand-poured in Shahjahanpur.</p>";
    expect(withoutSentence(value, "Something else entirely.")).toBe(value);
  });
});

describe("the evidence rule, and when it applies", () => {
  const sections = [
    generated("b1", { html: "<p>No paraffin. No synthetic shortcuts.</p>" }),
    edited("b2", { html: "<p>Poured by hand in Shahjahanpur.</p>" }),
  ];

  it("keeps only the owner's blocks as evidence", () => {
    const kept = blocksText(ownerWritten(sections));
    expect(kept.paragraphs.join(" ")).toContain("Poured by hand in Shahjahanpur.");
    expect(kept.paragraphs.join(" ")).not.toContain("No paraffin");
  });

  it("treats a page from before any of this as the owner's", () => {
    // No _source at all means the site predates the marking. Guessing
    // against the owner would strip copy they have lived with.
    const old = [{ id: "b", type: "text", props: { html: "<p>An older line.</p>" } }];
    expect(blocksText(ownerWritten(old)).paragraphs.join(" ")).toContain("An older line.");
  });

  it("measures the review list against facts the site cannot vouch for", () => {
    const f = facts({ site: { url: "/site/x", published: true, pages: [{ slug: "home", title: "Home", headings: [], paragraphs: ["No paraffin. No synthetic shortcuts."], buttons: [], metaDescription: null, hasShareImage: false } as any] } });
    const honest = factsWithoutGeneratedCopy(f, [{ slug: "home", sections }]);
    expect(honest.site!.pages[0].paragraphs.join(" ")).not.toContain("No paraffin");
    expect(honest.site!.pages[0].paragraphs.join(" ")).toContain("Poured by hand");
  });

  it("WAITS for the owner: facts only drop generated copy once they have reviewed", () => {
    const facts_ts = readFileSync("src/lib/claims/businessFacts.ts", "utf8");
    expect(facts_ts).toMatch(/const reviewed = Boolean\(dealership\?\.claims_reviewed_at\)/);
    expect(facts_ts).toMatch(/blocksText\(reviewed \? ownerWritten\(p\.sections\) : p\.sections\)/);
  });
});

describe("the decisions the owner can take", () => {
  const route = readFileSync("src/app/api/seo/claims-review/route.ts", "utf8");

  it("Keep writes it into Business Knowledge, making them the source", () => {
    expect(route).toMatch(/\.from\("business_knowledge"\)\.insert/);
    // A claim goes under business_story, which is what knownText reads.
    // A CONTACT detail goes under 'general' instead, because the scrub
    // that takes an invented email off a page reads ownerFacts rather
    // than knownText — see tests/claimsReviewProductionShape.test.ts.
    expect(route).toMatch(/isContact \? "general" : "business_story"/);
  });

  it("Remove edits only this business's own page", () => {
    expect(route).toMatch(/const pages = await livePages\(supabase, dealershipId\)/);
    expect(route).toMatch(/That page isn't on your website/);
  });

  it("Finish is what switches the evidence rule on", () => {
    expect(route).toMatch(/claims_reviewed_at: new Date\(\)\.toISOString\(\)/);
  });

  it("nothing is written without a decision", () => {
    // Reading the list must not change anything, so GET's own body is
    // checked rather than the file — a regex spanning both functions
    // would find POST's writes and pass regardless.
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(get).not.toMatch(/\.(insert|update|delete)\(/);
    expect(route.slice(route.indexOf("export async function POST"))).toMatch(/\.(insert|update)\(/);
  });

  it("the card is on the SEO page, inside its own error boundary", () => {
    const seoPage = readFileSync("src/app/dashboard/seo/page.tsx", "utf8");
    expect(seoPage).toMatch(/<ErrorBoundary section="Claims on your site">\s*<ClaimsReview \/>/);
  });
});

describe("a comparison with someone else's product", () => {
  const sections = [generated("b1", { html: "<p>We use natural soy wax that burns cleaner, slower, and safer than mass-market paraffin.</p>" })];

  it("is its own category, and Keep is not offered", () => {
    const items = reviewPage(page(sections), facts());
    const comparative = items.find((i) => i.kind === "comparative")!;
    expect(comparative).toBeTruthy();
    expect(comparative.reason).toMatch(/a comparison with competitors/);
    // Not the owner's to attest: Hawlai has nothing to check a claim
    // about goods they do not make, whoever says it.
    expect(comparative.keepable).toBe(false);
  });

  it("appears at all — which it did not before, on a legacy page", () => {
    // reviewPage only read block-shaped nodes, so a page still in the
    // flat pre-block shape was skipped whole and a live comparative
    // health claim never reached the list.
    const legacy = [{ type: "hero", headline: "Safer than mass-market paraffin", subheadline: "Hand-poured", ctaText: "Shop" }];
    const items = reviewPage(page(legacy), facts());
    expect(items.some((i) => i.kind === "comparative")).toBe(true);
  });
});

describe("what Keep attests", () => {
  it("names the flagged words, not the sentence around them", () => {
    const items = reviewPage(page([generated("b1", { html: "<p>India's most loved candle brand.</p>" })]), facts());
    expect(items[0].claim).toBe("India's most loved");
    expect(items[0].sentence).toBe("India's most loved candle brand.");
    expect(items[0].keepable).toBe(true);
  });

  it("withholds Keep when the exact words cannot be isolated", () => {
    // "a star rating — Hawlai has no rating data" names a kind, not a
    // quote. A claim that cannot be named cannot be attested.
    const items = reviewPage(page([generated("b1", { html: "<p>Rated 4.9/5 by our customers.</p>" })]), facts());
    const rating = items.find((i) => /star rating/.test(i.reason))!;
    expect(rating.claim).toBeNull();
    expect(rating.keepable).toBe(false);
  });

  it("the server records the claim and refuses without it", () => {
    const route = readFileSync("src/app/api/seo/claims-review/route.ts", "utf8");
    expect(route).toMatch(/content: claim,/);
    expect(route).not.toMatch(/content: sentence,/);
    expect(route).toMatch(/I can't tell which words you're standing behind/);
    // And refuses a comparative outright, not just in the UI.
    expect(route).toMatch(/body\?\.kind === "comparative"/);
    // And refuses a claim that is no longer in that sentence.
    expect(route).toMatch(/isn't in that sentence any more/);
  });
});

describe("before Remove is pressed", () => {
  it("says what the block would be left with", () => {
    const items = reviewPage(page([generated("b1", { html: "<p>Hand-poured in Shahjahanpur. India's most loved brand.</p>" })]), facts({
      ownerFacts: [{ category: "business_story", title: "How", content: "Hand-poured soy wax in small batches." } as any],
    }));
    const item = items.find((i) => i.claim === "India's most loved")!;
    expect(item.removeLeaves).toContain("Hand-poured in Shahjahanpur.");
    expect(item.removeLeaves).not.toContain("most loved");
  });

  it("and the card shows it, with Edit as the alternative", () => {
    const card = readFileSync("src/components/seo/ClaimsReview.tsx", "utf8");
    expect(card).toMatch(/Remove deletes the whole sentence, not just those words/);
    expect(card).toMatch(/Edit keeps the rest/);
    expect(card).toMatch(/\{item\.keepable && \(/);
  });
});

describe("a sentence on a legal page", () => {
  // The real one, from this site's Terms: a claims flag sits inside a
  // returns position.
  const TERMS = "Every candle is hand-poured in small batches, so slight variations in colour are natural and not defects.";
  const legalPage = (slug: string) => ({ id: "p-legal", slug, title: "Terms", sections: [generated("b1", { html: `<p>${TERMS}</p>` })] });

  it("IS NOT REMOVED when it says more than the flagged words", () => {
    const items = reviewPage(legalPage("terms"), facts({ ownerFacts: [] }));
    const item = items.find((i) => i.claim && TERMS.includes(i.claim))!;
    expect(item).toBeTruthy();
    // Deleting it to clear a claims flag would quietly change what the
    // business has told its customers about returns.
    expect(item.removable).toBe(false);
    // Edit is still the way through, and Keep is unaffected.
    expect(item.keepable).toBe(true);
  });

  it("IS removable when the sentence is nothing but the claim", () => {
    const only = { id: "p-legal", slug: "privacy-policy", title: "Privacy", sections: [generated("b1", { html: "<p>Handmade.</p>" })] };
    const item = reviewPage(only, facts({ ownerFacts: [] })).find((i) => i.claim === "handmade");
    // Nothing else is lost, so the owner may take it off from here.
    expect(item?.removable).toBe(true);
  });

  it("leaves an ordinary page alone", () => {
    const items = reviewPage({ ...legalPage("about"), slug: "about" }, facts({ ownerFacts: [] }));
    expect(items.every((i) => i.removable)).toBe(true);
  });

  it("is refused by the route, not only hidden in the card", () => {
    const route = readFileSync("src/app/api/seo/claims-review/route.ts", "utf8");
    expect(route).toMatch(/isLegalPage\(page\) && claimForRemoval/);
    expect(route).toMatch(/removing it would take the rest of the sentence with it/);
    const card = readFileSync("src/components/seo/ClaimsReview.tsx", "utf8");
    expect(card).toMatch(/\{item\.removable && \(/);
    expect(card).toMatch(/says more than the flagged words/);
  });

  it("one rule, shared with the SEO health check", () => {
    // Two copies of a safety rule is a safety rule that will disagree
    // with itself.
    expect(readFileSync("src/lib/agents/seoAgent.ts", "utf8")).toMatch(/from "@\/lib\/seo\/pageKinds"/);
    expect(readFileSync("src/lib/claims/siteClaimsReview.ts", "utf8")).toMatch(/from "@\/lib\/seo\/pageKinds"/);
  });
});
