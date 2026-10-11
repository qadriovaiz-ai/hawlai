// The comparative and performance rules WENT LIVE on 2026-10-11.
//
// This file was the gate that kept them out until the owner had read
// the dry run. That gate has done its job and the decision is made, so
// the assertions here are inverted: they now check that the rules are
// live and that the script still describes what shipped. The
// behavioural assertions live in tests/comparativeAndBenefitClaims.ts.
//
// TWO HONEST NOTES ABOUT THIS FILE'S HISTORY.
//
// 1. Its "IT IS NOT WIRED INTO THE CLAIMS LAYER" assertion was
//    TOOTHLESS from the day I wrote it. It read:
//
//        expect(claims).not.toMatch(/separates\s\+\w\+\s\+apart/)
//
//    which looks for a literal "+" character, and the rule says
//    `sets\s+\w+\s+apart`. It passed with the rules fully enabled. The
//    import check beside it was real and did work.
//
// 2. The script was WRONG about one whole category and the repo's own
//    tests caught it, not this file. The first SPELLED_DURATION flagged
//    any spelled-out duration, and tests/preferredLanguage.test.ts went
//    red on "Ninety minutes, one candle that's yours" - a candle-making
//    workshop. A service's length is the central fact of that service,
//    not a performance claim. Every fixture in the dry run was a
//    product burn time, so the category was invisible to it.
//
// Both notes are the same lesson: a test that greps source proves less
// than a test that runs the thing.

import { describe, it, expect } from "vitest";
import { PROPOSED, wouldFlag } from "../scripts/comparativeDryRun.mjs";
import { stripUnsupported } from "@/lib/claims/claimCheck";
import { code } from "./helpers/source";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

const KNOWN = [
  "Candle by Qaaf. Home fragrance, Shahjahanpur.",
  "Lavender candle. Soy wax, 40 hour burn. 550.",
  "Har candle 24 ghante set hoti hai.",
].join("\n");

function candle(): BusinessFacts {
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
    ownerFacts: [{ category: "business_story", title: "Curing", content: "Har candle 24 ghante set hoti hai." }] as any,
    businessModels: { models: ["products"], inferred: false },
    shipping: { mode: "flat", rate: 60, freeThreshold: null },
    unreadable: [],
  } as unknown as BusinessFacts;
}

describe("the rules are live, and the app still does not import the script", () => {
  it("THE SCRIPT IS STILL NOT IMPORTED BY ANYTHING IN src", () => {
    // This half of the old gate was real and stays real. The rules were
    // reimplemented in claimCheck.ts; the script was not wired in.
    for (const f of [
      "src/lib/claims/claimCheck.ts",
      "src/lib/claims/factsGate.ts",
      "src/lib/agents/contentMarketingAgent.ts",
      "src/lib/agents/emailMarketingAgent.ts",
    ]) {
      expect(code(f), f).not.toMatch(/scripts\/comparativeDryRun/);
    }
  });

  it("AND THE RULES REACH THE GUARD — asserted by running it, not by grep", () => {
    // What the old assertion was trying and failing to express.
    expect(stripUnsupported("What sets it apart from the mass-produced ones.", candle(), "publish").text.trim()).toBe("");
  });
});

describe("the script still describes what shipped", () => {
  it("EVERY PROPOSED RULE IS NOW ENFORCED BY THE REAL GUARD", () => {
    // One line per rule, so a rule that was dropped on the way in shows
    // up here rather than being quietly missing.
    const PER_RULE: Record<string, string> = {
      "separates X from Y": "What separates a good candle from a bad one.",
      "pejorative ATTRIBUTED to the rival": "Not the cheap factory-made ones.",
      "unlike most/other PRODUCTS": "Unlike the standard candles on the shelf, ours is steady.",
      "most/other X don't": "Most candles never hold their scent.",
      "duration attached to a performance verb": "It burns off in twenty minutes.",
      "performance duration": "The scent lasts.",
    };
    expect(Object.keys(PER_RULE).sort()).toEqual(PROPOSED.map((r: any) => r.name).sort());
    for (const [name, line] of Object.entries(PER_RULE)) {
      expect(wouldFlag(line, KNOWN).length, `script, ${name}`).toBeGreaterThan(0);
      expect(stripUnsupported(line, candle(), "publish").text.trim(), `guard, ${name}`).toBe("");
    }
  });

  it("A RECORDED DURATION SURVIVES BOTH", () => {
    expect(wouldFlag("Soy wax, 40 hour burn. 550.", KNOWN)).toEqual([]);
    expect(stripUnsupported("Soy wax, 40 hour burn. 550.", candle(), "publish").text).toContain("40 hour burn");
  });

  it("A SERVICE'S OWN LENGTH SURVIVES BOTH — the category the script missed", () => {
    const line = "Melt, choose your scent, pour. Ninety minutes, one candle that's yours.";
    expect(wouldFlag(line, KNOWN)).toEqual([]);
    expect(stripUnsupported(line, candle(), "publish").text).toContain("Ninety minutes");
  });

  it("honest copy about the reader survives both", () => {
    for (const line of [
      "Evenings get loud. Light one at eight and the room slows down.",
      "Lavender candle, 550. Ships across Shahjahanpur.",
    ]) {
      expect(wouldFlag(line, KNOWN), line).toEqual([]);
      expect(stripUnsupported(line, candle(), "publish").text.trim(), line).toBe(line);
    }
  });

  it("every proposed rule carries a reason the owner can read", () => {
    for (const rule of PROPOSED) {
      expect(rule.why, rule.name).toBeTruthy();
      expect(rule.why).not.toMatch(/regex|pattern|rule \d/i);
    }
  });
});
