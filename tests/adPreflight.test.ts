// Everything that would stop this ad, said at once — 19 November 2026.
//
// The checks all existed and each lived somewhere else: the account in
// the adlaunch route body, the budget floor in adAccountLimits, the
// destination in destination.ts, the radius floor inside the targeting
// builder. Each door got a different subset, and every one returned on
// the FIRST failure.
//
// So an owner with no payment method, no website and no Instant Form
// learned one of those per attempt. Three tries to find out three
// things that were all knowable at the start.
//
// THE TEST THAT MATTERS IS "ALL THREE AT ONCE". Every single-fault
// fixture below passes just as well against a first-failure-wins
// implementation, which is the thing being replaced.

import { describe, it, expect } from "vitest";
import { preflight, preflightMessage, budgetRaisedNote, AGE_MIN, AGE_MAX } from "@/lib/ads/preflight";
import { code } from "./helpers/source";

const HEALTHY = { usable: true, reason: "Active." };
const CONNECTED = { pageId: "P1", adAccountId: "act_1", token: "T", leadFormId: "LF1" };
const WEBSITE = {
  ok: true as const,
  destination: { kind: "external_website", url: "https://shop.example", optimizationGoal: "LINK_CLICKS", promotedObject: null },
};
const GEO = { geo_locations: { cities: [{ key: "lucknow", radius: 25 }] } };

/** A launch with nothing wrong with it. */
const fine = () => ({
  account: HEALTHY,
  connection: CONNECTED,
  destination: WEBSITE,
  budget: { requestedMinor: 10000, minimumMinor: 4000, currency: "INR" },
  creative: { headline: "Lavender", body: "Hand poured", imageBytes: 1024 },
  targeting: { targeting: { ...GEO, age_min: 24, age_max: 40 }, specialAdCategory: "NONE" },
});

const keys = (input: any) => preflight(input).problems.map((p) => p.key);

describe("1. A LAUNCH WITH NOTHING WRONG PASSES", () => {
  it("no problems, and the budget comes back usable", () => {
    const r = preflight(fine());
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.budgetMinor).toBe(10000);
    expect(r.budgetRaised).toBe(false);
  });

  it("AND preflightMessage SAYS NOTHING when there is nothing to say", () => {
    expect(preflightMessage(preflight(fine()))).toBeNull();
  });
});

