// A candle shop was targeted at "Electronic music" — 19 November 2026.
//
// 1.1 to 1.4 million people, paid for, on a ₹100/day budget.
//
// THREE LINES OF AGREEMENT BETWEEN TWO REASONABLE THINGS. The interest
// search ran with `limit=1`, `data[0]` was accepted WITH NO RELEVANCE
// CHECK, and what it searched was `concerns` — pain-point phrases from
// the brand persona like "relaxation" or "ambience", which are not
// interest-category names and never were. Meta's search did its job. It
// was asked a question it cannot answer, and whatever came back first
// became paid targeting.
//
// THE FIX WAS ALREADY IN THE SAME FILE, TEN LINES BELOW.
// resolveIncomeBracket calls the same endpoint and refuses a match that
// does not read like an income bracket, with a comment saying that
// silently targeting "luxury cars" for "high income" would be worse
// than omitting income entirely. The principle was written down; it had
// just never been applied to the field that spends money.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveInterests,
  isRelevantInterest,
  meaningfulWords,
  INTEREST_CANDIDATES,
  MIN_WORD,
} from "@/lib/ads/metaTargeting";
import { code } from "./helpers/source";

/** The business from the incident. */
const CANDLES = ["Lavender Soy Candle", "Scented candles", "Home fragrance"];

function metaReturns(names: string[]) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: names.map((name, i) => ({ id: String(100 + i), name })) }),
  } as any);
}

afterEach(() => vi.restoreAllMocks());

describe("1. THE INCIDENT, AS A TEST", () => {
  it("THE LOAD-BEARING ONE: 'Electronic music' never reaches a candle business again", async () => {
    // Exactly what Meta returned for a pain-point phrase. Ranked first,
    // and now refused.
    metaReturns(["Electronic music (music)", "Music", "Nightlife"]);
    expect(await resolveInterests(["relaxation"], CANDLES, "T")).toEqual([]);
  });

  it("AND THE FIRST RESULT IS NEVER TAKEN ON TRUST", async () => {
    // The relevant one is third. With limit=1 it was unreachable, and
    // with no check the first was taken regardless — the two halves of
    // the defect, both fixed.
    metaReturns(["Electronic music (music)", "Nightlife", "Scented candle"]);
    const out = await resolveInterests(["relaxation"], CANDLES, "T");
    expect(out.map((i) => i.name)).toEqual(["Scented candle"]);
  });

  it("IT ASKS FOR A LIST, NOT ONE", async () => {
    const spy = metaReturns(["Candle"]);
    await resolveInterests(["candles"], CANDLES, "T");
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`limit=${INTEREST_CANDIDATES}`);
    expect(url).not.toContain("limit=1&");
    expect(INTEREST_CANDIDATES).toBeGreaterThan(1);
  });

  it("a genuinely relevant interest is still applied", async () => {
    // The fix must not simply turn interests off — that would be a
    // different kind of wrong.
    metaReturns(["Scented candles", "Electronic music (music)"]);
    const out = await resolveInterests(["scented candles"], CANDLES, "T");
    expect(out.map((i) => i.name)).toEqual(["Scented candles"]);
  });
});

