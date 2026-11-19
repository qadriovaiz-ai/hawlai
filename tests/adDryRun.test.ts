// Ask Meta, instead of guessing what Meta will do — 19 November 2026.
//
// Every rule in preflight.ts is this codebase's own guess about what
// Meta accepts. `execution_options: ["validate_only"]` runs the full
// validation and performs NO mutation, so the answer is Meta's and
// nothing is created or spent. With `synchronous_ad_review` alongside
// it — which Meta says must never be used alone — the same call runs
// the Ads Integrity checks: message language, the image text rule, the
// policy logic that otherwise surfaces as a DISAPPROVED ad hours after
// launch, with the owner's money already committed.
//
// THE ONE WAY TO GET THIS WRONG is to treat "I could not ask" as "the
// answer was no". Meta being briefly unreachable must not stop a launch
// that would have worked. So there are three outcomes and
// `inconclusive` is never a pass.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  dryRun,
  dryRunMessage,
  executionOptions,
  VALIDATE_ONLY,
  SYNCHRONOUS_AD_REVIEW,
} from "@/lib/ads/dryRun";
import { code } from "./helpers/source";

const LAUNCH = "src/lib/ads/launchCampaign.ts";

function metaReplies(status: number, body: Record<string, any>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as any);
}

/** The JSON body of the first fetch call. */
function sentBody(spy: any): any {
  return JSON.parse(spy.mock.calls[0][1].body);
}

afterEach(() => vi.restoreAllMocks());

describe("1. VALIDATE_ONLY IS ALWAYS SENT, AND CANNOT BE REMOVED", () => {
  it("THE LOAD-BEARING ONE: every options array contains validate_only", () => {
    // This is the entire difference between asking and doing. There is
    // no argument to executionOptions that produces an array without it.
    expect(executionOptions()).toContain(VALIDATE_ONLY);
    expect(executionOptions({ review: true })).toContain(VALIDATE_ONLY);
    expect(executionOptions({ review: false })).toContain(VALIDATE_ONLY);
  });

  it("AND THE ACTUAL CALL CARRIES IT", async () => {
    const spy = metaReplies(200, { id: "x" });
    await dryRun("act_1/campaigns", { name: "n" }, "T", { stage: "campaign" });
    expect(sentBody(spy).execution_options).toContain(VALIDATE_ONLY);
  });

  it("SYNCHRONOUS_AD_REVIEW NEVER APPEARS WITHOUT IT", () => {
    // Meta's rule, and the stake is real: alone it would mean a genuine
    // creation that is also reviewed.
    for (const opts of [executionOptions(), executionOptions({ review: true }), executionOptions({ review: false })]) {
      if (opts.includes(SYNCHRONOUS_AD_REVIEW)) expect(opts).toContain(VALIDATE_ONLY);
    }
    expect(executionOptions({ review: true })).toEqual([VALIDATE_ONLY, SYNCHRONOUS_AD_REVIEW]);
    expect(executionOptions()).toEqual([VALIDATE_ONLY]);
  });

  it("A CALLER'S PARAMS CANNOT OVERWRITE THE OPTIONS", async () => {
    // The spread order is load-bearing. A stray execution_options key
    // in a spec would otherwise turn a validation into a real creation,
    // silently, and the only sign would be an ad that exists.
    const spy = metaReplies(200, { id: "x" });
    await dryRun("act_1/ads", { name: "n", execution_options: [] } as any, "T", { stage: "ad" });
    expect(sentBody(spy).execution_options).toEqual([VALIDATE_ONLY]);
  });

  it("the review flag is only ever asked for where there is a creative", () => {
    // Language and image-text judgements are about the AD. A campaign
    // carries no copy and no image.
    const src = code(LAUNCH);
    const at = src.indexOf('stage: "ad", review: true');
    expect(at).toBeGreaterThan(-1);
    expect(src).not.toMatch(/stage: "campaign", review: true/);
    expect(src).not.toMatch(/stage: "adset", review: true/);
  });
});

