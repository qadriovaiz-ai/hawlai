// Everything that would stop this ad, said at once.
//
// WHY THIS EXISTS. The checks were all there and each lived somewhere
// else: the account in the adlaunch route body, the budget floor in
// adAccountLimits, the destination in destination.ts, the radius floor
// inside the targeting builder. Each door got a different subset, and
// every one of them returned on the FIRST failure.
//
// So an owner with no payment method, no website and a budget under
// Meta's floor was told about the payment method, fixed it, was told
// about the website, fixed that, and was told about the budget. Three
// attempts to learn three things that were all knowable at the start.
// "Tell them what to add" means all of it.
//
// ─────────────────────────────────────────────────────────────────────
// DETERMINISTIC, AND IT TOUCHES NOTHING
// ─────────────────────────────────────────────────────────────────────
//
// No model, no network, no database. It is handed what has already been
// read and decides. That is what makes every rule below testable with a
// fixture, and it is why this file can be called twice without costing
// anything.
//
// TWICE, BECAUSE TARGETING DOES NOT EXIST YET AT THE FIRST CALL. The
// route checks what is knowable before any money or model time is
// spent — the account, the connection, the budget, the destination, the
// creative — because generating an image for an ad that cannot launch
// is the waste worth avoiding. Targeting is only real after
// buildMetaTargeting has resolved it against Meta, so those rules run
// inside launchCampaign, before the first Graph POST and therefore
// before anything exists on Meta. Both calls use this one function and
// report everything in their scope.
//
// WHAT IS NOT HERE. Meta's own policy judgements — ad text, the image
// text rule, whether a landing page matches — are not guessed at. The
// dry run asks Meta directly (validate_only). This file is for the
// things that are true before Meta is asked at all.

import { clampBudgetToMinimum, formatMinorAmount } from "@/lib/ads/adAccountLimits";

export type PreflightLevel = "account" | "campaign" | "adset" | "ad";

export type PreflightProblem = {
  /** Stable, so a test and a log line can name the same rule. */
  key: string;
  level: PreflightLevel;
  /** What the owner has to do. Never a Meta error code. */
  message: string;
};

export type PreflightInput = {
  /** From accountHealthFor. Null means it was not checked at this call. */
  account?: { usable: boolean; reason: string; warning?: string | null } | null;
  connection?: {
    pageId?: string | null;
    adAccountId?: string | null;
    token?: string | null;
    /** Needed only when the destination is an instant form. */
    leadFormId?: string | null;
  } | null;
  budget?: {
    requestedMinor?: number | null;
    minimumMinor?: number | null;
    currency?: string | null;
  } | null;
  /** Exactly what resolveAdDestination returned. */
  destination?: { ok: true; destination: any } | { ok: false; reason: string } | null;
  creative?: {
    headline?: string | null;
    body?: string | null;
    /** Decoded image size. 0 or null means there is no usable image. */
    imageBytes?: number | null;
  } | null;
  /** Only at the second call: exactly what buildMetaTargeting returned. */
  targeting?: { targeting: Record<string, any>; specialAdCategory: string } | null;
  /**
   * Exactly what declarationFor returned (regulatedCategory.ts).
   * Computed outside, because deciding it needs the business's own text
   * and this function stays pure.
   */
  regulated?: { kind: "none" } | { kind: "refuse"; reason: string } | { kind: "declare"; value: string } | null;
};

export type PreflightResult = {
  ok: boolean;
  problems: PreflightProblem[];
  /** The budget actually usable, raised to Meta's floor where needed. */
  budgetMinor: number | null;
  budgetRaised: boolean;
};

/** Meta's own bounds. Outside these it rejects the ad set. */
export const AGE_MIN = 13;
export const AGE_MAX = 65;

const blank = (s: string | null | undefined) => !s || !String(s).trim();

