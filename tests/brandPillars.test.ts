// Three pillars offered, two added, nothing said why.
//
// Brand Voice holds six. The limit is real and the dedupe is right — what
// was wrong is that an owner who pressed Add and got two of three had to
// count to find out, and then had no way to know which line was missing
// or whether something had failed.
//
// And one that did land had "₹800" inside it. A pillar is read by every
// generator for as long as it stands, and a price is the fact most likely
// to be wrong by next month.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { pillarsFrom, mergePillars, wouldAdd, MAX_PILLARS } from "@/lib/strategy/pillars";

const advice = (titles: string[]) => ({ statement: "Hand-poured in Shahjahanpur", angles: titles.map((title) => ({ title })) });

describe("what gets offered", () => {
  it("keeps the angles in order", () => {
    const r = pillarsFrom(advice(["Poured by hand", "Small batches", "Made in Shahjahanpur"]));
    expect(r.pillars).toEqual(["Poured by hand", "Small batches", "Made in Shahjahanpur"]);
    expect(r.skipped).toEqual([]);
  });

  it("REFUSES a line with a price in it, and says so", () => {
    const r = pillarsFrom(advice(["Workshops from ₹800", "Poured by hand"]));
    expect(r.pillars).toEqual(["Poured by hand"]);
    expect(r.skipped).toEqual([{ line: "Workshops from ₹800", reason: "it names a price, and a price belongs in your catalogue where it can change" }]);
  });

  it("catches the other ways a price is written", () => {
    for (const line of ["Only Rs 999 a candle", "INR 550 each", "550 rupees per candle", "₹1,299/-"]) {
      expect(pillarsFrom(advice([line])).pillars, line).toEqual([]);
    }
    // A number that is not money is not a price.
    expect(pillarsFrom(advice(["40 hour burn time"])).pillars).toEqual(["40 hour burn time"]);
  });

  it("says which lines fell past the limit rather than dropping them quietly", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    const r = pillarsFrom(advice(seven));
    expect(r.pillars).toHaveLength(MAX_PILLARS);
    expect(r.skipped).toEqual([{ line: "g", reason: `Brand Voice holds ${MAX_PILLARS} pillars and this comparison offered more` }]);
  });
});

describe("adding to what is already there", () => {
  it("THE REPORTED CASE: four saved, three offered, two fit — and it says which one did not", () => {
    const current = ["one", "two", "three", "four"];
    const r = mergePillars(current, ["five", "six", "seven"]);
    expect(r.pillars).toEqual(["one", "two", "three", "four", "five", "six"]);
    expect(r.skipped).toEqual([{ line: "seven", reason: `you already have ${MAX_PILLARS} pillars, which is the most Brand Voice holds` }]);
  });

  it("names a duplicate as a duplicate, not as a limit", () => {
    expect(mergePillars(["Poured by hand"], ["poured by hand"]).skipped).toEqual([
      { line: "poured by hand", reason: "it's already one of your pillars" },
    ]);
  });

  it("leaves a saved pillar alone even if it holds a price", () => {
    // An existing pillar is the owner's. Rewriting one behind their back
    // would be a worse answer than telling them about it.
    const r = mergePillars(["Workshops from ₹800"], ["Poured by hand"]);
    expect(r.pillars).toEqual(["Workshops from ₹800", "Poured by hand"]);
  });

  it("counts what would land BEFORE the owner clicks", () => {
    const before = wouldAdd(["one", "two", "three", "four"], ["five", "six", "seven"]);
    expect(before).toMatchObject({ adding: 2, offered: 3 });
    expect(before.skipped).toHaveLength(1);
    // Nothing to warn about when everything fits.
    expect(wouldAdd(["one"], ["two"]).skipped).toEqual([]);
  });
});

describe("the owner is told", () => {
  const panel = readFileSync("src/components/strategy/PositioningPanel.tsx", "utf8");
  const route = readFileSync("src/app/api/strategy/positioning/pillars/route.ts", "utf8");

  it("the card says how many would land before the click", () => {
    expect(route).toMatch(/wouldAdd: wouldAdd\(current, offered\.pillars\)/);
    expect(panel).toMatch(/would add \{pillars\.wouldAdd\.adding\} of \{pillars\.wouldAdd\.offered\}/);
  });

  it("and lists what did not, with the reason, after it", () => {
    expect(route).toMatch(/skipped: merged\.skipped/);
    expect(panel).toMatch(/Not added/);
  });
});