describe("2. META SAYING NO IS NOT META BEING UNREACHABLE", () => {
  it("A POLICY REFUSAL IS A REFUSAL, in Meta's own words", async () => {
    metaReplies(400, { error: { message: "Your ad text contains too much text in the image.", code: 1815869, type: "OAuthException" } });
    const r = await dryRun("act_1/ads", { name: "n" }, "T", { stage: "ad", review: true });
    expect(r.ok).toBe(false);
    expect(r.inconclusive).toBe(false);
    expect(r.reason).toMatch(/too much text/i);
  });

  it("THE LOAD-BEARING ONE: a 500 is INCONCLUSIVE, never a pass and never a refusal", async () => {
    // Treating this as a refusal would block launches every time Meta
    // hiccuped; treating it as a pass would be a lie. It is its own
    // state, and the launch proceeds.
    metaReplies(500, { error: { message: "An unexpected error has occurred.", code: 2 } });
    const r = await dryRun("act_1/campaigns", { name: "n" }, "T", { stage: "campaign" });
    expect(r.ok).toBe(false);
    expect(r.inconclusive).toBe(true);
  });

  it("AND SO IS A NETWORK FAILURE — it never throws mid-launch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const r = await dryRun("act_1/campaigns", { name: "n" }, "T", { stage: "campaign" });
    expect(r.ok).toBe(false);
    expect(r.inconclusive).toBe(true);
  });

  it("a clean 200 is the only pass", async () => {
    metaReplies(200, { id: "123" });
    expect(await dryRun("act_1/campaigns", { name: "n" }, "T", { stage: "campaign" })).toEqual({
      ok: true,
      inconclusive: false,
      reason: null,
    });
  });

  it("A 200 CARRYING AN ERROR IS NOT A PASS", async () => {
    // Graph answers 200 with an error body often enough that this is
    // the realistic failure, not the 400.
    metaReplies(200, { error: { message: "Invalid parameter", code: 100 } });
    expect((await dryRun("act_1/adsets", { name: "n" }, "T", { stage: "adset" })).ok).toBe(false);
  });
});

describe("3. WHAT THE OWNER IS TOLD", () => {
  it("A REFUSAL SAYS META'S REASON AND THAT NOTHING EXISTS", async () => {
    metaReplies(400, { error: { message: "promoted_object is required.", code: 100 } });
    const r = await dryRun("act_1/adsets", {}, "T", { stage: "adset" });
    const msg = dryRunMessage(r, "ad set")!;
    expect(msg).toMatch(/promoted_object is required/);
    expect(msg).toMatch(/Nothing was created/);
  });

  it("AN INCONCLUSIVE RUN SAYS NOTHING AT ALL", async () => {
    // It is not a problem to report. The launch carries on, and
    // inventing a warning would train the owner to ignore real ones.
    metaReplies(500, { error: { message: "boom", code: 2 } });
    expect(dryRunMessage(await dryRun("act_1/ads", {}, "T", { stage: "ad" }), "ad")).toBeNull();
  });

  it("and a pass says nothing", () => {
    expect(dryRunMessage({ ok: true, inconclusive: false, reason: null }, "campaign")).toBeNull();
  });
});

describe("4. IT RUNS BEFORE THE THING IT VALIDATES", () => {
  const src = () => code(LAUNCH);

  it("THE CAMPAIGN IS VALIDATED BEFORE IT IS CREATED", () => {
    // The only dry run that can prevent everything: a campaign has no
    // parent, so a refusal here leaves nothing behind at all.
    const s = src();
    const check = s.indexOf('dryRun(`${adAccount}/campaigns`');
    const create = s.indexOf("const campaignRes = await metaPost(");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("SO IS THE AD SET", () => {
    const s = src();
    const check = s.indexOf('dryRun(`${adAccount}/adsets`');
    const create = s.indexOf("const adsetRes = await metaPost(");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("AND SO IS THE AD", () => {
    const s = src();
    const check = s.indexOf('dryRun(`${adAccount}/ads`');
    const create = s.indexOf("const adRes = await metaPost(");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("THE LOAD-BEARING ONE: ONE SPEC OBJECT IS VALIDATED AND THEN CREATED", () => {
    // Two separately written bodies would drift, and a dry run that
    // validates a different campaign from the one being made reports a
    // pass for something never checked — worse than no dry run at all.
    const s = src();
    expect(s).toMatch(/const campaignSpec = \{/);
    expect(s).toMatch(/const adsetSpec = \{/);
    expect(s).toMatch(/const adSpec = \{/);
    expect(s).toMatch(/metaPost\(`\$\{adAccount\}\/campaigns`, campaignSpec, pageAccessToken\)/);
    expect(s).toMatch(/metaPost\(`\$\{adAccount\}\/adsets`, adsetSpec, pageAccessToken\)/);
    expect(s).toMatch(/metaPost\(`\$\{adAccount\}\/ads`, adSpec, pageAccessToken\)/);
  });

  it("AN INCONCLUSIVE CHECK DOES NOT STOP THE LAUNCH", () => {
    // Each guard refuses only on a definite no. Being unable to reach
    // Meta for a validation call is not a reason to refuse — the same
    // rule adAccountLimits already states.
    const s = src();
    for (const name of ["campaignCheck", "adsetCheck", "adCheck"]) {
      expect(s).toContain(`if (!${name}.ok && !${name}.inconclusive) {`);
    }
  });
});
