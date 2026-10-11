// THE RULES ARE LIVE NOW. Enabled 2026-10-11 on the owner's word.
//
// Two classes went in together:
//
//   COMPARISONS AND PERFORMANCE  the three sentences that survived the
//     11 October Facebook post. Dry run: scripts/comparativeDryRun.mjs
//
//   HEALTH AND BENEFIT           "sleep better", which no rule in this
//     codebase caught. Dry run: scripts/benefitClaimsDryRun.mjs
//
// TIERS, decided by the owner:
//   comparisons, performance, vulnerable-group  ->  claim
//     strict in both modes: a draft loses them too
//   sleep, mood, body, therapeutic              ->  substantiation
//     kept in a draft with a note saying how to make it sayable,
//     stripped on publish
//
// This file drives the REAL guard, not the dry-run scripts. The scripts
// informed the decision; these assertions are what holds afterwards.

import { describe, it, expect } from "vitest";
import { stripUnsupported, stripUnverifiable } from "@/lib/claims/claimCheck";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

/** candle_by_qaaf, as its records actually stand. */
function candle(over: Partial<BusinessFacts> = {}): BusinessFacts {
  return {
    businessName: "Candle by Qaaf",
    category: "Home fragrance",
    categoryKnown: true,
    city: "Shahjahanpur",
    products: [{ name: "Lavender candle", price: 550, description: "Soy wax, 40 hour burn" }],
    offers: [], pillars: [], site: null, home: null,
    links: { store: null, booking: null, products: [] },
    brand: { description: null, pillars: [], language: null, tone: "warm" } as any,
    last30: { views: 0, chatOpens: 0, leads: 0, orders: 0, abandonedCarts: 0, conversionRate: null, cartAbandonmentRate: null },
    allTime: { paidOrders: 2, leads: 1 },
    ownerFacts: [] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    unreadable: [],
    ...over,
  } as unknown as BusinessFacts;
}

const gone = (line: string, f = candle(), mode: "draft" | "publish" = "publish") =>
  stripUnsupported(line, f, mode).text.trim();

// ---------------------------------------------------------------------
// 1. THE THREE SENTENCES THAT SURVIVED THE LIVE POST
// ---------------------------------------------------------------------

