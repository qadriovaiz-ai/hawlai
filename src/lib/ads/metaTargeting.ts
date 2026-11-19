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

// ---- Interests ------------------------------------------------------
//
// THE DEFECT, FOUND 19 NOVEMBER 2026. A candle business was targeted at
// "Electronic music (music)" — 1.1 to 1.4 million people, paid for.
//
// The cause was three lines of agreement between two reasonable things.
// The search ran with `limit=1`, and `data[0]` was accepted WITH NO
// RELEVANCE CHECK AT ALL. And what it searched was `concerns` —
// pain-point phrases from the brand persona like "relaxation" or
// "ambience", which are not interest-category names and never were.
// Meta's search did its job; it was asked a question it cannot answer,
// and whatever came back first became paid targeting.
//
// THE FIX WAS ALREADY WRITTEN, TEN LINES BELOW. resolveIncomeBracket
// calls the same endpoint and then REFUSES a match that does not read
// like an income bracket, with a comment explaining that silently
// targeting "luxury cars" for "high income" would be worse than
// omitting income entirely. The principle was in this file all along —
// it had simply never been applied to the field that spends money.
//
// SO: ask for a list, not one. Search the business's REAL words
// (its products and its category) rather than its pain points. Check
// every candidate against the business's own vocabulary. And when
// nothing matches, send NO INTERESTS AT ALL — broad targeting, which
// at a small daily budget is the better answer anyway, and is always
// better than a wrong one.
//
// RULE 3 HOLDS. The check compares two runtime strings: Meta's returned
// interest name against words the business itself supplied. No product,
// category or trade word is written here.

interface MetaInterest { id: string; name: string }

/** Enough candidates that the right one is reachable; Meta ranks them. */
export const INTEREST_CANDIDATES = 25;

/** Shortest word worth matching on. Below this it is noise, not meaning. */
export const MIN_WORD = 3;

/**
 * Words that carry no meaning about a trade.
 *
 * STRUCTURAL ONLY — articles, conjunctions, prepositions. Deliberately
 * not a list of "generic business words": that would be a judgement
 * about what businesses are like, which is the thing Rule 3 forbids.
 */
const STRUCTURAL = new Set(["and", "or", "the", "for", "with", "from", "into", "onto", "its", "your", "our"]);

/**
 * A string reduced to the words worth comparing.
 *
 * Singular and plural are folded together, because "candles" and
 * "Candle" are the same interest and a naive compare would reject the
 * one match that mattered. A trailing "ss" is left alone so "business"
 * does not become "busines".
 */
export function meaningfulWords(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length >= MIN_WORD && !STRUCTURAL.has(w));
}

/**
 * Does this interest have anything to do with this business?
 *
 * ONE SHARED MEANINGFUL WORD is the whole test. It is deliberately
 * crude in the SAFE direction: a near-miss like "home decor" against
 * "Interior design" is rejected and the ad goes out broad, which costs
 * nothing. The failure it exists to stop — a candle shop paying to
 * reach people who like electronic music — shares no word with anything
 * the business ever said.
 */
export function isRelevantInterest(interestName: string, vocabulary: string[]): boolean {
  const vocab = new Set(vocabulary.flatMap((v) => meaningfulWords(v)));
  if (vocab.size === 0) return false;
  return meaningfulWords(interestName).some((w) => vocab.has(w));
}

async function searchAdInterests(query: string, token: string): Promise<MetaInterest[]> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/search?type=adinterest&q=${encodeURIComponent(query)}&limit=${INTEREST_CANDIDATES}&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!Array.isArray(data?.data)) return [];
    return data.data
      .filter((d: any) => d?.id && d?.name)
      .map((d: any) => ({ id: String(d.id), name: String(d.name) }));
  } catch {
    return [];
  }
}

/**
 * Real Meta interest ids for this business — or none.
 *
 * `terms` are what to search for; `vocabulary` is what the business
 * itself says it sells. They overlap on purpose: a product name is both
 * a good query AND the thing a match has to resemble.
 *
 * NEVER GUESSES. A term that returns nothing relevant contributes
 * nothing, and a run where nothing at all is relevant returns an empty
 * array — which buildMetaTargeting treats as broad targeting.
 */
