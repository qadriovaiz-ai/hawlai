// A RECORDED ROW'S PROTECTION MUST NOT DEPEND ON WHICH CATEGORY IT SITS IN.
//
// 15 October 2026. factsPrompt split the owner's rows on
// `category === "business_story"`, and three protections existed only
// on that side of the split:
//
//   splitStories    the personalStories consent check — a customer's
//                   private situation (an accident, a bereavement)
//   isStoryRow      the owner's own story, held back by title
//   factSentences   the owner's reason-and-feeling sentences, dropped
//
// The other branch had none of them, and cut content at
// `slice(0, 200)` — mid-sentence, so "40 hours burn hota hai" could
// reach the model as a number with no unit.
//
// This mattered because migration 209 moves nine rows OUT of
// `business_story` and into `general`. Under the old split that single
// UPDATE would have put the "Materials and suppliers" motive sentence
// back into every prompt — undoing the fix of 2026-10-11 — truncated
// nine fact rows to 200 characters, and, had the private row ever been
// moved by mistake, dropped its consent protection entirely.
//
// So category now decides PRESENTATION only: fact categories print
// uncapped, notes stay capped at 200 under their own heading, which
// tests/contentQuality.test.ts:164 pins and which is right — a returns
// policy should not crowd out the burn time. Protection applies to
// every row either way.

import { describe, it, expect } from "vitest";
import { formatFactsForCopy, type BusinessFacts } from "@/lib/claims/businessFacts";
import { isFactCategory, FACT_CATEGORIES, STORY_CATEGORY } from "@/lib/business/businessStory";
import { seasonFor } from "@/lib/expertise/seasonalCalendar";

type Row = { category: string; title: string; content: string; consented?: boolean };

function facts(ownerFacts: Row[]): BusinessFacts {
  return {
    businessName: "A Business",
    category: "Home fragrance",
    categoryKnown: true,
    businessModels: { models: ["products"], inferred: false },
    city: "Shahjahanpur",
    site: null,
    home: null,
    products: [
      { id: "p1", name: "Lavender candle", kind: "product", price: 999, description: "Soy wax", images: [], inventory: null, category: null, active: true },
    ],
    offers: [],
    shipping: { mode: "free", rate: null, freeThreshold: null },
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: ownerFacts as any,
    brand: { tone: "warm", voice: null, persona: null, language: null, pillars: [], description: null, colors: [], logoUrl: null } as any,
    pillars: [],
    links: { store: null, products: [], booking: null },
    season: seasonFor([], "2026-09-18"),
    unreadable: [],
  } as unknown as BusinessFacts;
}

// The sentence a real customer wrote, in the shape personalStories
// recognises. It is not the owner's to publish.
const PRIVATE = "Ek customer ne likha ki uske husband ka accident hua tha aur woh hospital mein candle jalati rahi.";

// A reason joined to a feeling — the owner's motive, not a fact.
const MOTIVE = "Maine yeh shuru kiya kyunki mujhe sasti cheezein dekh kar bahut bura lagta tha.";
const FACT_BESIDE_IT = "Wax 65 degrees par milati hoon.";

