// The proposed comparative and performance rules are a DRY RUN.
//
// Same arrangement as claimTermsDryRun.test.ts: the proposal is
// executable so its output can be read before it is trusted, and this
// file fails the moment someone wires it into the live guard without
// the owner's word. 4.2 went through this gate and was the better for
// it - the dry run is where I found that my own synonym list flagged
// an honest CRO suggestion.

import { describe, it, expect } from "vitest";
import { PROPOSED, wouldFlag } from "../scripts/comparativeDryRun.mjs";
import { code } from "./helpers/source";

const KNOWN = [
  "Candle by Qaaf. Home fragrance, Shahjahanpur.",
  "Lavender candle. Soy wax, 40 hour burn. 550.",
  "Har candle 24 ghante set hoti hai.",
].join("\n");

describe("the proposal is NOT live", () => {
  it("IT IS NOT WIRED INTO THE CLAIMS LAYER", () => {
    const claims = code("src/lib/claims/claimCheck.ts");
    expect(claims).not.toMatch(/comparativeDryRun/);
    expect(claims).not.toMatch(/separates\s\+\w\+\s\+apart/);
  });

  it("NOTHING IN src IMPORTS THE SCRIPT", () => {
    // A dry run that something in the app imports is not a dry run.
    for (const f of ["src/lib/claims/claimCheck.ts", "src/lib/claims/factsGate.ts", "src/lib/agents/contentMarketingAgent.ts"]) {
      expect(code(f), f).not.toMatch(/scripts\/comparativeDryRun/);
    }
  });
});

describe("what the proposal would catch", () => {
  it("THE THREE LIVE SENTENCES", () => {
    // The ones that survived the 11 October post.
    expect(wouldFlag("What separates a candle made with real fragrance oil from one made with cheap synthetic alternatives.", KNOWN).length).toBeGreaterThan(0);
    expect(wouldFlag("It fills the room rather than burning off in twenty minutes.", KNOWN).length).toBeGreaterThan(0);
    expect(wouldFlag("The scent lasts.", KNOWN).length).toBeGreaterThan(0);
  });

  it("the comparative forms the owner named", () => {
    for (const line of [
      "Unlike most candles, ours is steady.",
      "Most candles don't hold their scent.",
      "Not the cheap factory-made stuff.",
      "What sets it apart from the mass-produced ones.",
    ]) {
      expect(wouldFlag(line, KNOWN).length, line).toBeGreaterThan(0);
    }
  });

  it("A RECORDED DURATION IS NOT FLAGGED — the cost side", () => {
    expect(wouldFlag("Soy wax, 40 hour burn. 550.", KNOWN)).toEqual([]);
    expect(wouldFlag("Har candle 24 ghante set hoti hai.", KNOWN)).toEqual([]);
  });

  it("honest copy about the reader is left alone", () => {
    for (const line of [
      "Evenings get loud. Light one at eight and the room slows down.",
      "Lavender candle, 550. Ships across Shahjahanpur.",
    ]) {
      expect(wouldFlag(line, KNOWN), line).toEqual([]);
    }
  });

  it("every proposed rule carries a reason the owner can read", () => {
    for (const rule of PROPOSED) {
      expect(rule.why, rule.name).toBeTruthy();
      expect(rule.why).not.toMatch(/regex|pattern|rule \d/i);
    }
  });
});
