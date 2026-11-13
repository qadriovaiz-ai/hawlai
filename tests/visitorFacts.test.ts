// What a stranger on the public website may be told — V4a's precondition.
//
// The agent is about to move from one quick-launch landing page onto
// the whole Website Builder storefront, so the question "what is this
// thing allowed to say about the business" stops being theoretical.
//
// THE FILTER ALREADY EXISTED, which is the useful finding: FactsAudience
// is exactly it, and the public path already asked for "customer". What
// did not exist was anything STOPPING it asking for "owner" — the
// parameter defaults to it. These tests hold the line behaviourally,
// with real numbers in the facts, rather than by reading the call site.

import { describe, it, expect } from "vitest";
import { visitorFactsBlock, truthBlock } from "@/lib/claims/factsGate";
import { formatFactsForCopy, formatFactsForPrompt, type BusinessFacts } from "@/lib/claims/businessFacts";
import { code } from "./helpers/source";

/**
 * A business with a trading history worth hiding.
 *
 * The numbers are deliberately distinctive — 47, 1291, 83 — so a test
 * that finds them in a string has found THEM, not a stray digit from a
 * price or a date.
 */
function facts(): BusinessFacts {
  return {
    businessName: "Example Trading Co",
    category: "Retail",
    categoryKnown: true,
    city: "Lucknow",
    products: [{ id: "p1", name: "A thing", kind: "product", price: 500, description: "", images: [], inventoryCount: 9, category: null, durationMinutes: null, bookingUrl: null }],
    offers: [],
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    last30: { views: 1291, chatOpens: 83, leads: 19, orders: 7, abandonedCarts: 23, conversionRate: 0.54, cartAbandonmentRate: 77 },
    allTime: { paidOrders: 47, leads: 612 },
    ownerFacts: [],
    businessModels: { models: ["products"], inferred: false },
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null },
    pillars: [],
    links: { store: "https://example.test/site/x", products: [], booking: null },
    site: null,
    home: null,
    season: null,
    unreadable: [],
  } as unknown as BusinessFacts;
}

/** Every figure that belongs to the owner alone. */
const PRIVATE_FIGURES = [
  ["all-time paid orders", "47"],
  ["all-time leads", "612"],
  ["30-day views", "1291"],
  ["30-day chat opens", "83"],
  ["30-day leads", "19"],
  ["30-day abandoned carts", "23"],
  ["cart abandonment rate", "77"],
] as const;

describe("1. A VISITOR IS NOT TOLD THE BUSINESS'S OWN NUMBERS", () => {
  it("NOT ONE OF THEM REACHES THE VISITOR BLOCK", () => {
    // THE LOAD-BEARING ONE. A visitor asking "how many have you sold?"
    // must not be answered with a real figure: it is private, and for a
    // new business it is a damaging answer.
    const block = visitorFactsBlock(facts());
    for (const [what, figure] of PRIVATE_FIGURES) {
      // A WHOLE NUMBER, NOT A SUBSTRING. The first version of this
      // assertion failed on "Consumer Protection Act 2019" in the truth
      // rules, which contains the 19 that is a lead count elsewhere. A
      // guard that cries wolf gets loosened by the next person.
      expect(block, `${what} (${figure}) leaked to a visitor`).not.toMatch(
        new RegExp("(?<![0-9])" + figure + "(?![0-9])")
      );
    }
  });

  it("AND IT IS STILL TOLD THERE IS NOTHING TO QUOTE", () => {
    // Hiding the number without saying so is how a model fills the gap
    // with an invented one — the same reasoning personalStories gives
    // for naming a withheld story rather than dropping it silently.
    expect(visitorFactsBlock(facts())).toMatch(/No ratings, reviews or customer counts/);
  });

  it("THE OWNER'S OWN BLOCK STILL CARRIES THE TRACK RECORD", () => {
    // The filter must not have been implemented by deleting the facts
    // for everybody — that would be a silent downgrade of eighteen
    // internal callers.
    expect(formatFactsForCopy(facts(), "owner")).toContain("47");
    expect(formatFactsForCopy(facts(), "owner")).toContain("612");
  });

  it("and the visitor still gets what a visitor needs", () => {
    const block = visitorFactsBlock(facts());
    expect(block).toContain("A thing");
    expect(block).toContain("Example Trading Co");
  });
});

