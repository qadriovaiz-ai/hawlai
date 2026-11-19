// Meta's regional regulated categories, and the one rule about them:
// never declare something that has not been established.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT META REQUIRES
// ─────────────────────────────────────────────────────────────────────
//
// Since 28 July 2025, an ad set delivering to audiences in India that
// advertises securities or investments must carry
// `regional_regulated_categories: ["INDIA_FINSERV"]` together with
// `regional_regulation_identities` naming a verified payer and
// beneficiary. Verification is through SEBI registration, or identity
// and business verification for those exempt from it.
//
// The enum was confirmed on 19 November 2026 from Meta's ad set
// reference, verbatim: "INDIA_FINSERV: Use this value to declare a
// Securities and Investments ad set if the ad set targets India
// Audience". It is an AD SET field. `null` is an accepted value.
//
// ─────────────────────────────────────────────────────────────────────
// WHY NOTHING HERE DECIDES
// ─────────────────────────────────────────────────────────────────────
//
// The founder's rule, 19 November 2026: a false declaration is never
// acceptable in EITHER direction — not calling an ordinary business a
// finance one, and not calling a finance one ordinary.
//
// Any keyword test fails both ways eventually. "Trust", "share",
// "stock", "fund" and "returns" are ordinary words in ordinary trades:
// a shop running a stock-clearance sale is not a securities advertiser,
// and a jeweller called Trust is not a broker. Meanwhile a genuine
// advisory can advertise without using one of them.
//
// So this file produces EVIDENCE, never a verdict. Evidence sends the
// launch back to the owner with a question. The absence of evidence
// sends nothing to Meta at all, which is exactly what Ads Manager does
// when the box is left unticked — the state the founder published in on
// 19 November 2026, which Meta accepted.
//
// ─────────────────────────────────────────────────────────────────────
// AND IT NEVER SENDS THE DECLARATION BY ITSELF
// ─────────────────────────────────────────────────────────────────────
//
// INDIA_FINSERV without verified identities is the error already seen
// in Ads Manager: "Verification required for 1 location", code
// #3858541. The shape of `regional_regulation_identities` is NOT
// confirmed — its sub-field names were summarised, never read verbatim
// — so this codebase cannot assemble a complete, valid declaration.
//
// Declaring the category while failing verification is worse than
// refusing: it is a claim about a business, made on its behalf, that
// Meta will reject anyway. So a business that looks regulated is
// REFUSED and told what Meta needs, and the constant below waits for
// the day the identities are confirmed and a verified business asks.
//
// ─────────────────────────────────────────────────────────────────────
// ON RULE 3 (MULTI-TENANT)
// ─────────────────────────────────────────────────────────────────────
//
// The terms below are the only trade words in this codebase, and they
// are here deliberately. They are not a vertical Hawlai serves, and not
// one tenant's vocabulary leaking into everyone's: they are META'S OWN
// regulated scope, identical for every business on the platform.
//
// They are used in exactly one direction — to RAISE A QUESTION and stop
// a launch. They never reach a prompt, a caption, an ad, or any
// generated text, and regulatedCategory.test.ts fails if this module is
// imported by anything that writes copy.

/** Meta's value for India securities and investments ads. */
export const INDIA_FINSERV = "INDIA_FINSERV";

/**
 * Terms that mean the ad MIGHT fall inside Meta's India securities and
 * investments scope.
 *
 * NOT A CLASSIFIER. Every one of these appears in ordinary trade, which
 * is the whole reason a match is treated as a question rather than an
 * answer. Anchored to word boundaries and kept narrow: the broad words
 * on their own ("fund", "returns", "trust", "stock", "share") are
 * deliberately NOT here, because a shop clearing stock or a jeweller
 * called Trust would be stopped by them every time.
 */
