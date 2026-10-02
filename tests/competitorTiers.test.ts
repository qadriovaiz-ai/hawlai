// A competitor you can actually be compared with.
//
// A two-product candle maker in Shahjahanpur was shown EKAM — a national
// brand in hundreds of stores — as a "competitor", and the comparison
// then measured the shop against it claim for claim. The prompt already
// asked for "small and mid-sized sellers", which is a preference the
// model is free to ignore, and did.
//
// So the model proposes a grouping and the code checks it against the
// size evidence the search actually reported. No extra searches: both
// lists come back from the one call that was already being made.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { readsAsNational } from "@/lib/strategy/positioning/collect";

describe("reading the size evidence", () => {
  it("calls a brand in many stores national", () => {
    expect(readsAsNational("stocked in 400+ stores across India")).toBe(true);
    expect(readsAsNational("available in 60 outlets")).toBe(true);
    expect(readsAsNational("pan-India delivery and 12 showrooms")).toBe(true);
  });

  it("catches funding and the big marketplaces", () => {
    expect(readsAsNational("raised a seed round of 8 crore")).toBe(true);
    expect(readsAsNational("sells on Nykaa and Amazon")).toBe(true);
    expect(readsAsNational("a franchise chain")).toBe(true);
  });

  it("leaves a small seller alone", () => {
    expect(readsAsNational("only an Instagram shop")).toBe(false);
    expect(readsAsNational("one studio in Lucknow")).toBe(false);
    expect(readsAsNational("three outlets in Pune")).toBe(false);
    expect(readsAsNational("nothing found")).toBe(false);
    expect(readsAsNational(null)).toBe(false);
  });

  it("does not mistake a small number for a big one", () => {
    // "3 stores" is a neighbour; "300 stores" is not. The pattern wants
    // two digits or more.
    expect(readsAsNational("3 stores in the city")).toBe(false);
    expect(readsAsNational("300 stores")).toBe(true);
  });
});

describe("how the two tiers are built", () => {
  const collect = readFileSync("src/lib/strategy/positioning/collect.ts", "utf8");

  it("asks for both lists in ONE call, with no extra searches", () => {
    expect(collect).toMatch(/"comparable":\s*in or near the same city/);
    expect(collect).toMatch(/"national":\s*brands this owner will see everywhere/);
    // Still the one discovery call, still capped as it was.
    expect(collect).toMatch(/max_uses: DISCOVERY_SEARCHES/);
    // Two INVOCATIONS, as before: discovery and the per-competitor
    // claims read. (A bare count also matches the function's own
    // definition, which is how this first read as three.)
    expect((collect.match(/await searchCall\(/g) ?? []).length).toBe(2);
  });

  it("demands the evidence rather than the conclusion", () => {
    expect(collect).toMatch(/report what you actually found about its SIZE/);
    expect(collect).toMatch(/Do not guess it; the grouping is checked against what you write there/);
  });

  it("OVERRIDES the model's grouping when the evidence disagrees", () => {
    expect(collect).toMatch(/batch\.claimed === "national" \|\| readsAsNational\(scaleEvidence\)/);
  });

  it("still reads an older flat response", () => {
    // The model is not always on the version of the prompt you think.
    expect(collect).toMatch(/rows: \(parsed as any\)\?\.competitors, claimed: "comparable"/);
  });
});

describe("what the owner sees", () => {
  it("the comparison uses comparable competitors only", () => {
    const run = readFileSync("src/lib/strategy/positioning/run.ts", "utf8");
    expect(run).toMatch(/COMPARABLE ONLY in the comparison/);
    expect(run).toMatch(/const nationalBrands = \(discovery\.national \?\? \[\]\)/);
    // The national list is stored, not thrown away.
    expect(run).toMatch(/nationalBrands,/);
    // And NEVER merged into the compared set — putting it back there is
    // the whole bug, and a test that only looked for the line above
    // missed exactly that mutation.
    for (const call of run.match(/mergeCompetitors\([^;]*?\)/g) ?? []) {
      expect(call, call).not.toContain("discovery.national");
    }
  });

  it("the national brands get a collapsed line that says why", () => {
    const panel = readFileSync("src/components/strategy/PositioningPanel.tsx", "utf8");
    expect(panel).toMatch(/Who you&apos;ll see everywhere/);
    expect(panel).toMatch(/matching them claim for\s*\n?\s*claim would tell you nothing you can act on/);
    expect(panel).toMatch(/<details/);
  });
});