describe("2. THE PUBLIC PATH CANNOT ASK FOR THE OWNER AUDIENCE", () => {
  it("THE VISITOR BLOCK TAKES NO AUDIENCE ARGUMENT AT ALL", () => {
    // truthBlock's audience defaults to "owner". Before this wrapper
    // existed, the public path was correct because somebody remembered
    // to type "customer" — correct by habit, not by structure. A
    // refactor dropping the second argument would have started reading
    // the owner's figures to strangers, and nothing would have failed.
    //
    // NOT `fn.length`. That counts parameters BEFORE the first default,
    // so a mutation adding `audience: any = "customer"` kept it at 1
    // and survived — defeating the one assertion this test exists to
    // make. The signature itself is what has to be read.
    const src = code("src/lib/claims/factsGate.ts");
    const start = src.indexOf("export function visitorFactsBlock");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf("\n}", start));
    const signature = fn.slice(0, fn.indexOf("{"));
    expect(signature).not.toMatch(/audience/);
    expect(signature.split(",")).toHaveLength(1);
    expect(fn).toMatch(/return truthBlock\(facts, "customer"\);/);
    // And the default really is the unsafe one, or there is nothing here
    // to protect against.
    expect((truthBlock as any)(facts())).toContain("47");
  });

  it("THE SALES AGENT USES IT, and names no audience of its own", () => {
    const src = code("src/lib/agents/chatbotAgent.ts");
    expect(src).toMatch(/visitorFactsBlock\(context\.facts\)/);
    expect(src).not.toMatch(/truthBlock/);
    expect(src).not.toMatch(/"owner"/);
  });

  it("AND THE UNFILTERED BUILDER IS NOT ON A PUBLIC PATH", () => {
    // formatFactsForPrompt prints everything — last30, all-time, and
    // what could not be read. Its callers are internal by inspection;
    // this fails if the public agent or a public route ever picks it up.
    const publicFiles = [
      "src/lib/agents/chatbotAgent.ts",
      "src/app/api/public/chat/route.ts",
    ];
    for (const file of publicFiles) {
      expect(code(file), file).not.toMatch(/formatFactsForPrompt/);
    }
  });

  it("the unfiltered builder really does carry what we are keeping out", () => {
    // Otherwise the test above is guarding nothing — a guard whose
    // target is harmless passes forever and proves nothing.
    const owner = formatFactsForPrompt(facts());
    for (const [what, figure] of PRIVATE_FIGURES) {
      expect(owner, what).toContain(figure);
    }
  });
});

describe("3. NOTHING WAS READ THAT WAS NOT MEANT TO BE", () => {
  it("THE CATALOGUE IS AN ALLOWLIST, and it excludes the trade identifiers", () => {
    // Checked rather than assumed, because a site-wide agent reads the
    // catalogue on every product page: `products` has no cost, margin or
    // wholesale column at all, and the columns that ARE read are listed
    // one by one rather than selected with *.
    const src = code("src/lib/claims/businessFacts.ts");
    const line = src.slice(src.indexOf("export const CATALOG_COLUMNS"));
    const decl = line.slice(0, line.indexOf(";"));
    expect(decl).not.toContain("*");
    expect(decl).not.toContain("sku");
    expect(decl).not.toContain("gtin");
  });

  it("AND THE CATALOGUE READ USES THAT LIST, not its own column set", () => {
    const src = code("src/lib/claims/businessFacts.ts");
    const read = src.slice(src.indexOf('supabase.from("products")'));
    expect(read.slice(0, 120)).toContain("CATALOG_COLUMNS");
  });
});