const REGULATED_TERMS: { pattern: RegExp; what: string }[] = [
  { pattern: /\bmutual\s+funds?\b/i, what: "mutual funds" },
  { pattern: /\bstock\s+market\b/i, what: "the stock market" },
  { pattern: /\bshare\s+market\b/i, what: "the share market" },
  { pattern: /\bdemat\b/i, what: "demat accounts" },
  { pattern: /\bsebi\b/i, what: "SEBI" },
  { pattern: /\bintraday\b/i, what: "intraday trading" },
  { pattern: /\bf&o\b|\bfutures\s+(?:and|&)\s+options\b/i, what: "futures and options" },
  { pattern: /\bipo\b/i, what: "IPOs" },
  { pattern: /\bsip\b(?!\w)/i, what: "SIPs" },
  { pattern: /\bequit(?:y|ies)\s+(?:market|trading|investment)/i, what: "equity investment" },
  { pattern: /\bportfolio\s+management\b/i, what: "portfolio management" },
  { pattern: /\binvestment\s+(?:advice|advisor|adviser|advisory|plan|scheme|tips)\b/i, what: "investment advice" },
  { pattern: /\btrading\s+(?:account|tips|course|signals?)\b/i, what: "trading accounts or tips" },
  { pattern: /\bguaranteed\s+returns?\b/i, what: "guaranteed returns" },
  { pattern: /\bcrypto(?:currency)?\s+(?:trading|investment)\b/i, what: "crypto investment" },
];

export type RegulatedEvidence = {
  /** The plain-language things that were spotted. Empty means none. */
  found: string[];
  /** Where it was spotted, for the owner's own message. */
  where: string | null;
};

/**
 * Look for evidence, in the business's own words.
 *
 * Each source is labelled so the owner is told WHERE this came from —
 * "your ad text mentions mutual funds" is answerable; "this looks like
 * a finance business" is not.
 */
export function financeEvidence(sources: { label: string; text: string | null | undefined }[]): RegulatedEvidence {
  for (const { label, text } of sources) {
    if (!text || !String(text).trim()) continue;
    const found = REGULATED_TERMS.filter((t) => t.pattern.test(String(text))).map((t) => t.what);
    if (found.length > 0) return { found: [...new Set(found)], where: label };
  }
  return { found: [], where: null };
}

/** Does this targeting reach people in India? The field only applies if so. */
export function targetsIndia(targeting: Record<string, any> | null | undefined): boolean {
  const geo = targeting?.geo_locations;
  if (!geo || typeof geo !== "object") return false;
  if (Array.isArray(geo.countries) && geo.countries.some((c: any) => String(c).toUpperCase() === "IN")) return true;
  // A city or region key resolved through Meta's India taxonomy. This
  // codebase only ever resolves Indian locations (metaTargeting.ts), so
  // any resolved city or region here is in India.
  if (Array.isArray(geo.cities) && geo.cities.length > 0) return true;
  if (Array.isArray(geo.regions) && geo.regions.length > 0) return true;
  return false;
}

export type Declaration =
  /** Send nothing. An ordinary business, exactly like an unticked box. */
  | { kind: "none" }
  /** Stop, and tell the owner what Meta needs. */
  | { kind: "refuse"; reason: string }
  /** Only ever reachable once a verified business is on record. */
  | { kind: "declare"; value: typeof INDIA_FINSERV };

/**
 * What to do about the declaration for this launch.
 *
 * THE DEFAULT IS SILENCE, and that is the important half. An ordinary
 * business sends no field at all — the same state as the unticked box
 * in Ads Manager, which Meta accepted on 19 November 2026. Adding a
 * "this is not finance" declaration would be a claim nobody asked for,
 * and the founder's rule forbids declaring in that direction too.
 */
