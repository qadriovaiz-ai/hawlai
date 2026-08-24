// ------------------------------------------------------------------
// Meta ad targeting builder — real persona data -> real Meta targeting.
// ------------------------------------------------------------------
// Previously adlaunch/route.ts sent Meta only: city/country geo +
// hardcoded age_min:21 + Advantage Audience. brand_profiles.target_
// persona (age_range/income/concerns, since extended with gender) was
// generated for ad COPY but never reached actual targeting. This
// module is that missing translation.
//
// VERIFIED against Meta's Marketing API before writing this (not
// assumed):
//   - age_min/age_max valid 13-65. Under targeting_automation.
//     advantage_audience=1 (on for every ad today), Meta RESETS
//     age_min to somewhere in 18-25 and age_max to 65 regardless of
//     what's sent — so a real persona age range only genuinely binds
//     with Advantage Audience turned OFF. Interests coexist with
//     Advantage Audience either way (used as an expansion seed).
//   - genders: array of 1 (male) / 2 (female); omitted/both = all.
//   - Household Income targeting exists for India but Meta's own
//     documentation concedes the underlying data is noticeably less
//     reliable outside metro cities, and there is no confirmed stable
//     API type for looking it up directly — see resolveIncomeBracket.
//   - geo_locations.cities supports up to 250 entries; radius is
//     17-80km (Meta rejects outside that range); geo_locations.regions
//     targets states, resolved via the same search endpoint.
//   - Special Ad Categories (HOUSING among them) legally strip age,
//     gender, and interest targeting to geo-only, enforced by Meta
//     regardless of what's requested — isSpecialAdCategory() below
//     is why buildMetaTargeting() skips all demographic targeting for
//     Real Estate rather than sending it and having Meta silently drop it.
// ------------------------------------------------------------------

import { GRAPH_VERSION, resolveCityKey, resolveRegionKey } from "@/lib/adEngine";

export interface TargetPersona {
  age_range?: string | null;
  income?: string | null;
  concerns?: string[] | null;
  gender?: "all" | "male" | "female" | null;
}

export type LocationChoice =
  | { mode: "ai_city" } // default — plan.targeting_city as before
  | { mode: "all_india" }
  | { mode: "cities"; cities: string[]; radiusKm?: number }
  | { mode: "state"; state: string };

const MIN_RADIUS_KM = 17;
const MAX_RADIUS_KM = 80;
const DEFAULT_RADIUS_KM = 25;

// Special Ad Categories (housing / employment / credit) carry a
// HIGHER radius floor than ordinary ads — Meta requires at least 15
// miles, which is 24.14km, so 25 is the first safe whole number. A
// real-estate dealer picking the ordinary 17km minimum would have the
// ad rejected at the API, and the failure names a radius the dealer
// never typed, so it reads as a Hawlai bug rather than a policy rule.
export const SPECIAL_CATEGORY_MIN_RADIUS_KM = 25;

// ---- Special Ad Category (Real Estate compliance) ------------------

// Only Real Estate exists as a real business_category option today
// (verified in BusinessCategoryField.tsx). Structured as a lookup
// rather than a single if-check so EMPLOYMENT/CREDIT slot in the same
// way if this app ever adds a hiring or lending vertical — neither
// exists today, so nothing else is added speculatively.
const SPECIAL_AD_CATEGORY_BY_BUSINESS: Record<string, string> = {
  "real estate": "HOUSING",
};

export function isSpecialAdCategory(businessCategory: string | null | undefined): string | null {
  const key = (businessCategory ?? "").trim().toLowerCase();
  return SPECIAL_AD_CATEGORY_BY_BUSINESS[key] ?? null;
}

// ---- Age -------------------------------------------------------

