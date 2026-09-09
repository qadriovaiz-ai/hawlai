// The ad plan never invents a city, and never invents a car.
//
// THE ONE THAT WOULD HAVE WASTED REAL BUDGET SILENTLY. The plan prompt
// said: "city extracted or null, else Lucknow". So a candle shop in
// Mumbai that did not name a city got a campaign targeted at Lucknow —
// no error, no warning, the whole daily budget spent 1,300km from the
// customers. Wrong targeting does not fail; it just does not work.
//
// The fallback plan (used whenever the model call fails) was worse: a
// ten-model regex invented a car for any business, and the copy talked
// about test drives. Note "city" was itself in that model list — the
// Honda City — so a prompt merely containing the word "city" set the
// advertised product to "city".
//
// Null is a GOOD answer here. resolveLocation reads a null city as
// All India: broad, but never the wrong place.

import { describe, it, expect, vi, afterEach } from "vitest";
import { generateAdPlan } from "@/lib/adEngine";
import { execFileSync } from "child_process";

function committed(file: string): string {
  return execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

afterEach(() => vi.unstubAllGlobals());

/** Forces the fallback path by making the model call fail. */
function modelDown() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ANTHROPIC down")));
}

describe("the fallback plan invents nothing", () => {
  it("returns NO city when the business has none", async () => {
    // Previously "Lucknow". A campaign is better off All-India than
    // confidently pointed at a city nobody named.
    modelDown();
    const plan = await generateAdPlan("diwali sale on scented candles", null, "candles", undefined, null);
    expect(plan.targeting_city).toBeNull();
  });

  it("uses the BUSINESS's own city when it has one", async () => {
    modelDown();
    const plan = await generateAdPlan("diwali sale on scented candles", null, "candles", undefined, "Mumbai");
    expect(plan.targeting_city).toBe("Mumbai");
  });

  it("never returns Lucknow for a business that is not in Lucknow", async () => {
    modelDown();
    for (const city of [null, "Mumbai", "Delhi", "Kochi"]) {
      const plan = await generateAdPlan("candle sale", null, "candles", undefined, city);
      if (city !== "Lucknow") expect(plan.targeting_city).not.toBe("Lucknow");
    }
  });

  it("does not invent a car for a candle shop", async () => {
    modelDown();
    const plan = await generateAdPlan("diwali sale on scented candles", null, "candles", undefined, "Mumbai");
    expect(plan.car_type).toBeNull();
    expect(`${plan.headline} ${plan.body}`.toLowerCase()).not.toMatch(/car|test drive|swift|creta|nexon/);
  });

  it("is not fooled by the word 'city' in the request", async () => {
    // "city" was in the car-model regex — the Honda City. A request
    // saying "candles for the city crowd" advertised a car.
    modelDown();
    const plan = await generateAdPlan("candles for the city crowd", null, "candles", undefined, "Mumbai");
    expect(plan.car_type).toBeNull();
    expect(String(plan.headline).toLowerCase()).not.toContain("city chahiye");
  });

  it("still produces usable copy naming the actual category", async () => {
    // A weak-but-true fallback headline is recoverable. A confidently
    // wrong one about cars is not.
    modelDown();
    const plan = await generateAdPlan("diwali sale", null, "candles", undefined, "Mumbai");
    expect(String(plan.headline).toLowerCase()).toContain("candle");
    expect(String(plan.body)).toContain("Mumbai");
    expect(plan.daily_budget).toBeGreaterThan(0);
  });

  it("degrades gracefully when the category is unknown too", async () => {
    modelDown();
    const plan = await generateAdPlan("sale", null, undefined, undefined, null);
    expect(String(plan.headline).length).toBeGreaterThan(0);
    expect(String(plan.headline).toLowerCase()).not.toMatch(/car|dealership/);
  });
});

describe("the prompt does not instruct a default city either", () => {
  const source = committed("src/lib/adEngine.ts");

  it("no longer tells the model to fall back to Lucknow", () => {
    // The fallback above is the rare path; THIS is the one that runs
    // every time. Fixing only the fallback would have left the real
    // defect in place.
    const code = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/else Lucknow/);
  });

  it("tells the model that null is an acceptable answer", () => {
    expect(source).toMatch(/NEVER invent or guess a city/);
  });

  it("passes the business's own city into the prompt", () => {
    expect(source).toMatch(/\$\{businessCity \? JSON\.stringify\(businessCity\) : "null"\}/);
  });

  it("no default parameter anywhere in the ad engine assumes a car dealership", () => {
    const code = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/= "car dealership"/);
  });
});

describe("the campaign name reflects the actual business", () => {
  it("does not fall back to 'Cars'", () => {
    // Cosmetic, but it is the name the merchant navigates by in Ads
    // Manager — "Hawlai - Cars - 09/09/2026" on a candle campaign.
    const source = committed("src/lib/ads/launchCampaign.ts");
    expect(source).not.toMatch(/car_type \?\? "Cars"/);
    expect(source).toMatch(/business_category \|\| "Campaign"/);
  });
});