export function declarationFor(input: {
  india: boolean;
  evidence: RegulatedEvidence;
  /**
   * The owner's own answer, when one is on record. `false` means they
   * said it is not a finance ad; `true` means they said it is AND are
   * verified with Meta. Undefined means they have never been asked.
   *
   * Nothing writes this yet — the question belongs with the one
   * proposed commit 10 asks, so there is one way of asking rather than
   * two. Until then an unanswered business with evidence is refused,
   * which is the safe direction.
   */
  ownerSaysFinance?: boolean;
}): Declaration {
  // Not an India audience: the field does not apply at all.
  if (!input.india) return { kind: "none" };

  // The owner has said it is not finance. Their word, on record, beats
  // a keyword match — which is the point of asking.
  if (input.ownerSaysFinance === false) return { kind: "none" };

  if (input.ownerSaysFinance === true) {
    // Reachable only when something records a verified business. Today
    // nothing does, so this is a declaration that cannot be made by
    // accident — and when it can, the identities must go with it.
    return { kind: "declare", value: INDIA_FINSERV };
  }

  if (input.evidence.found.length > 0) {
    const what = input.evidence.found.join(", ");
    const where = input.evidence.where ?? "this ad";
    return {
      kind: "refuse",
      reason:
        `This ad can't go live yet. ${where} mentions ${what}, and Meta treats securities and investment ads in India as a regulated category. ` +
        `Before one can run, Meta needs the advertiser verified — the business paying for the ad and the business benefiting from it, with SEBI registration details, or identity verification if you're exempt. ` +
        `That's set up on the Meta side, not here. If this isn't a finance or investment ad, tell me and I'll record that and launch it.`,
    };
  }

  return { kind: "none" };
}

// ─────────────────────────────────────────────────────────────────────
// META'S SPECIAL AD CATEGORIES, AND THE MATCH THAT FAILS OPEN
// ─────────────────────────────────────────────────────────────────────
//
// FOUND 19 NOVEMBER 2026. `isSpecialAdCategory` (metaTargeting.ts) is
// an exact, trimmed, lowercased match against one key, "real estate",
// and the business category it reads is FREE TEXT with suggestions, not
// a fixed list.
//
// So "Real Estate" is declared as HOUSING, and "Real Estate Agent",
// "Property Dealer", "Realestate" and "Real Estate & Rentals" are all
// declared as NONE.
//
// IT FAILS OPEN, in the direction that costs the owner. An undeclared
// housing ad is sent with the age, gender and interest targeting Meta
// legally strips from housing ads. metaTargeting's own comment names
// the stake — a misdeclared category is "an account policy risk at
// worst" — and the unguarded case is the UNDER-declaration.
//
// The reverse mistake is mild by comparison: a business wrongly
// declared HOUSING gets geo-only targeting and a narrower audience. It
// delivers; it just delivers less well.
//
// WHY NOT A LONGER LIST OF SPELLINGS. It would still miss the next one,
// and a list of trade words is what Rule 3 forbids. The answer is to
// ask, once, and remember — the founder's decision of 19 November 2026.
//
// THE TERMS BELOW ARE META'S OWN SPECIAL-AD-CATEGORY SCOPE, the same
// justification as INDIA_FINSERV above: identical for every business on
// the platform, used only to RAISE A QUESTION and stop a launch, never
// to write copy.

/** Meta's special ad categories, as the campaign field spells them. */
export const SPECIAL_CATEGORIES = ["HOUSING", "EMPLOYMENT", "CREDIT"] as const;
export type SpecialCategory = (typeof SPECIAL_CATEGORIES)[number];

/**
 * Terms that mean the business MIGHT fall inside a special ad category.
 *
 * NOT A CLASSIFIER, for the same reason the finance list is not one. A
 * builder sells property and a recruiter advertises jobs, but so does a
 * sign-writer who says "property signage" and a shop hiring one person.
 * A match is a question.
 */