// target_persona.age_range is free text — "25-40", "young adults",
// or empty (AI "best guess or empty string", verified in
// businessIntelligenceAgent.ts). Only a genuinely parseable numeric
// range is used; anything else is treated as absent, never guessed
// further. Clamped to Meta's real 13-65 bounds.
export function parseAgeRange(ageRange: string | null | undefined): { min: number; max: number } | null {
  if (!ageRange) return null;
  const match = ageRange.match(/(\d{1,2})\s*[-–to]+\s*(\d{1,2})/i);
  if (!match) return null;
  let min = parseInt(match[1], 10);
  let max = parseInt(match[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
  if (min > max) [min, max] = [max, min];
  min = Math.max(13, Math.min(65, min));
  max = Math.max(13, Math.min(65, max));
  if (min === max) return null; // degenerate range — not usable
  return { min, max };
}

// ---- Gender ------------------------------------------------------

export function resolveGenders(gender: TargetPersona["gender"]): number[] | undefined {
  if (gender === "male") return [1];
  if (gender === "female") return [2];
  return undefined; // "all" or unset — omitted, which is Meta's own "all genders" default
}

// ---- Interests (concerns -> real Meta interest IDs) -----------------

interface MetaInterest { id: string; name: string }

async function searchAdInterest(query: string, token: string): Promise<MetaInterest | null> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/search?type=adinterest&q=${encodeURIComponent(query)}&limit=1&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const first = data?.data?.[0];
    return first ? { id: String(first.id), name: first.name } : null;
  } catch {
    return null;
  }
}