describe("2. ONE FAILING FIXTURE PER RULE", () => {
  it("UNUSABLE ACCOUNT — and in Meta's own words", () => {
    const r = preflight({ ...fine(), account: { usable: false, reason: "This ad account has an unsettled balance." } });
    expect(r.problems.map((p) => p.key)).toEqual(["account_unusable"]);
    // The reason is carried through, not replaced with a generic line.
    expect(r.problems[0].message).toMatch(/unsettled balance/);
  });

  it("NO PAGE", () => {
    expect(keys({ ...fine(), connection: { ...CONNECTED, pageId: null } })).toEqual(["no_page"]);
  });

  it("NO AD ACCOUNT", () => {
    expect(keys({ ...fine(), connection: { ...CONNECTED, adAccountId: "" } })).toEqual(["no_ad_account"]);
  });

  it("NO TOKEN", () => {
    expect(keys({ ...fine(), connection: { ...CONNECTED, token: null } })).toEqual(["no_token"]);
  });

  it("UNRESOLVED DESTINATION carries the resolver's own reason", () => {
    const r = preflight({ ...fine(), destination: { ok: false, reason: "That product has no public page." } });
    expect(r.problems.map((p) => p.key)).toEqual(["destination_unresolved"]);
    expect(r.problems[0].message).toBe("That product has no public page.");
  });

  it("NO DESTINATION URL on a website ad", () => {
    expect(keys({ ...fine(), destination: { ok: true, destination: { ...WEBSITE.destination, url: null } } })).toEqual([
      "no_destination_url",
    ]);
  });

  it("NO LEAD FORM on an instant-form ad", () => {
    const instant = {
      ok: true as const,
      destination: { kind: "instant_form", url: null, leadFormId: null, optimizationGoal: "LEAD_GENERATION", promotedObject: { page_id: "P1" } },
    };
    expect(keys({ ...fine(), connection: { ...CONNECTED, leadFormId: null }, destination: instant })).toEqual(["no_lead_form"]);
  });

  it("AN INSTANT FORM NEEDS NO URL — the ad stays inside Facebook", () => {
    // The no_destination_url rule must not fire here, or every lead ad
    // becomes unlaunchable.
    const instant = {
      ok: true as const,
      destination: { kind: "instant_form", url: null, leadFormId: "LF1", optimizationGoal: "LEAD_GENERATION", promotedObject: { page_id: "P1" } },
    };
    expect(keys({ ...fine(), destination: instant })).toEqual([]);
  });

  it("NO PROMOTED OBJECT on a lead-generation ad set", () => {
    const instant = {
      ok: true as const,
      destination: { kind: "instant_form", url: null, leadFormId: "LF1", optimizationGoal: "LEAD_GENERATION", promotedObject: null },
    };
    expect(keys({ ...fine(), destination: instant })).toEqual(["no_promoted_object"]);
  });

  it("NO BUDGET", () => {
    expect(keys({ ...fine(), budget: { requestedMinor: 0, minimumMinor: 4000, currency: "INR" } })).toEqual(["no_budget"]);
    expect(keys({ ...fine(), budget: { requestedMinor: null, minimumMinor: 4000, currency: "INR" } })).toEqual(["no_budget"]);
  });

  it("NO MEDIA", () => {
    expect(keys({ ...fine(), creative: { headline: "x", body: "y", imageBytes: 0 } })).toEqual(["no_media"]);
  });

  it("NO TEXT", () => {
    expect(keys({ ...fine(), creative: { headline: "  ", body: null, imageBytes: 1024 } })).toEqual(["no_text"]);
  });

  it("NO LOCATION", () => {
    expect(keys({ ...fine(), targeting: { targeting: { age_min: 24, age_max: 40 }, specialAdCategory: "NONE" } })).toEqual([
      "no_location",
    ]);
  });

  it("AN EMPTY city LIST IS NO LOCATION, not a location", () => {
    expect(keys({ ...fine(), targeting: { targeting: { geo_locations: { cities: [] } }, specialAdCategory: "NONE" } })).toEqual([
      "no_location",
    ]);
  });

  it("A COUNTRY OR A REGION IS A LOCATION", () => {
    // All-India is the honest fallback when no city resolves, and it
    // must not read as "no location".
    expect(keys({ ...fine(), targeting: { targeting: { geo_locations: { countries: ["IN"] } }, specialAdCategory: "NONE" } })).toEqual([]);
    expect(keys({ ...fine(), targeting: { targeting: { geo_locations: { regions: [{ key: "r1" }] } }, specialAdCategory: "NONE" } })).toEqual([]);
  });

  it("BAD AGE RANGE — outside Meta's bounds, either end", () => {
    const t = (age_min: number, age_max: number) => keys({ ...fine(), targeting: { targeting: { ...GEO, age_min, age_max }, specialAdCategory: "NONE" } });
    expect(t(AGE_MIN - 1, 40)).toEqual(["bad_age_range"]);
    expect(t(24, AGE_MAX + 1)).toEqual(["bad_age_range"]);
    expect(t(40, 24)).toEqual(["bad_age_range"]);
    expect(t(AGE_MIN, AGE_MAX)).toEqual([]);
  });

  it("NO AGE AT ALL IS FINE — Meta's own default is every age", () => {
    // Absent is not invalid. Treating it as invalid would block every
    // broad-targeted ad, which is the one we WANT at a small budget.
    expect(keys({ ...fine(), targeting: { targeting: { ...GEO }, specialAdCategory: "NONE" } })).toEqual([]);
  });

  it("NO SPECIAL AD CATEGORY DECLARED — 'NONE' is a declaration, blank is not", () => {
    expect(keys({ ...fine(), targeting: { targeting: { ...GEO }, specialAdCategory: "" } })).toEqual(["no_special_ad_category"]);
    expect(keys({ ...fine(), targeting: { targeting: { ...GEO }, specialAdCategory: "NONE" } })).toEqual([]);
    expect(keys({ ...fine(), targeting: { targeting: { ...GEO }, specialAdCategory: "HOUSING" } })).toEqual([]);
  });
});