const SPECIAL_TERMS: { pattern: RegExp; category: SpecialCategory; what: string }[] = [
  { pattern: /\breal\s*-?\s*estate\b/i, category: "HOUSING", what: "real estate" },
  { pattern: /\bpropert(?:y|ies)\b/i, category: "HOUSING", what: "property" },
  { pattern: /\bhousing\b/i, category: "HOUSING", what: "housing" },
  { pattern: /\brealtor\b/i, category: "HOUSING", what: "realtors" },
  { pattern: /\b(?:flats?|apartments?)\s+(?:for\s+)?(?:sale|rent)\b/i, category: "HOUSING", what: "flats for sale or rent" },
  { pattern: /\bto\s*-?\s*let\b|\bletting\s+agent\b/i, category: "HOUSING", what: "letting" },
  { pattern: /\brecruit(?:ment|er|ing)\b/i, category: "EMPLOYMENT", what: "recruitment" },
  { pattern: /\bstaffing\s+(?:agency|services?)\b/i, category: "EMPLOYMENT", what: "staffing" },
  { pattern: /\bjob\s+(?:portal|board|placement|consultan)/i, category: "EMPLOYMENT", what: "job placement" },
  { pattern: /\bhiring\s+(?:agency|solutions?)\b/i, category: "EMPLOYMENT", what: "hiring services" },
  { pattern: /\b(?:home|personal|business|gold)\s+loans?\b/i, category: "CREDIT", what: "loans" },
  { pattern: /\bcredit\s+card\b/i, category: "CREDIT", what: "credit cards" },
  { pattern: /\bmortgage\b/i, category: "CREDIT", what: "mortgages" },
  { pattern: /\blending\b|\bmoney\s*lender\b/i, category: "CREDIT", what: "lending" },
];

export type SpecialEvidence = {
  /** The category it points at, when anything does. */
  category: SpecialCategory | null;
  /** The plain-language thing that was spotted. */
  what: string | null;
  where: string | null;
};

const NO_EVIDENCE: SpecialEvidence = { category: null, what: null, where: null };

/** Look for a hint, in the business's own words. Never a verdict. */
export function specialCategoryEvidence(
  sources: { label: string; text: string | null | undefined }[]
): SpecialEvidence {
  for (const { label, text } of sources) {
    if (!text || !String(text).trim()) continue;
    const hit = SPECIAL_TERMS.find((t) => t.pattern.test(String(text)));
    if (hit) return { category: hit.category, what: hit.what, where: label };
  }
  return NO_EVIDENCE;
}

/** The registry key. Stable forever — renaming it re-asks the owner. */
export const SPECIAL_CATEGORY_QUESTION = "special_ad_category";

export type SpecialDeclaration =
  /** Declare it. Either an exact category match, or the owner said so. */
  | { kind: "declare"; value: SpecialCategory }
  /** No category applies — what almost every business gets. */
  | { kind: "none" }
  /** Stop and ask. Evidence exists and the owner has never answered. */
  | { kind: "ask"; question: string; reason: string };

/**
 * What to declare for this business.
 *
 * THE ORDER IS THE POINT. An exact match is already certain and is
 * declared without asking anybody — that is today's behaviour and it
 * does not change. The owner's recorded answer comes next, because a
 * person who has told us beats a pattern. Only then does evidence
 * raise a question, and only when nothing has been recorded.
 *
 * BLOCK, NOT BROAD. Unlike an irrelevant interest there is no safe
 * middle: the declaration is binary, Meta enforces it legally, and
 * sending NONE on a maybe is a false declaration in exactly the
 * direction the founder forbade. So an unanswered maybe stops the
 * launch and asks.
 */
export function specialDeclarationFor(input: {
  /** From isSpecialAdCategory — today's exact match, unchanged. */
  exact: string | null;
  evidence: SpecialEvidence;
  /**
   * The owner's recorded answer: the category they confirmed, or null
   * if they said none applies. Undefined means never asked.
   */
  ownerAnswer?: SpecialCategory | null;
}): SpecialDeclaration {
  if (input.exact) return { kind: "declare", value: input.exact as SpecialCategory };
  if (input.ownerAnswer === null) return { kind: "none" };
  if (input.ownerAnswer) return { kind: "declare", value: input.ownerAnswer };
  if (!input.evidence.category) return { kind: "none" };

  const where = input.evidence.where ?? "this business";
  return {
    kind: "ask",
    question: SPECIAL_CATEGORY_QUESTION,
    reason:
      `Before this ad can run, one question needs answering once. ${where} mentions ${input.evidence.what}, ` +
      `and Meta treats ads about housing, jobs or credit as a special category — they have to be declared, and Meta removes age, gender and interest targeting from them by law. ` +
      `Declaring it wrongly either way is a problem, so I won't guess. Answer the "special category" question in your business details and I'll remember it; this ad will launch straight after.`,
  };
}