export async function resolveInterests(
  terms: string[] | null | undefined,
  vocabulary: string[],
  token: string
): Promise<MetaInterest[]> {
  const queries = [...new Set((terms ?? []).map((t) => String(t ?? "").trim()).filter(Boolean))].slice(0, 5);
  if (queries.length === 0) return [];

  const found = await Promise.all(queries.map((q) => searchAdInterests(q, token)));

  const seen = new Set<string>();
  const kept: MetaInterest[] = [];
  for (const candidates of found) {
    for (const c of candidates) {
      if (seen.has(c.id)) continue;
      // THE CHECK THAT WAS MISSING. Without it, `candidates[0]` is
      // whatever Meta ranked first for a question it could not answer.
      if (!isRelevantInterest(c.name, vocabulary)) continue;
      seen.add(c.id);
      kept.push(c);
      break; // one interest per term is plenty; more only narrows.
    }
  }
  return kept.slice(0, 5);
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
  // Now reads a LIST rather than one result, because the interest
  // search became plural — and this check was always the right shape,
  // so it simply gets more candidates to refuse. The first one that
  // reads like an income bracket wins; none means none.
  const results = await searchAdInterests(income.trim(), token);
  return results.find((r) => /income|affluen|earner/i.test(r.name)) ?? null;
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
  /** Never show this ad to these — the people who already bought or booked (R3). */
  excludedCustomAudienceIds?: string[] | null;
  /**
   * What this business actually sells, in its own words — product
   * names and its category. Two jobs: they are the best things to
   * SEARCH for, and they are what a candidate interest has to resemble
   * before it is paid for.
   *
   * Empty means no interest can be judged relevant, so none is applied
   * and the ad goes out broad. That is the safe direction: the failure
   * being fixed here is a candle shop paying to reach people who like
   * electronic music.
   */
  vocabulary?: string[] | null;
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
      targeting: { geo_locations: location.geo_locations, targeting_automation: { advantage_audience: 1 } },
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
  // Customers are excluded at the ad set too, not only inside the audience:
  // a rule or a list can be stale, and paying to advertise to someone who
  // already bought is the failure this prevents.
  const excludedIds = [...new Set((input.excludedCustomAudienceIds ?? []).filter(Boolean))].filter((id) => !retargetIds.includes(id));
  if (retargetIds.length > 0) {
    return {
      targeting: {
        geo_locations: location.geo_locations, // Meta still requires a geo
        custom_audiences: retargetIds.map((id) => ({ id })),
        ...(excludedIds.length ? { excluded_custom_audiences: excludedIds.map((id) => ({ id })) } : {}),
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
    // THE BUSINESS'S OWN WORDS COME FIRST. `concerns` are pain-point
    // phrases ("relaxation", "ambience") and Meta's interest taxonomy
    // cannot answer them — asking anyway is what produced "Electronic
    // music" for a candle shop. They stay as extra queries, but now
    // every result has to survive the relevance check.
    resolveInterests(
      [...(input.vocabulary ?? []), ...(input.persona?.concerns ?? [])],
      (input.vocabulary ?? []).filter(Boolean) as string[],
      input.accessToken
    ),
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
    // NESTED, not spread. resolveLocation returns
    // { geo_locations: { countries|cities|regions } }, and spreading it
    // put `countries` / `cities` at the TOP level of targeting — where
    // Meta's spec has no such field — while the geo_locations key it
    // does require was never sent at all. Every adset creation was
    // rejected with "Add at least one location or choose a custom
    // audience" (subcode 1885364).
    //
    // Not a regression from removing the Lucknow default: that changed
    // WHICH branch of resolveLocation runs, and all three branches were
    // flattened identically. A campaign with a city set failed the same
    // way. It was never reachable before, because the executor had
    // never run a launch to completion in production.
    geo_locations: location.geo_locations,
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