export function preflight(input: PreflightInput): PreflightResult {
  const problems: PreflightProblem[] = [];
  const add = (key: string, level: PreflightLevel, message: string) => problems.push({ key, level, message });

  // ── Account ────────────────────────────────────────────────────────
  // Its own words, not a generic refusal: "unsettled balance" and "no
  // payment method" need different actions from the owner.
  if (input.account && !input.account.usable) {
    add("account_unusable", "account", input.account.reason);
  }

  // ── Connection ─────────────────────────────────────────────────────
  const c = input.connection;
  if (c) {
    if (blank(c.pageId)) {
      add("no_page", "account", "No Facebook Page is connected. Connect your Page in Settings before launching an ad.");
    }
    if (blank(c.adAccountId)) {
      add("no_ad_account", "account", "No Meta ad account is connected. Connect one in Settings — ads are paid for through it.");
    }
    if (blank(c.token)) {
      add("no_token", "account", "Hawlai's Facebook connection has expired. Reconnect Facebook in Settings → Integrations.");
    }
  }

  // ── Destination ────────────────────────────────────────────────────
  // Resolved BEFORE this is called. A website ad with nowhere to send
  // people is the one failure Meta will happily accept and charge for.
  const dest = input.destination;
  if (dest && dest.ok === false) {
    add("destination_unresolved", "ad", dest.reason);
  }
  if (dest && dest.ok === true) {
    const d = dest.destination;
    // An instant form needs a form on the Page. Meta rejects the ad
    // otherwise, several Graph calls deep.
    if (d?.kind === "instant_form" && blank(c?.leadFormId) && blank(d?.leadFormId)) {
      add(
        "no_lead_form",
        "ad",
        "No Instant Form is connected to this Page. Connect one in Settings, or send people to your website instead."
      );
    }
    // Meta requires a promoted object for lead generation and refuses
    // the ad set without it.
    //
    // NOT SAID TWICE. A missing Page already produced `no_page`, and
    // the promoted object is the Page — reporting both tells the owner
    // one root cause in two sentences, which is the noise this module
    // is supposed to replace, not add to.
    const pageAlreadyReported = problems.some((p) => p.key === "no_page");
    if (!pageAlreadyReported && d?.optimizationGoal === "LEAD_GENERATION" && !d?.promotedObject) {
      add(
        "no_promoted_object",
        "adset",
        "This ad collects leads, which Meta ties to your Facebook Page — and no Page is attached to it. Connect your Page in Settings."
      );
    }
    // Anything that is not an instant form has to have somewhere to go.
    if (d?.kind !== "instant_form" && blank(d?.url)) {
      add(
        "no_destination_url",
        "ad",
        "This ad has nowhere to send people. Add your website in Settings, or publish a landing page first."
      );
    }
  }

  // ── Budget ─────────────────────────────────────────────────────────
  // RAISED, NOT REFUSED, when it is merely under the floor — the floor
  // is Meta's and differs per account, so clampBudgetToMinimum decides.
  // Only a missing or nonsensical budget is a problem.
  let budgetMinor: number | null = null;
  let budgetRaised = false;
  const b = input.budget;
  if (b) {
    const requested = b.requestedMinor;
    if (requested === null || requested === undefined || !Number.isFinite(requested) || requested <= 0) {
      add("no_budget", "adset", "No daily budget is set for this ad. Set one before launching — Meta needs it to deliver.");
    } else {
      const clamped = clampBudgetToMinimum(requested, b.minimumMinor ?? null);
      budgetMinor = clamped.minor;
      budgetRaised = clamped.raised;
    }
  }

  // ── Creative ───────────────────────────────────────────────────────
  const cr = input.creative;
  if (cr) {
    if (!cr.imageBytes) {
      add("no_media", "ad", "This ad has no image. Meta needs one before it can run.");
    }
    if (blank(cr.headline) && blank(cr.body)) {
      add("no_text", "ad", "This ad has no text. Add a headline or a body line before launching.");
    }
  }

  // ── Targeting ──────────────────────────────────────────────────────
  // Second call only. These are not knowable until buildMetaTargeting
  // has resolved a city against Meta's own taxonomy.
  const t = input.targeting;
  if (t) {
    const geo = t.targeting?.geo_locations;
    const hasGeo =
      geo &&
      typeof geo === "object" &&
      ((Array.isArray(geo.countries) && geo.countries.length > 0) ||
        (Array.isArray(geo.cities) && geo.cities.length > 0) ||
        (Array.isArray(geo.regions) && geo.regions.length > 0));
    if (!hasGeo) {
      add("no_location", "adset", "This ad has no location to target. Set your city or area in Settings.");
    }

    // Meta rejects an ad set whose ages fall outside 13-65, or whose
    // minimum is above its maximum. parseAgeRange clamps, so reaching
    // here means something else built the targeting.
    const min = t.targeting?.age_min;
    const max = t.targeting?.age_max;
    const bad = (v: any) => v !== undefined && v !== null && (!Number.isFinite(v) || v < AGE_MIN || v > AGE_MAX);
    if (bad(min) || bad(max) || (Number.isFinite(min) && Number.isFinite(max) && min > max)) {
      add("bad_age_range", "adset", `The age range on this ad is outside what Meta accepts (${AGE_MIN}–${AGE_MAX}). Fix it in your Brand persona.`);
    }

    // DECLARED EITHER WAY. "NONE" is a declaration; an empty one is a
    // missing field, and Meta requires the campaign to state it.
    if (blank(t.specialAdCategory)) {
      add(
        "no_special_ad_category",
        "campaign",
        "This campaign doesn't declare whether it's a special category ad (housing, employment or credit). That has to be stated, even when the answer is none."
      );
    }
  }

  // ── Meta's regional regulated categories ───────────────────────────
  // India securities and investments ads need a verified advertiser,
  // payer and beneficiary before they may run at all. Declaring the
  // category without that verification produces Meta's "Verification
  // required for 1 location" (#3858541), so a business that looks
  // regulated is stopped and told what Meta needs — never declared on
  // its behalf.
  if (input.regulated && input.regulated.kind === "refuse") {
    add("needs_finance_verification", "adset", input.regulated.reason);
  }

  return { ok: problems.length === 0, problems, budgetMinor, budgetRaised };
}

/**
 * Every problem as one message for the owner.
 *
 * NUMBERED WHEN THERE IS MORE THAN ONE, because "and" chains read as a
 * single sentence and a list of three fixes is not a sentence.
 */
export function preflightMessage(result: PreflightResult): string | null {
  if (result.ok) return null;
  const { problems } = result;
  if (problems.length === 1) return problems[0].message;
  return `${problems.length} things need fixing before this can launch:\n${problems.map((p, i) => `${i + 1}. ${p.message}`).join("\n")}`;
}

/** The budget raise, said plainly. Null when nothing was raised. */
export function budgetRaisedNote(result: PreflightResult, requestedMinor: number | null, currency: string | null): string | null {
  if (!result.budgetRaised || result.budgetMinor === null) return null;
  const from = formatMinorAmount(requestedMinor, currency);
  const to = formatMinorAmount(result.budgetMinor, currency);
  if (!from || !to) return null;
  return `Daily budget raised from ${from} to ${to} — that is this ad account's own minimum on Meta.`;
}