describe("2. NOTHING RELEVANT MEANS NO INTEREST AT ALL", () => {
  it("THE LOAD-BEARING ONE: an empty list, not a best guess", async () => {
    // Broad targeting. At a small daily budget it is the better answer
    // anyway, and it is always better than a wrong one.
    metaReturns(["Nightlife", "Travel", "Cricket"]);
    expect(await resolveInterests(["ambience", "mood"], CANDLES, "T")).toEqual([]);
  });

  it("META RETURNING NOTHING IS NOT AN ERROR", async () => {
    metaReturns([]);
    expect(await resolveInterests(["candles"], CANDLES, "T")).toEqual([]);
  });

  it("A FAILED SEARCH IS NOT A WRONG INTEREST", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await resolveInterests(["candles"], CANDLES, "T")).toEqual([]);
  });

  it("NO VOCABULARY MEANS NOTHING CAN BE JUDGED, SO NOTHING IS APPLIED", async () => {
    // A business with no products on record has said nothing for a
    // candidate to resemble. Applying interests anyway would be the
    // original bug with extra steps.
    metaReturns(["Scented candles"]);
    expect(await resolveInterests(["candles"], [], "T")).toEqual([]);
  });

  it("and no search terms means no search", async () => {
    const spy = metaReturns(["Candle"]);
    expect(await resolveInterests([], CANDLES, "T")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("3. WHAT COUNTS AS RELEVANT", () => {
  it("ONE SHARED MEANINGFUL WORD IS THE TEST", () => {
    expect(isRelevantInterest("Scented candle", CANDLES)).toBe(true);
    expect(isRelevantInterest("Electronic music", CANDLES)).toBe(false);
  });

  it("SINGULAR AND PLURAL ARE THE SAME INTEREST", () => {
    // "candles" against "Candle" is the one match that mattered, and a
    // naive compare rejects it.
    expect(isRelevantInterest("Candle", ["Scented candles"])).toBe(true);
    expect(isRelevantInterest("Candles", ["Scented candle"])).toBe(true);
  });

  it("A TRAILING 'ss' IS LEFT ALONE", () => {
    // Otherwise "business" becomes "busines" and matches nothing.
    expect(meaningfulWords("business")).toEqual(["business"]);
    expect(meaningfulWords("glasses")).toEqual(["glasse"]);
  });

  it("STRUCTURAL WORDS CARRY NO MEANING", () => {
    // "Food and drink" must not match "Art and craft" on the word
    // "and" — a match on a conjunction is a match on nothing.
    expect(isRelevantInterest("Art and craft", ["Food and drink"])).toBe(false);
    expect(meaningfulWords("the and for with")).toEqual([]);
  });

  it("SHORT WORDS ARE NOISE", () => {
    expect(meaningfulWords("a an go to")).toEqual([]);
    expect(MIN_WORD).toBeGreaterThanOrEqual(3);
  });

  it("CASE AND PUNCTUATION DO NOT DECIDE ANYTHING", () => {
    expect(isRelevantInterest("CANDLE-MAKING (hobby)", ["candles"])).toBe(true);
  });

  it("IT IS CRUDE IN THE SAFE DIRECTION", () => {
    // A near-miss is rejected and the ad goes out broad, which costs
    // nothing. The failure being stopped shares no word with anything
    // the business ever said.
    expect(isRelevantInterest("Interior design", ["home decor"])).toBe(false);
  });
});

describe("4. IT SEARCHES THE BUSINESS'S REAL WORDS", () => {
  it("THE VOCABULARY COMES FROM PRODUCT RECORDS, NOT THE AD COPY", () => {
    // A model wrote the headline. Letting it vouch for an interest
    // would mean a generic line could justify anything.
    const src = code("src/lib/ads/launchCampaign.ts");
    const at = src.indexOf("const vocabulary = [");
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 300);
    expect(block).toMatch(/catalogue/);
    expect(block).toMatch(/business_category/);
    expect(block).not.toMatch(/plan\.headline|plan\.body/);
  });

  it("A CATALOGUE THAT CANNOT BE READ DOES NOT FAIL THE LAUNCH", () => {
    // An ad the owner approved must not die because a products query
    // did. It means this run cannot judge relevance, so no interest is
    // applied and the ad goes out broad — the safe direction, and the
    // one a small budget wants anyway.
    //
    // Found by the suite: the first version had no guard, and the two
    // launch tests went from passing to a 500.
    const src = code("src/lib/ads/launchCampaign.ts");
    const at = src.indexOf('.from("products")');
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toMatch(/try \{/);
    expect(src.slice(at, at + 500)).toMatch(/catch \{/);
    expect(src.slice(at, at + 500)).toMatch(/launch\.catalogue_unreadable/);
  });

  it("ONLY ACTIVE PRODUCTS", () => {
    const src = code("src/lib/ads/launchCampaign.ts");
    const at = src.indexOf('.from("products")');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 220)).toMatch(/\.eq\("is_active", true\)/);
  });

  it("AND THE REAL WORDS ARE SEARCHED BEFORE THE PAIN POINTS", () => {
    // concerns are what produced the incident. They stay as extra
    // queries, but they no longer lead.
    // SLICED TO buildMetaTargeting FIRST. `resolveInterests(` matches
    // its own export declaration, which comes earlier in the file — an
    // indexOf on the bare name lands on the definition and never on the
    // call. That is the fourth time this exact miss has cost a test in
    // this codebase.
    const src = code("src/lib/ads/metaTargeting.ts");
    const fn = src.indexOf("export async function buildMetaTargeting");
    expect(fn).toBeGreaterThan(-1);
    const at = src.indexOf("resolveInterests(", fn);
    expect(at).toBeGreaterThan(fn);
    const call = src.slice(at, at + 260);
    expect(call.indexOf("input.vocabulary")).toBeLessThan(call.indexOf("persona?.concerns"));
  });
});

describe("5. RULE 3 — NO TRADE WORDS ENTERED THE CODE", () => {
  it("THE CHECK COMPARES TWO RUNTIME STRINGS", () => {
    // The whole design rests on this. A list of product words here
    // would be one business's vocabulary applied to all of them, which
    // is what multiTenantVocabulary.test.ts exists to stop.
    const src = code("src/lib/ads/metaTargeting.ts");
    const at = src.indexOf("export function isRelevantInterest");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, at + 400);
    expect(fn).toMatch(/vocabulary/);
    for (const trade of ["candle", "lavender", "saree", "mithai", "car", "music"]) {
      expect(fn.toLowerCase()).not.toContain(trade);
    }
  });

  it("AND THE STRUCTURAL LIST IS STRUCTURAL", () => {
    // Articles and conjunctions only. A list of "generic business
    // words" would be a judgement about what businesses are like.
    const src = code("src/lib/ads/metaTargeting.ts");
    const at = src.indexOf("const STRUCTURAL = new Set(");
    expect(at).toBeGreaterThan(-1);
    const list = src.slice(at, src.indexOf("]", at));
    for (const trade of ["shop", "store", "service", "product", "online", "best"]) {
      expect(list).not.toContain(`"${trade}"`);
    }
  });
});