describe("3. ALL OF IT AT ONCE", () => {
  it("THE LOAD-BEARING ONE: three faults are three problems, not the first one", () => {
    // Every fixture above passes against a first-failure-wins
    // implementation. This one does not, and it is the whole reason the
    // module exists.
    const r = preflight({
      account: { usable: false, reason: "This ad account has no payment method attached." },
      connection: { ...CONNECTED, pageId: null },
      destination: { ok: true, destination: { ...WEBSITE.destination, url: null } },
      budget: { requestedMinor: 0, minimumMinor: 4000, currency: "INR" },
      creative: { headline: null, body: null, imageBytes: 0 },
      targeting: { targeting: {}, specialAdCategory: "" },
    });
    expect(r.problems.length).toBeGreaterThanOrEqual(6);
    expect(r.problems.map((p) => p.key)).toEqual(
      expect.arrayContaining(["account_unusable", "no_page", "no_destination_url", "no_budget", "no_media", "no_text", "no_location", "no_special_ad_category"])
    );
  });

  it("AND THEY ARE NUMBERED, because three fixes are not one sentence", () => {
    const r = preflight({ connection: { ...CONNECTED, pageId: null, token: null } });
    const msg = preflightMessage(r)!;
    expect(msg).toMatch(/2 things need fixing/);
    expect(msg).toMatch(/1\. /);
    expect(msg).toMatch(/2\. /);
  });

  it("one problem is said as itself, with no list around it", () => {
    const msg = preflightMessage(preflight({ connection: { ...CONNECTED, pageId: null } }))!;
    expect(msg).not.toMatch(/things need fixing/);
    expect(msg).not.toMatch(/^1\. /);
  });

  it("EVERY PROBLEM NAMES A LEVEL AND A STABLE KEY", () => {
    // The key is how a log line and a test name the same rule; the
    // level is how the owner knows which part of the ad to look at.
    const r = preflight({
      account: { usable: false, reason: "This ad account has an unsettled balance." },
      connection: { ...CONNECTED, pageId: null },
      targeting: { targeting: {}, specialAdCategory: "" },
    });
    for (const p of r.problems) {
      expect(p.key).toMatch(/^[a-z_]+$/);
      expect(["account", "campaign", "adset", "ad"]).toContain(p.level);
      expect(p.message.length).toBeGreaterThan(10);
    }
  });
});

describe("4. A BUDGET UNDER THE FLOOR IS RAISED, NEVER REFUSED", () => {
  it("IT IS NOT A PROBLEM — the floor is Meta's and it is recoverable", () => {
    // Refusing would waste the whole flow over something that can be
    // fixed by spending slightly more than asked.
    const r = preflight({ ...fine(), budget: { requestedMinor: 1000, minimumMinor: 4000, currency: "INR" } });
    expect(r.problems).toEqual([]);
    expect(r.budgetMinor).toBe(4000);
    expect(r.budgetRaised).toBe(true);
  });

  it("AND THE RAISE IS SAID PLAINLY, with both amounts", () => {
    const r = preflight({ ...fine(), budget: { requestedMinor: 1000, minimumMinor: 4000, currency: "INR" } });
    const note = budgetRaisedNote(r, 1000, "INR")!;
    expect(note).toMatch(/₹10/);
    expect(note).toMatch(/₹40/);
    expect(note).toMatch(/minimum/i);
  });

  it("nothing raised means nothing said", () => {
    expect(budgetRaisedNote(preflight(fine()), 10000, "INR")).toBeNull();
  });
});

describe("5. IT IS DETERMINISTIC, AND IT TOUCHES NOTHING", () => {
  it("NO MODEL, NO NETWORK, NO DATABASE", () => {
    // What makes every rule above testable with a fixture, and what
    // lets it be called twice for free.
    const src = code("src/lib/ads/preflight.ts");
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/supabase/);
    expect(src).not.toMatch(/callClaude|anthropic/i);
  });

  it("THE ROUTE REFUSES BEFORE IT SPENDS MODEL TIME OR GENERATES AN IMAGE", () => {
    // The old "LAYER 3a" reasoning: a launch that cannot work should
    // cost nothing. Sliced to the preflight call before anchoring.
    const src = code("src/app/api/ads/adlaunch/route.ts");
    const check = src.indexOf("const checks = preflight({");
    const launch = src.indexOf("await launchPausedCampaign({");
    expect(check).toBeGreaterThan(-1);
    expect(launch).toBeGreaterThan(-1);
    expect(launch).toBeGreaterThan(check);
  });

  it("AND launchCampaign REFUSES BEFORE THE CAMPAIGN IS CREATED", () => {
    // An ad set Meta refuses leaves an orphaned campaign in Ads
    // Manager. Refusing one frame earlier leaves nothing.
    const src = code("src/lib/ads/launchCampaign.ts");
    const check = src.indexOf("const targetingChecks = preflight({");
    const campaign = src.indexOf("/campaigns`");
    expect(check).toBeGreaterThan(-1);
    expect(campaign).toBeGreaterThan(check);
  });

  it("THE CONNECTION LOG KEEPS ITS EXACT SHAPE", () => {
    // launch.not_connected exists to say WHICH of the three is missing,
    // and metaLog.test.ts pins its fields. Moving the check must not
    // have quietly dropped it.
    const src = code("src/app/api/ads/adlaunch/route.ts");
    const at = src.indexOf('metaError("launch.not_connected"');
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, at + 300);
    expect(call).toMatch(/has_token: Boolean\(pageAccessToken\)/);
    expect(call).toMatch(/has_ad_account: Boolean\(rawAdAccountId\)/);
    expect(call).toMatch(/has_page: Boolean\(pageId\)/);
  });
});