// concerns are pain-point phrases ("affordability", "family safety"),
// not literal Meta interest-category names — each is looked up
// individually against Meta's real taxonomy at launch time. Phrases
// with no reasonable match return nothing rather than a wrong-but-
// present interest; capped at 5 so targeting doesn't over-narrow from
// a long concerns list.
export async function resolveInterests(concerns: string[] | null | undefined, token: string): Promise<MetaInterest[]> {
  if (!concerns || concerns.length === 0) return [];
  const results = await Promise.all(concerns.slice(0, 5).map((c) => searchAdInterest(c, token)));
  const seen = new Set<string>();
  return results.filter((r): r is MetaInterest => {
    if (!r || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ---- Income (best-effort, honest about its limits) ------------------

// UNVERIFIED STABLE MAPPING: there is no confirmed, documented Meta
// API type dedicated to looking up India household-income bracket IDs
// directly (checked before building this — Meta's own guidance points
// marketers at typing "income" into the Ads Manager UI search box, not
// a stable API parameter). Reusing the same adinterest search endpoint
// is the most defensible attempt available, but it may well return
// nothing for many income phrasings. That is treated as a genuine
// "not applicable" rather than papered over with a proxy-interest
// guess (e.g. silently targeting "luxury cars" for "high income") —
// substituting something the dealer never actually said would be
// worse than omitting income targeting entirely.
export async function resolveIncomeBracket(income: string | null | undefined, token: string): Promise<MetaInterest | null> {
  if (!income || !income.trim()) return null;
  const result = await searchAdInterest(income.trim(), token);
  // Only accept a match whose name plausibly reads as an income
  // bracket — an unrelated interest match would be actively wrong.
  if (result && /income|affluen|earner/i.test(result.name)) return result;
  return null;
}

// ---- Location ------------------------------------------------------

export interface ResolvedLocation {
  geo_locations: Record<string, any>;
  summaryLabel: string;
}

export async function resolveLocation(
  choice: LocationChoice | null | undefined,
  aiSuggestedCity: string | null | undefined,
  token: string,
  /** Housing/employment/credit ads have a higher radius floor — see SPECIAL_CATEGORY_MIN_RADIUS_KM. */
  isSpecialCategory = false
): Promise<ResolvedLocation> {
  const mode = choice?.mode ?? "ai_city";
  const minRadius = isSpecialCategory ? SPECIAL_CATEGORY_MIN_RADIUS_KM : MIN_RADIUS_KM;

  if (mode === "all_india") {
    return { geo_locations: { countries: ["IN"] }, summaryLabel: "All India" };
  }

  if (mode === "state" && choice && choice.mode === "state") {
    const key = await resolveRegionKey(choice.state, token);
    if (key) return { geo_locations: { regions: [{ key }] }, summaryLabel: choice.state };
    // Unresolvable state name — fall through to country-wide rather
    // than silently dropping the ad's location entirely.
    return { geo_locations: { countries: ["IN"] }, summaryLabel: "All India (couldn't match that state)" };
  }

  if (mode === "cities" && choice && choice.mode === "cities" && choice.cities.length > 0) {
    const radius = Math.max(minRadius, Math.min(MAX_RADIUS_KM, choice.radiusKm ?? DEFAULT_RADIUS_KM));
    const keys = await Promise.all(choice.cities.slice(0, 250).map((c) => resolveCityKey(c, token)));
    const cities = keys
      .map((key, i) => (key ? { key, radius, distance_unit: "kilometer" } : null))
      .filter((c): c is { key: string; radius: number; distance_unit: string } => c !== null);
    if (cities.length > 0) {
      const label = choice.cities.length === 1 ? choice.cities[0] : `${cities.length} cities`;
      return { geo_locations: { cities }, summaryLabel: `${label} (${radius}km)` };
    }
    // None of the typed city names resolved — fall through.
  }

  // Default: the single AI-guessed city from the ad plan, exactly the
  // pre-existing behavior, so a dealer who never touches the new
  // location picker sees zero change.
  if (aiSuggestedCity) {
    const key = await resolveCityKey(aiSuggestedCity, token);
    if (key) {
      // Clamped rather than using DEFAULT_RADIUS_KM directly, so this
      // path stays correct if either floor is ever retuned.
      const defaultRadius = Math.max(minRadius, DEFAULT_RADIUS_KM);
      return {
        geo_locations: { cities: [{ key, radius: defaultRadius, distance_unit: "kilometer" }] },
        summaryLabel: `${aiSuggestedCity} (${defaultRadius}km)`,
      };
    }
  }
  return { geo_locations: { countries: ["IN"] }, summaryLabel: "All India" };
}

// ---- The composed builder ------------------------------------------

export interface BuildTargetingInput {
  businessCategory: string | null | undefined;
  persona: TargetPersona | null | undefined;
  location: LocationChoice | null | undefined;
  aiSuggestedCity: string | null | undefined;
  accessToken: string;
  /**
   * Meta Custom Audience ids to retarget (piece 5/6). When present the
   * audience IS the targeting definition, so persona demographics are
   * deliberately NOT layered on top — see buildMetaTargeting().
   */
  customAudienceIds?: string[] | null;
}

export interface BuiltTargeting {
  targeting: Record<string, any>;
  specialAdCategory: string; // "NONE" or a real category
  summary: string; // customer-facing, no provider names
  personaApplied: boolean; // did any real persona data actually get used
}

// Pure, no network calls — for the PREVIEW screen, which deliberately
// never touches Meta (see /api/ads/preview's own header comment: it
// generates copy/creative only). Shows what will be ATTEMPTED at
// launch from age/gender/concerns as typed, not yet resolved against
// Meta's real interest taxonomy — that resolution only happens at
// actual launch (buildMetaTargeting), where the full, real summary is
// returned. Real Estate/HOUSING still overrides this to geo-only.
export function previewPersonaSummary(persona: TargetPersona | null | undefined, businessCategory: string | null | undefined): { summary: string; personaApplied: boolean; restricted: boolean } {
  const restricted = !!isSpecialAdCategory(businessCategory);
  if (restricted) {
    return { summary: `Location only — required for ${businessCategory} ads under Meta's housing ad policy.`, personaApplied: false, restricted: true };
  }

  const age = parseAgeRange(persona?.age_range);
  const genders = resolveGenders(persona?.gender);
  const concerns = (persona?.concerns ?? []).filter(Boolean);
  const personaApplied = !!age || !!genders || concerns.length > 0 || !!persona?.income;

  if (!personaApplied) {
    return { summary: "Meta's automatic audience (no customer profile set in Brand)", personaApplied: false, restricted: false };
  }

  const parts: string[] = [];
  if (age) parts.push(`ages ${age.min}–${age.max}`);
  if (genders?.length === 1) parts.push(genders[0] === 1 ? "men" : "women");
  if (concerns.length > 0) parts.push(`interested in ${concerns.slice(0, 3).join(", ")}`);
  return { summary: `${parts.join(" · ")} — based on your Brand persona`, personaApplied: true, restricted: false };
}

export async function buildMetaTargeting(input: BuildTargetingInput): Promise<BuiltTargeting> {
  const specialAdCategory = isSpecialAdCategory(input.businessCategory);
  const location = await resolveLocation(input.location, input.aiSuggestedCity, input.accessToken, !!specialAdCategory);

  // Real Estate (or any future Special Ad Category): Meta legally
  // strips age/gender/interest targeting regardless of what's sent,
  // and applies its own classifier on top of the declared category —
  // so this doesn't even attempt them. Sending demographic targeting
  // here would be silently ignored by Meta at best, or an account
  // policy risk at worst if the category is misdeclared.
  if (specialAdCategory) {
    return {
      targeting: { ...location.geo_locations, targeting_automation: { advantage_audience: 1 } },
      specialAdCategory,
      summary: `Location only (${location.summaryLabel}) — required for ${input.businessCategory} ads under Meta's housing ad policy.`,
      personaApplied: false,
    };
  }

  // RETARGETING: when a Custom Audience is supplied, that audience IS
  // the definition of who to reach, so persona demographics are
  // deliberately not applied on top.
  //
  // This isn't tidiness — retargeting audiences are small by nature
  // (people who abandoned a cart in 30 days). Narrowing one further by
  // age/gender/interests can push it under Meta's delivery minimum,
  // at which point the ad simply doesn't run. Advantage Audience is
  // also forced OFF: expanding beyond your actual cart-abandoners is
  // the opposite of retargeting them.
  const retargetIds = (input.customAudienceIds ?? []).filter(Boolean);
  if (retargetIds.length > 0) {
    return {
      targeting: {
        ...location.geo_locations, // Meta still requires a geo
        custom_audiences: retargetIds.map((id) => ({ id })),
        targeting_automation: { advantage_audience: 0 },
      },
      specialAdCategory: "NONE",
      summary: `Retargeting a saved audience in ${location.summaryLabel}`,
      personaApplied: false,
    };
  }

  const age = parseAgeRange(input.persona?.age_range);
  const genders = resolveGenders(input.persona?.gender);
  const [interests, incomeBracket] = await Promise.all([
    resolveInterests(input.persona?.concerns, input.accessToken),
    resolveIncomeBracket(input.persona?.income, input.accessToken),
  ]);

  const personaApplied = !!age || !!genders || interests.length > 0 || !!incomeBracket;

  const flexible_spec: Record<string, any>[] = [];
  const detailedNames: string[] = [];
  if (interests.length > 0) {
    flexible_spec.push({ interests: interests.map((i) => ({ id: i.id, name: i.name })) });
    detailedNames.push(...interests.map((i) => i.name));
  }
  if (incomeBracket) {
    flexible_spec.push({ income: [{ id: incomeBracket.id, name: incomeBracket.name }] });
    detailedNames.push(incomeBracket.name);
  }

  // The core tradeoff (confirmed decision): Advantage Audience resets
  // age to Meta's own default range regardless of what's sent, so a
  // real persona age only genuinely binds with it OFF. Only turned
  // off when there's real persona data to apply — an ad with no
  // persona set behaves byte-identical to before this feature existed.
  const targeting: Record<string, any> = {
    ...location.geo_locations,
    ...(age ? { age_min: age.min, age_max: age.max } : { age_min: 21 }), // unchanged fallback
    ...(genders ? { genders } : {}),
    ...(flexible_spec.length > 0 ? { flexible_spec } : {}),
    targeting_automation: { advantage_audience: personaApplied ? 0 : 1 },
  };

  const parts: string[] = [location.summaryLabel];
  if (age) parts.push(`ages ${age.min}–${age.max}`);
  if (genders?.length === 1) parts.push(genders[0] === 1 ? "men" : "women");
  if (detailedNames.length > 0) parts.push(`interested in ${detailedNames.slice(0, 3).join(", ")}${detailedNames.length > 3 ? ` +${detailedNames.length - 3} more` : ""}`);

  return {
    targeting,
    specialAdCategory: "NONE",
    summary: personaApplied
      ? `${parts.join(" · ")} — based on your Brand persona`
      : `${location.summaryLabel} — Meta's automatic audience (no customer profile set in Brand)`,
    personaApplied,
  };
}
