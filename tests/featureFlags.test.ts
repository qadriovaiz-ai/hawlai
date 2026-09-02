// Feature kill switches — restored from the throwaway harness written
// when the switches were built (commit 7b1d9ee). 8 assertions.
//
// The load-bearing one is the BYPASS ordering: BYPASS_PLAN_GATING
// exists to ignore what a customer paid for, not to resurrect a
// feature the product switched off. If hasFeature ever checks the
// bypass before the kill switch, any demo environment silently brings
// 3D Studio back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.BYPASS_PLAN_GATING;
  delete process.env.NEXT_PUBLIC_STUDIO_3D_ENABLED;
  delete process.env.NEXT_PUBLIC_VIDEO_GENERATION_ENABLED;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

// Imported inside each test: featureFlags reads process.env at call
// time, but a module-level import would still bind before beforeEach
// on some orderings. Dynamic import keeps the env mutation ordering
// unambiguous.
async function load() {
  return {
    flags: await import("@/lib/featureFlags"),
    plans: await import("@/lib/plans"),
  };
}

describe("feature kill switches", () => {
  it("default to OFF when the variable is absent", async () => {
    const { flags } = await load();
    expect(flags.isFeatureEnabled("studio3d")).toBe(false);
    expect(flags.isFeatureEnabled("videoGeneration")).toBe(false);
  });

  it("only the exact string \"true\" enables a feature", async () => {
    process.env.NEXT_PUBLIC_STUDIO_3D_ENABLED = "TRUE";
    const { flags } = await load();
    // Guards against a misspelled or differently-cased value reading
    // as enabled — the whole point of failing closed.
    expect(flags.isFeatureEnabled("studio3d")).toBe(false);
  });

  it("flags are independent of each other", async () => {
    process.env.NEXT_PUBLIC_STUDIO_3D_ENABLED = "true";
    const { flags } = await load();
    expect(flags.isFeatureEnabled("studio3d")).toBe(true);
    expect(flags.isFeatureEnabled("videoGeneration")).toBe(false);
  });
});

describe("kill switch vs plan gating", () => {
  const paidLimits: any = { threeDStudio: true, retargeting: true };

  it("a killed feature is denied even to a plan that includes it", async () => {
    const { plans } = await load();
    expect(plans.hasFeature(paidLimits, "threeDStudio")).toBe(false);
  });

  it("an unrelated gated feature is unaffected", async () => {
    const { plans } = await load();
    expect(plans.hasFeature(paidLimits, "retargeting")).toBe(true);
  });

  it("BYPASS_PLAN_GATING cannot resurrect a killed feature", async () => {
    process.env.BYPASS_PLAN_GATING = "true";
    const { plans } = await load();
    expect(plans.hasFeature(paidLimits, "threeDStudio")).toBe(false);
  });

  it("BYPASS_PLAN_GATING still works for features with no kill switch", async () => {
    process.env.BYPASS_PLAN_GATING = "true";
    const { plans } = await load();
    expect(plans.hasFeature({} as any, "retargeting")).toBe(true);
  });

  it("re-enabling restores the ORIGINAL plan gate rather than opening it to all tiers", async () => {
    process.env.NEXT_PUBLIC_STUDIO_3D_ENABLED = "true";
    const { plans } = await load();
    expect(plans.hasFeature(paidLimits, "threeDStudio")).toBe(true);
    expect(plans.hasFeature({ threeDStudio: false } as any, "threeDStudio")).toBe(false);
  });
});