describe("protection does not depend on the category", () => {
  it("A PRIVATE CUSTOMER SITUATION IS WITHHELD EVEN FROM A NON-STORY CATEGORY", () => {
    // The exact migration-209 hazard: the row is filed under `general`,
    // which before today meant no consent check ran on it at all.
    const block = formatFactsForCopy(facts([{ category: "general", title: "What a customer actually said", content: PRIVATE }]));
    // ASSERTED ON THE ROW'S OWN WORDS, not on the word "accident":
    // withheldNote itself says "an accident or similar" while explaining
    // that the material is off-limits, so not.toContain("accident")
    // fails on the protection rather than on a leak. My first version
    // did exactly that.
    expect(block).not.toContain("husband");
    expect(block).not.toContain("candle jalati rahi");
    // And the model is told the material exists, so it does not invent
    // a substitute anecdote.
    expect(block).toMatch(/WITHHELD FROM YOU ON PURPOSE/);
  });

  it("the same row under business_story is withheld too — this is not a swap of one hole for another", () => {
    const block = formatFactsForCopy(facts([{ category: STORY_CATEGORY, title: "What a customer actually said", content: PRIVATE }]));
    expect(block).not.toContain("husband");
    expect(block).not.toContain("candle jalati rahi");
  });

  it("A STORY-TITLED ROW IS HELD BACK FROM A NON-STORY CATEGORY TOO", () => {
    const block = formatFactsForCopy(
      facts([{ category: "general", title: "How it started", content: "Maine 2019 mein maa ki dukaan band hone ke baad shuru kiya." }])
    );
    expect(block).not.toContain("2019");
    expect(block).not.toContain("dukaan");
  });

  it("A MOTIVE SENTENCE IS DROPPED FROM A NON-STORY CATEGORY TOO, and the fact beside it stays", () => {
    const block = formatFactsForCopy(
      facts([{ category: "general", title: "Materials and suppliers", content: `${MOTIVE} ${FACT_BESIDE_IT}` }])
    );
    expect(block).not.toContain("bura lagta tha");
    expect(block).toContain("65 degrees");
  });

  // THE THREE ABOVE USE `general`, WHICH IS A FACT CATEGORY — so they
  // only exercise the fact branch. A mutation that made the NOTES
  // branch skip rowsForPrompt entirely survived all of them. These
  // three are the same protections asserted on a NOTE category, which
  // is the half that had none of them before today.

  it("A STORY-TITLED NOTE IS HELD BACK TOO — the notes branch gets the hold-back", () => {
    const block = formatFactsForCopy(
      facts([{ category: "faq", title: "How it started", content: "Maine 2019 mein maa ki dukaan band hone ke baad shuru kiya." }])
    );
    expect(block).not.toContain("2019");
    expect(block).not.toContain("dukaan");
  });

  it("A MOTIVE SENTENCE IS DROPPED FROM A NOTE TOO, and the fact beside it stays", () => {
    const block = formatFactsForCopy(
      facts([{ category: "policy", title: "Returns", content: `${MOTIVE} ${FACT_BESIDE_IT}` }])
    );
    expect(block).not.toContain("bura lagta tha");
    expect(block).toContain("65 degrees");
  });

  it("A PRIVATE SITUATION IN A NOTE IS WITHHELD — and the note branch still prints its other rows", () => {
    // Both rows are notes. The private one must go; the ordinary one
    // must stay, or "withheld" and "the whole branch broke" would look
    // the same.
    const block = formatFactsForCopy(
      facts([
        { category: "faq", title: "What a customer actually said", content: PRIVATE },
        { category: "faq", title: "Delivery", content: "Order ke do din mein bhej dete hain." },
      ])
    );
    expect(block).not.toContain("husband");
    expect(block).not.toContain("candle jalati rahi");
    expect(block).toContain("do din mein bhej dete hain");
  });

  it("a fact row moved to `general` still prints UNCAPPED — what migration 209 depends on", () => {
    const long = "Wax double boiler mein melt karti hoon, phir fragrance 65 degrees par milati hoon, phir 24 ghante set hone deti hoon. " + "z".repeat(300);
    const block = formatFactsForCopy(facts([{ category: "general", title: "How it's made, step by step", content: long }]));
    expect(block).toContain("z".repeat(300));
  });

  it("a NOTE stays capped at 200, so a policy cannot crowd out the product", () => {
    const block = formatFactsForCopy(facts([{ category: "policy", title: "Returns", content: "q".repeat(400) }]));
    expect(block).not.toContain("q".repeat(220));
    expect(block).toContain("What the owner says about the business:");
  });

  it("A FACT ROW IS NEVER CUT MID-SENTENCE — whole rows, or counted as held back", () => {
    // Twelve long fact rows, past the 2,600-character budget. Whatever
    // is printed must end where a sentence ends, because "40 hours burn
    // hota hai" cut in the middle is a number with no unit.
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      category: "general",
      title: `Note ${i}`,
      content: `Yeh ek poora sentence hai jisme ${i * 7 + 11} ghante ka burn time likha hai. ` + "w".repeat(200),
    }));
    const block = formatFactsForCopy(facts(rows));
    // EVERY row that printed, printed WHOLE. Asserted per row, because
    // my first version used not.toMatch(/w{1,199}\n/) — which the regex
    // engine satisfies by backtracking to the last 199 characters of a
    // complete 200-character run, so it failed on correct output.
    let printed = 0;
    for (const row of rows) {
      if (!block.includes(`- ${row.title}:`)) continue;
      printed += 1;
      expect(block, `${row.title} was cut`).toContain(row.content);
    }
    // Some printed and some did not, or this proves nothing either way.
    expect(printed).toBeGreaterThan(0);
    expect(printed).toBeLessThan(rows.length);
    // And the ones that did not fit are declared rather than vanished.
    expect(block).toMatch(/more recorded note\(s\) did not fit here/);
  });

  it("`general` counts as a fact category and a policy does not", () => {
    expect(isFactCategory("general")).toBe(true);
    expect(isFactCategory(STORY_CATEGORY)).toBe(true);
    expect(isFactCategory("policy")).toBe(false);
    expect(isFactCategory("hours")).toBe(false);
    expect(isFactCategory("faq")).toBe(false);
    expect(isFactCategory("pricing_note")).toBe(false);
    // An unknown or absent category is a note, not a fact: the safe
    // default is the capped one.
    expect(isFactCategory(null)).toBe(false);
    expect(isFactCategory("Policies")).toBe(false);
    // Exactly two, so adding a third is a decision rather than a slip.
    expect([...FACT_CATEGORIES].sort()).toEqual(["business_story", "general"]);
  });
});