describe("1. the live post's survivors are now caught", () => {
  it("SEPARATES X FROM Y, with the pejorative attributed to the rival", () => {
    const line = "What separates a candle made with real fragrance oil from one made with cheap synthetic alternatives.";
    const r = stripUnsupported(line, candle(), "publish");
    expect(r.text.trim()).toBe("");
    expect(r.removed.join(" ")).toMatch(/comparison with another product|cheap or synthetic/);
  });

  it("A SPELLED-OUT PERFORMANCE DURATION", () => {
    expect(gone("It fills the room rather than burning off in twenty minutes.")).toBe("");
  });

  it("A PERFORMANCE CLAIM WITH NO NUMBER AT ALL", () => {
    expect(gone("The scent lasts.")).toBe("");
  });

  it("ALL THREE IN ONE PARAGRAPH, and the honest line survives", () => {
    const post = [
      "Evenings get loud in Shahjahanpur.",
      "What separates a candle made with real fragrance oil from one made with cheap synthetic alternatives.",
      "The scent lasts.",
      "Lavender candle, 550.",
    ].join(" ");
    const out = gone(post);
    expect(out).toContain("Evenings get loud");
    expect(out).toContain("Lavender candle, 550");
    expect(out).not.toMatch(/separates/);
    expect(out).not.toMatch(/scent lasts/);
  });

  it("STRICT IN DRAFT TOO — a comparison is not a draft-mode warning", () => {
    // The 8 October shape: the caption went out through the chat card,
    // which IS draft mode. A comparison kept "for the owner to see" is
    // one click from a customer.
    expect(gone("Unlike the standard candles on the shelf, ours is steady.", candle(), "draft")).toBe("");
    expect(gone("Most candles never hold their scent.", candle(), "draft")).toBe("");
  });

  it("TWO LAYERS COVER THE COMMON FORMS, AND BOTH ARE PINNED HERE", () => {
    // Found by a mutation check surviving: narrativeProvenance has had
    // a `comparative` family since 2026-10-09 that already covered
    // "unlike most candles" and "most candles don't", in both modes.
    // My dry run compared only against claimCheck's patterns, so it
    // reported these as gaps when they were already closed elsewhere.
    //
    // The new claims rules are NOT redundant - they extend to
    // "unlike the <adjective> <plural>" and to "never", which the
    // narrative family does not reach - but the overlap is real and
    // two lists describing one thing can drift. Recorded as a finding
    // for the owner rather than refactored inside a guard commit.
    //
    // Pinned here so neither layer's cover can disappear unnoticed.
    const COVERED_BY_NARRATIVE = ["Unlike most candles, ours is steady.", "Most candles don't hold their scent."];
    const COVERED_BY_CLAIMS = ["Unlike the standard candles on the shelf, ours is steady.", "Most candles never hold their scent.", "Other brands never cure their wax properly."];
    for (const line of [...COVERED_BY_NARRATIVE, ...COVERED_BY_CLAIMS]) {
      for (const mode of ["draft", "publish"] as const) {
        expect(gone(line, candle(), mode), `${mode}: ${line}`).toBe("");
      }
    }
    // And the claims layer specifically reports a reason for its own
    // three, which is what puts them in the owner's note.
    for (const line of COVERED_BY_CLAIMS) {
      expect(stripUnsupported(line, candle(), "publish").removed.length, line).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------
// 2. WHAT MUST STILL SURVIVE — the cost side
// ---------------------------------------------------------------------

describe("2. honest copy is untouched", () => {
  it("A RECORDED DURATION IS THE BUSINESS'S OWN", () => {
    expect(gone("Soy wax, 40 hour burn. 550.")).toContain("40 hour burn");
  });

  it("A SERVICE'S OWN LENGTH IS NOT A PERFORMANCE CLAIM", () => {
    // The false positive the first version of this rule produced, and
    // the one tests/preferredLanguage.test.ts caught: a workshop's
    // length is the central fact of a service, and every service
    // business states one. My dry-run fixtures were all burn times.
    const workshop = candle({
      products: [{ name: "Candle-making workshop", price: 800, description: "Ninety minutes, one candle" }],
    } as any);
    expect(gone("Melt, choose your scent, pour. Ninety minutes, one candle that's yours.", workshop)).toContain("Ninety minutes");
    expect(gone("Each session runs for two hours.", workshop)).toContain("two hours");
  });

  it("copy about the reader keeps every word", () => {
    for (const line of [
      "Evenings get loud. Light one at eight and the room slows down.",
      "It smells of lavender and a little vanilla.",
      "Lavender candle, 550. Ships across Shahjahanpur.",
    ]) {
      expect(gone(line), line).toBe(line);
    }
  });

  it("\"unlike\" as flourish is not a comparison with anybody", () => {
    // The existing COMPARATIVE rule kept `unlike` narrow on purpose and
    // the new rule only widens it after most/other/the.
    expect(gone("Unlike anything you have smelled before.")).toContain("Unlike anything");
  });
});

// ---------------------------------------------------------------------
// 3. THE BENEFIT CLASS, AND ITS TWO TIERS
// ---------------------------------------------------------------------

describe("3. health and benefit claims", () => {
  it("THE ONE THE OWNER NAMED: \"sleep better\"", () => {
    // Caught by nothing before today.
    const r = stripUnsupported("Light it an hour before bed and sleep better.", candle(), "publish");
    expect(r.text.trim()).toBe("");
  });

  it("KEPT IN A DRAFT, WITH A NOTE SAYING HOW TO MAKE IT SAYABLE", () => {
    const r = stripUnsupported("Light it an hour before bed and sleep better.", candle(), "draft");
    expect(r.text).toContain("sleep better");
    expect(r.substantiation.join(" ")).toMatch(/sleep better/);
    expect(r.substantiation.join(" ")).toMatch(/Business Knowledge/);
    expect(r.removed).toEqual([]);
  });

  it("the other three benefit shapes, all substantiation", () => {
    for (const line of [
      "It helps you relax after a long day.",
      "Good for the skin on acne-prone days.",
      "Aromatherapy for your evenings.",
    ]) {
      const draft = stripUnsupported(line, candle(), "draft");
      expect(draft.text, `draft: ${line}`).toContain(line.split(" ")[1]);
      expect(draft.substantiation.length, `draft note: ${line}`).toBeGreaterThan(0);
      expect(gone(line), `publish: ${line}`).toBe("");
    }
  });

  it("A RECORDED BENEFIT IS THE OWNER'S TO SAY", () => {
    // The whole reason this tier is substantiation and not claim.
    const recorded = candle({
      ownerFacts: [{ category: "customer_feedback", title: "What customers say", content: "Customers tell us they sleep better with the lavender one." }],
    } as any);
    expect(gone("Customers tell us they sleep better.", recorded)).toContain("sleep better");
  });

  it("THE VULNERABLE-GROUP RULE IS A CLAIM, STRICT IN BOTH MODES", () => {
    // The owner's decision, 2026-10-11. The one claim in this class
    // that can hurt somebody, so a draft loses it too.
    for (const mode of ["draft", "publish"] as const) {
      for (const line of ["Non-toxic and safe for babies.", "Hypoallergenic and gentle for sensitive skin."]) {
        expect(gone(line, candle(), mode), `${mode}: ${line}`).toBe("");
      }
    }
  });

  it("and it says why, in words the owner can act on", () => {
    const r = stripUnsupported("Safe for babies.", candle(), "publish");
    expect(r.removed.join(" ")).toMatch(/needs a test behind it/);
  });
});

// ---------------------------------------------------------------------
// 4. WITH NO RECORDS AT ALL
// ---------------------------------------------------------------------

describe("4. the fact-independent layer", () => {
  it("COMPARISONS AND SAFETY CLAIMS STILL GO when nothing can be read", () => {
    // A failed records read must not be a way through. Comparisons
    // bypass `said` anyway, and "safe for babies" with no records is
    // more dangerous, not less.
    for (const line of [
      "Unlike the standard candles on the shelf, ours is steady.",
      "Most candles never hold their scent.",
      "Non-toxic and safe for babies.",
      "What sets it apart from the mass-produced ones.",
    ]) {
      expect(stripUnverifiable(line).text.trim(), line).toBe("");
    }
  });

  it("but the soft benefit tier is NOT applied there, and that is deliberate", () => {
    // There is no substantiation tier with no records: there is nothing
    // to tell the owner to write down, because nothing could be read.
    // Stated as a known limit rather than discovered later.
    expect(stripUnverifiable("Light it an hour before bed and sleep better.").text).toContain("sleep better");
  });

  it("honest copy survives the fact-independent layer too", () => {
    const line = "Evenings get loud. It smells of lavender.";
    expect(stripUnverifiable(line).text.trim()).toBe(line);
  });
});

// ---------------------------------------------------------------------
// 5. THE DRY-RUN SCRIPTS NOW AGREE WITH THE LIVE GUARD
// ---------------------------------------------------------------------
//
// Both scripts stay in the repo: they are the record of what was shown
// to the owner before the decision. Their value afterwards is that they
// can be checked AGAINST the thing that shipped - the same arrangement
// tests/claimTermsDryRun.test.ts has had since 4.2 went live.

import { wouldFlag as comparativeWouldFlag } from "../scripts/comparativeDryRun.mjs";
import { wouldFlag as benefitWouldFlag } from "../scripts/benefitClaimsDryRun.mjs";

const KNOWN = "Candle by Qaaf. Lavender candle. Soy wax, 40 hour burn. 550.";

describe("5. the scripts and the guard do not disagree", () => {
  it("WHAT THE SCRIPT FLAGS, THE GUARD STRIPS", () => {
    for (const line of [
      "What separates a candle made with real fragrance oil from one made with cheap synthetic alternatives.",
      "It fills the room rather than burning off in twenty minutes.",
      "The scent lasts.",
      "Unlike the standard candles on the shelf, ours is steady.",
      "Most candles never hold their scent.",
    ]) {
      expect(comparativeWouldFlag(line, KNOWN).length, `script: ${line}`).toBeGreaterThan(0);
      expect(gone(line), `guard: ${line}`).toBe("");
    }
  });

  it("AND WHAT IT KEEPS, THE GUARD KEEPS", () => {
    for (const line of [
      "Soy wax, 40 hour burn. 550.",
      "Melt, choose your scent, pour. Ninety minutes, one candle that's yours.",
      "Each session runs for two hours.",
    ]) {
      expect(comparativeWouldFlag(line, KNOWN), `script: ${line}`).toEqual([]);
    }
  });

  it("the benefit script agrees too", () => {
    expect(benefitWouldFlag("Light it an hour before bed and sleep better.", KNOWN).length).toBeGreaterThan(0);
    expect(benefitWouldFlag("It smells of lavender and a little vanilla.", KNOWN)).toEqual([]);
    expect(gone("Light it an hour before bed and sleep better.")).toBe("");
  });
});
