// Checking generated marketing copy against what the business can back up.
//
// Deterministic and cheap: pattern-matched, no second AI call, so it can
// sit on every generation. It looks for the claim types an AI invents
// and a small business would be held to — customer counts, ratings,
// offers and prices that aren't in the store, rankings and superlatives,
// guarantees, fake urgency, health/efficacy claims and promised results
// — and allows any of them the business ITSELF already makes (on its
// site, in its catalogue, in Business Knowledge). The owner is
// accountable for their own claims; the point is that Hawlai never
// invents one on their behalf.
//
// Low-friction by design: offending SENTENCES are removed and the owner
// is told what and why. Nothing is blocked outright, and ordinary
// persuasive copy passes untouched.
//
// Two modes (approved 2026-09-17, industry-agnostic overhaul Phase 2):
//  - "publish" (the default) — for anything that goes out with nobody
//    reading it first: every unverifiable claim is removed.
//  - "draft" — for copy the owner reviews before using it: a PRICE that
//    can't be matched to the catalogue, site or Business Knowledge is
//    kept and flagged instead, because service and quote-based businesses
//    often have real prices Hawlai has no record of. Every other kind of
//    claim is still removed.

import { describeShipping, knownText, normalise, physicalProducts, serviceItems, type BusinessFacts } from "./businessFacts";
import { computeShippingAmount } from "@/lib/shipping";
import { checkNarrative, narrativeNote, type NarrativeFinding } from "./narrativeProvenance";

const NOUNS = "homes|customers|families|buyers|people|clients|orders|reviews|ratings|shoppers|users|households|students|patients|members|subscribers";
// THE MODIFIER BETWEEN THE NUMBER AND THE NOUN (2026-10-09).
//
// "We have over 500 five-star reviews" was caught by NOTHING — not with
// facts, not without — while "500 reviews" and "1,000+ happy reviews"
// were both refused. `reviews` is in NOUNS and the bare form worked; the
// hole was this group. It was a fixed allowlist of six phrasings, and it
// is optional-but-ANCHORED, so ANY unlisted adjective between the number
// and the noun broke the whole match. "five-star" spelled out,
// "genuine", "glowing" — all invisible. A fake review count is social
// proof a stranger acts on.
//
// WHY NOT `(?:[a-z-]+\s+){0,2}`, WHICH UNITS_SOLD BELOW DOES USE.
// Arbitrary words would make "Flat 500 off on orders above 2000" match
// as a claim of 500 orders — measured, not guessed: that line is clean
// today and the money rules already read it correctly. A second rule
// inventing a count from honest discount copy is a false positive on the
// commonest sentence in Indian retail. So this is a FAMILY of praise
// words, allowed to repeat up to twice ("500 genuine five-star
// reviews"), rather than any word at all.
const PRAISE = "happy|satisfied|loyal|delighted|verified|genuine|glowing|real|trusted|repeat|returning|positive|rave|authentic|certified";
/** Star ratings, in digits and spelled out, hyphenated or spaced. */
const STARS = "(?:5|4|five|four)[- ]?star";
const SOCIAL_PROOF = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|lakhs?|lacs?)?\\s*\\+?\\s*(?:(?:${PRAISE}|${STARS})\\s+){0,2}(${NOUNS})\\b`,
  "gi"
);
const VAGUE_CROWD = new RegExp(`\\b(hundreds|thousands|lakhs|millions)\\s+of\\s+(?:happy\\s+|satisfied\\s+|loyal\\s+)?(?:${NOUNS})\\b`, "gi");
const UNITS_SOLD = /(\d[\d,]*)\s*(k|lakhs?)?\s*\+?\s*(?:[a-z-]+\s+){0,2}sold\b/gi;
const RATINGS = /\b\d(?:\.\d)?\s*[- ]?(?:\/\s*5\b|stars?\b|★)|\brated\s+\d/i;
const YEARS = /\b(\d+)\s*\+?\s*years?\s+(?:of|in|experience|serving|trusted)/i;
const PACKAGING = /(keepsake|gift)\s*(box|boxes|packaging|wrap|wrapping|bag|tin)/gi;
const PERCENT_OFF = /(\d{1,3})\s*%\s*off/gi;
const FLAT_OFF = /(?:₹|\brs\.?|\binr)\s?(\d[\d,]*)\s*off/gi;
// Any rupee amount, however it's written: ₹1,499 · Rs. 500 · INR 2,000 ·
// ₹1.5 lakh · 999/- · 500 rupees. Amounts followed by "off" are discounts,
// checked separately above.
const MONEY_UNIT = "(k|lakhs?|lacs?|l|crores?|cr)?\\b";
const PRICE = new RegExp(
  // (?![\d,]) keeps the number whole, so "₹2,000 off" can't backtrack
  // into a price of "₹2".
  `(?:₹|\\brs\\.?|\\binr)\\s?(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![\\d,])\\s*${MONEY_UNIT}(?!\\s*off\\b)|\\b(\\d[\\d,]*(?:\\.\\d{1,2})?)(?![\\d,])\\s*(?:\\/-|rupees\\b)`,
  "gi"
);

// Product-attribute claims a business must be able to substantiate.
//
// The second group — materials, ingredients and how a thing was made —
// was approved on 2026-10-02 after a dry run, and it is the reason this
// list matters more than it looks. A generated homepage said "No
// paraffin. No synthetic shortcuts." for a business whose records said
// nothing of the kind, and because the site counted as its own evidence
// that line then backed every later mention of paraffin. With the site
// excluded as evidence (Stage 2) and these terms enabled, five of six
// pages on that site have something to answer for.
//
// Every one of these is allowed the moment the business says it
// somewhere of its own — Business Knowledge, the catalogue, a brand
// description. The check is not "don't claim this"; it is "say it
// yourself first".
const CLAIM_TERMS = [
  "phthalate free", "paraben free", "sulphate free", "sulfate free", "all natural", "100% natural", "vegan", "cruelty free", "organic",
  "non toxic", "chemical free", "toxin free", "clean burning", "soot free", "eco friendly", "award winning", "warranty", "certified", "handcrafted in",
  // Wax and base materials.
  // "no paraffin" and "paraffin free" are claims; the bare word is a
  // noun. Gating it flagged a content idea about WHY paraffin was
  // rejected, which is discussing a material rather than claiming
  // anything — and the claim forms above already cover the real case.
  "paraffin free", "no paraffin", "soy wax", "pure soy", "beeswax", "coconut wax", "palm free",
  // Fragrance and additives.
  "no synthetic fragrance", "synthetic fragrance free", "no fake fragrance", "essential oil", "essential oils",
  "natural fragrance", "no added colour", "no added color", "dye free",
  // Wick and burn.
  //
  // THE LIVE CAPTION (8 Oct 2026) said "The candle burns clean, with no
  // soot collecting at the rim." The list already held "clean burning"
  // and "soot free" and neither matched: the model wrote the OTHER
  // surface form of both claims. One phrasing of a claim on a term list
  // is a list that catches the drafts that happen to agree with it.
  //
  // The Business Story says paraffin gives more smoke. It does not say
  // this candle gives none, and "more than paraffin" is not "none".
  "no soot", "without soot", "burns clean", "clean burn",
  "no smoke", "smoke free", "smokeless", "without smoke", "doesn't smoke", "does not smoke",
  "lead free", "cotton wick", "wooden wick", "zinc free",
  // Make and provenance.
  "hand poured", "handmade", "hand made", "small batch",
  // Adjacent categories, so this generalises past candles.
  "bpa free", "food grade", "stainless steel", "solid wood", "pure cotton", "100% cotton", "gold plated", "sterling silver",
  // ------------------------------------------------------------------
  // ENABLED 2026-10-09 (phase 3, item 4.2), after the three-category dry
  // run in scripts/claimTermsDryRun.mjs was read and approved.
  //
  // WHY. The allowlist entry in tests/multiTenantVocabulary.test.ts
  // recorded the gap in its own words: "the list leans toward one
  // category's materials because that is where the incidents happened,
  // and widening it to ghee, silk and cotton is follow-up work, not a
  // leak to strip." This is that follow-up work.
  //
  // Every term here is a COMPOSITION claim, so a draft keeps it with a
  // note saying what to write down; published copy drops it. The ones a
  // draft must still lose are in PERFORMANCE_CLAIMS above.
  // ------------------------------------------------------------------
  // Food and dairy.
  "pure ghee", "desi ghee", "a2 milk", "cold pressed", "stone ground", "fssai",
  "no preservatives", "preservative free", "farm fresh", "export quality",
  // Textiles.
  "pure silk", "100% silk", "handloom", "khadi", "colour fast", "color fast", "azo free",
  // Cross-category marks and grades. "100%" bare is deliberate: it
  // double-reports alongside "100% cotton", which the dry run showed and
  // which is accepted — an absolute is a claim whatever follows it.
  "100%", "a grade", "isi", "bis", "gi tagged", "iso certified",
];

/**
 * Wordings that mean the same claim.
 *
 * A business that records "paraffin-free" has said "no paraffin"; one
 * that records "hand-poured" has said "handmade". Treating those as
 * separate facts made the review list ask an owner to attest the same
 * thing three times, in three spellings, which is the software failing
 * to understand its own question.
 *
 * Grouped only where the wordings are genuinely interchangeable. "All
 * natural" and "natural fragrance" are NOT in one group: a narrow claim
 * must never license a broader one.
 */
/**
 * Does this claim term actually appear, as a term rather than as letters
 * inside another word?
 *
 * THE FALSE POSITIVE THAT FORCED THIS (2026-10-09). "isi" — the ISI mark
 * — was matched by `text.includes("isi")`, which is true of "visitors",
 * "vision", "decision", "precision" and "revision". The real CRO test
 * caught it: a perfectly honest suggestion reading "13 visitors, 0%
 * engagement" was refused as an unsubstantiated ISI certification claim.
 * My own three-category dry run missed it entirely, because none of my
 * invented fixture lines happened to contain a word like "visitors".
 * "bis" (the BIS mark) carries the same risk with "bistro" or "Bisleri".
 *
 * So a term is bounded at whichever end is a word character. "100%"
 * cannot take a boundary after the "%", and "pure cotton" is unaffected
 * either way — the rule only bites on the short acronyms, which is
 * exactly where it is needed.
 */
function termAppears(text: string, term: string): boolean {
  // A BOUNDARY AT THE START, ALWAYS. That alone kills the family of
  // false positives: "isi" inside "visitors", "vision", "decision",
  // "precision"; "a grade" inside "mega grade". In every one of those
  // the term sits MID-word, so requiring a word start is enough.
  //
  // AND AT THE END ONLY FOR SHORT SINGLE TOKENS. Closing the boundary on
  // everything broke plurals: "small batch" stopped matching "small
  // batches", and tests/siteClaimsReview.test.ts caught it on a real
  // Terms page. Substring matching at the tail is what lets one recorded
  // phrasing cover the forms the model actually writes. The only terms
  // that need the tail closed are the two- to four-letter marks, where a
  // word like "bistro" would otherwise match "bis".
  const shortToken = !/\s/.test(term) && /^[a-z]{2,4}$/.test(term);
  const open = /^[a-z0-9]/.test(term) ? "\\b" : "";
  const close = shortToken ? "\\b" : "";
  return new RegExp(`${open}${escapeRe(term)}${close}`, "i").test(text);
}

/**
 * CLAIM_TERMS that a DRAFT must still lose, not merely flag.
 *
 * What the product DOES (burn, smoke, soot, toxicity), what it is
 * medically or legally certified as, and anything a customer could be
 * harmed by relying on. Everything else in CLAIM_TERMS is a composition
 * claim and becomes draft-lenient — see findProblems for the reasoning
 * and the incident behind it.
 *
 * Deliberately OVER-inclusive: a composition term wrongly listed here
 * costs the owner one flagged sentence in a draft. A performance term
 * wrongly left out costs a real customer a false expectation, published.
 */
const PERFORMANCE_CLAIMS = new Set([
  // Burn and emissions — the 8 October caption's own words.
  "clean burning", "burns clean", "clean burn", "soot free", "no soot", "without soot",
  "no smoke", "smoke free", "smokeless", "without smoke", "doesn't smoke", "does not smoke",
  // Safety and toxicity.
  "non toxic", "toxin free", "chemical free", "lead free", "zinc free", "bpa free",
  "phthalate free", "paraben free", "sulphate free", "sulfate free",
  // Regulatory marks and awards: a claim to hold one is true or false,
  // never a matter of the owner's own wording.
  "certified", "award winning", "warranty", "food grade",
  // Absolutes about content, which read as safety assurances.
  "all natural", "100% natural", "chemical free", "cruelty free",
]);

const CLAIM_SYNONYMS: string[][] = [
  ["paraffin free", "no paraffin"],
  ["no synthetic fragrance", "synthetic fragrance free", "no fake fragrance"],
  ["handmade", "hand made", "hand poured", "handcrafted in"],
  ["no added colour", "no added color", "dye free"],
  ["cruelty free", "not tested on animals"],
  // One fact, six phrasings. An owner who records "soot free" has said
  // "no soot"; asking her to attest both would be the software failing
  // to understand its own question.
  ["soot free", "no soot", "without soot"],
  ["clean burning", "burns clean", "clean burn"],
  ["smoke free", "no smoke", "smokeless", "without smoke", "doesn't smoke", "does not smoke"],
  // ENABLED 2026-10-09 with the terms above. One fact, two phrasings:
  // the dry run's first version ignored these families and OVERSTATED
  // the damage, reporting that a candle maker who writes "hand-poured"
  // would lose "handmade".
  ["pure ghee", "desi ghee"],
  ["no preservatives", "preservative free"],
  ["pure cotton", "100% cotton"],
  ["pure silk", "100% silk"],
  ["colour fast", "color fast"],
  ["export quality", "export grade"],
];

/**
 * The grammatical forms of the same claim.
 *
 * WHY THIS EXISTS: "clean burning" was flagged as something the business
 * "doesn't claim anywhere", while their own Business Story said, in
 * Hinglish, "…woh cheez jo main promise karti hoon (clean burn) woh
 * khatam ho jaati hai". They had claimed it — in the verb form. The
 * evidence set is matched as plain text, so "clean burning" was not a
 * substring of "clean burn" and the owner was asked to confirm a fact
 * they had already written down.
 *
 * The Hinglish was never the problem: ownerFacts go into knownText
 * verbatim, whatever language they are in. The problem was "burning" vs
 * "burn", and it would have bitten an English sentence identically.
 */
function wordForms(term: string): string[] {
  const forms = new Set<string>([term]);
  const words = term.split(" ");
  const last = words[words.length - 1];
  const rest = words.slice(0, -1).join(" ");
  const with_ = (tail: string) => (rest ? `${rest} ${tail}` : tail);

  if (last.endsWith("ing") && last.length > 5) {
    const stem = last.slice(0, -3);
    forms.add(with_(stem));
    forms.add(with_(`${stem}s`));
    forms.add(with_(`${stem}ed`));
    // "burning" -> "burn", but also doubled consonants: "potting" ->
    // "pot". Only when the doubled letter is the same.
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) forms.add(with_(stem.slice(0, -1)));
  } else if (last.endsWith("ed") && last.length > 4) {
    const stem = last.slice(0, -2);
    forms.add(with_(stem));
    forms.add(with_(`${stem}ing`));
  } else if (last.length > 2) {
    forms.add(with_(`${last}ing`));
    forms.add(with_(`${last}s`));
  }
  return [...forms];
}

/** Whether the business has said this claim, in this wording or an equal one. */
function saidAnyOf(known: string, term: string): boolean {
  const family = CLAIM_SYNONYMS.find((group) => group.includes(term)) ?? [term];
  // Every synonym, in every form of its last word. A fact recorded once
  // should not have to be recorded again in a different tense.
  return family.flatMap(wordForms).some((wording) => known.includes(wording));
}

// Every way copy says shipping costs nothing — English and Hinglish.
const FREE_SHIPPING =
  /\bfree\s+(?:home\s+|doorstep\s+)?(?:shipping|delivery)\b|\b(?:shipping|delivery)\s+(?:is\s+|bilkul\s+|ekdum\s+)?(?:free|muft)\b|\bno\s+(?:shipping|delivery)\s+(?:charges?|fees?|cost)\b|\b(?:zero|₹\s?0)\s+(?:shipping|delivery)\b|\bships?\s+free\b/i;

// "number 1" IN DIGITS WAS THE ONE FORM NOTHING CAUGHT, and it is the
// form people write. "no.1", "#1" and "number one" were all here from
// the start; `no\.?\s?1` cannot match "number 1" because "mber" follows
// the "no", and `number\s?one` needs the word. So Brand Kit, asked to
// write "India's number 1 candle brand" as a tagline, wrote it.
//
// Added HERE rather than to SUPERLATIVE_WORDS deliberately: the
// possessive-superlative rule would then match the same phrase as well,
// and the owner would be shown one claim twice, described two different
// ways. One phrase, one reason.
//
// It does mean "pour batch number 1" is flagged, exactly as "batch no.1"
// already was. That costs a glance on a how-to draft, and it is what
// keeps "#1 in Shahjahanpur" from needing a place word attached.
const RANKING = /(?<![\w#])(?:no\.?\s?1|number\s?(?:one|1)|#\s?1)(?![\w])/gi;
const PLACE = "india|the\\s+world|the\\s+country|the\\s+city|town|the\\s+market|the\\s+region|the\\s+state";
// The "-est" forms, added after a Terms page claimed "our candles are
// the safest in India" and nothing flagged it: only `best` and `finest`
// were ever on this list. Enumerated rather than matched as `\w+est`,
// because that pattern also matches "honest" and "interest" and would
// flag "our honest approach in India".
const SUPERLATIVE_WORDS = "best|finest|safest|cleanest|purest|strongest|freshest|healthiest|longest[- ]lasting|top[- ]rated|most\\s+trusted|most\\s+loved|most\\s+popular|leading|largest|biggest|favou?rite|number\\s+one|no\\.?\\s?1";
const POSSESSIVE_SUPERLATIVE = new RegExp(`\\b(?:india|the\\s+world|the\\s+city|the\\s+country)['’]s\\s+(?:${SUPERLATIVE_WORDS}|top)\\b`, "gi");
const BEST_SELLING = /\b(?:best[- ]?sell(?:ing|ers?)|top[- ]?sell(?:ing|ers?)|fastest[- ]selling|most[- ]ordered)\b/gi;
const SCARCITY = /\b(?:selling\s+(?:out\s+)?fast|almost\s+(?:sold\s+out|gone)|only\s+\d+\s+(?:left|pieces?\s+left|in\s+stock)|limited\s+stock|(?:just\s+)?a\s+few\s+left|while\s+stocks?\s+lasts?)\b/gi;

// The same urgency, about a service: "Slots limited", "only 3 seats left",
// "slots bhar rahe hain".
//
// THE LIVE CASE (2026-09-21): a workshop caption ended "₹800 · Slots
// limited · Book karo". Nothing on record says how many slots a workshop
// has — a service carries no stock count, deliberately (migration 188:
// services are booked, never counted). The stock patterns above all talk
// about pieces and shelves, so every one of these went straight through.
// Told to a customer, it is an invented reason to hurry.
const SEATS = "slots?|seats?|spots?|places?|batch(?:es)?";
const SLOT_SCARCITY = new RegExp(
  "\\b(?:" +
    // only 3 slots left / sirf 2 seats bache hain
    `(?:only|just|sirf|bas)\\s+\\d+\\s+(?:${SEATS})(?:\\s+(?:left|remaining|available|bache(?:\\s+hain)?|baaki(?:\\s+hain)?|reh\\s+gaye))?` +
    // slots limited / seats filling fast / slots bhar rahe hain
    `|(?:${SEATS}|booking)s?\\s+(?:are\\s+|is\\s+)?(?:limited|limited\\s+hain|filling\\s+(?:up\\s+)?fast|almost\\s+full|nearly\\s+full|bhar\\s+rahe\\s+hain|bhar\\s+rahi\\s+hain|khatam\\s+ho\\s+rahe\\s+hain)` +
    // limited slots / limited seats
    `|limited\\s+(?:${SEATS})` +
    // a few slots left / last few seats
    `|(?:a\\s+)?few\\s+(?:${SEATS})\\s+(?:left|remaining)|last\\s+(?:few\\s+)?(?:${SEATS})` +
    ")\\b",
  "gi"
);
// A comparison, including the kind that never names what it is better
// THAN.
//
// FOUND LIVE (3 Oct 2026) on the About page: "Our soy wax burns slower,
// cleaner, and safer than mass-market paraffin" was caught, and the
// sentence right after it — "It burns better and safer." — was not,
// because every pattern here required an explicit "than X". A
// comparison with nothing named is still a comparison; it is the same
// claim with the other party left implicit, and it is harder to answer
// rather than weaker.
//
// Bounded to how the PRODUCT performs (burns, lasts, smells, cleans,
// holds, performs), so an ordinary "a better way to unwind" is left
// alone — that is a promise about the reader's evening, not a measurable
// claim against someone else's wax.
const PRODUCT_COMPARATIVE =
  /\b(?:burns?|burning|lasts?|lasting|smells?|cleans?|holds?|performs?|melts?|sets?)\s+(?:\w+,?\s+){0,3}(?:better|cleaner|safer|longer|slower|stronger|brighter|purer|faster)\b/gi;

// A COMPARISON THAT USES NO COMPARATIVE WORD AT ALL.
//
// FOUND LIVE (8 Oct 2026), on a public Facebook post: "Soy wax carries
// fragrance differently from paraffin." Both detectors above missed it,
// and for the same reason: COMPARATIVE needs one of a handful of
// comparative adjectives plus the word "than", and PRODUCT_COMPARATIVE
// needs a performance verb plus a comparative adjective. This sentence
// has neither. It names the rival material outright and asserts a
// difference in behaviour, which is a comparison in every sense that
// matters to whoever has to answer for it.
//
// Scoped to the shapes that can only be comparisons — "different(ly)
// from/than/to X", "compared to/with X", "versus X". "unlike" keeps its
// narrower existing rule rather than being widened here, because
// "unlike anything you've smelled" is flourish, not a claim about
// somebody else's wax.
//
// Second person is excluded: "different to your usual" compares with the
// reader's own last candle, which names no rival and asserts nothing
// about one. The trade-off is real and taken deliberately — "different
// from your old brand" goes unflagged too. The alternative was flagging
// every sentence that uses the word "different" about the customer,
// which is ordinary copy, and a guard nobody can keep is a guard that
// gets switched off.
const NAMED_COMPARISON =
  /\b(?:differently|different)\s+(?:from|than|to)\s+(?!you\b|your\b|me\b|my\b|us\b|our\b|each\s+other\b)[\w'-]+|\bcompared\s+(?:to|with)\s+[\w'-]+|\b(?:versus|vs\.?)\s+[\w'-]+/gi;

// DISPARAGEMENT BY NEGATION.
//
// The sentence straight after the one above: "It releases slowly,
// evenly, and without the sharp synthetic hit that fades almost as
// quickly as it arrives." Nothing is named, and nothing has to be: "the
// sharp synthetic hit" is an attribute asserted about the alternative,
// and saying this product is without it says the others have it. It is
// the same claim as "ours is better", with the comparison moved into an
// assumption the reader is invited to share.
//
// Only the pejoratives a competitor would dispute. "without the fuss",
// "without the wait" are about the customer's experience and are left
// alone.
//
// The quote stops at the noun the pejorative modifies ("without the
// sharp synthetic hit") rather than running a fixed number of
// characters, which cut the first version off mid-word: an owner being
// asked to justify a phrase should be shown a phrase.
const RIVAL_DISPARAGEMENT =
  /\b(?:without|no|none\s+of)\s+(?:the|that|those|any)?\s*(?:[\w-]+[\s-]){0,2}(?:synthetic|artificial|chemical|chemically|toxic|harsh|cheap|nasty|fake)(?:\s+[\w-]+)?/gi;

// PRECISION THE BUSINESS NEVER CLAIMED.
//
// "The wick is set at the exact centre, by hand." The Business Story
// says the wick must be fixed in the right centre — an intention, not a
// tolerance. "Exact" is a measurement claim, and nothing measures it.
//
// Narrow on purpose: the absolute word has to be attached to something
// physical about the making. "exactly what you need" is not touched.
const EXACTNESS =
  /\b(?:exact|exactly|precisely|perfectly)\s+(?:the\s+)?(?:centre|center|centred|centered|aligned|level|even|measured|uniform|straight|same\s+(?:size|weight|height))\b/gi;

const COMPARATIVE =
  /\b(?:better|cheaper|stronger|safer|longer[- ]lasting|more\s+affordable)\s+than\s+(?!ever\b|before\b|yesterday\b|last\b|you\s+think\b)[\w'-]+|\bunlike\s+(?:other|most|any)\s+(?:brands?|stores?|shops?|sellers?|competitors?|companies)\b|\b(?:cheapest|lowest\s+prices?)\b/gi;
const GUARANTEE = /\b(?:guarantee[ds]?|money[- ]back|risk[- ]free|100\s*%\s*(?:satisfaction|safe|effective|pure|genuine|results?))\b/gi;
const HEALTH =
  /\b(?:cures?|heals?|treats?)\s+(?:your\s+)?(?:acne|diabetes|cancer|pain|anxiety|depression|insomnia|hair\s*fall|infections?|diseases?|arthritis|asthma|pcos|thyroid|blood\s+pressure|migraines?|headaches?|colds?|coughs?)\b|\ba\s+cure\s+for\b|\b(?:clinically|scientifically|medically|dermatologically)\s+(?:proven|tested|approved)\b|\b(?:doctor|dermatologist|dentist)[- ](?:recommended|approved|tested)\b|\brelieves?\s+(?:stress|anxiety|pain|insomnia|depression|headaches?|migraines?)\b|\b(?:boosts?|strengthens?)\s+(?:your\s+)?immunity\b|\b(?:lose|losing)\s+\d+\s*(?:kg|kgs|kilos?)\b|\bweight\s+loss\b|\bfda[- ]approved\b/gi;
const RESULTS =
  /\b\d+(?:\.\d+)?\s*(?:%|x|times)\s+(?:more|faster|better|higher|increase|growth|results|roi|returns|profits?|sales|leads|customers)\b|\b(?:double|triple)\s+your\b|\bguaranteed\s+(?:selection|placement|results?|returns?|admission)\b|\b100\s*%\s+(?:placement|selection)\b/gi;

const CROWD_MIN: Record<string, number> = { hundreds: 200, thousands: 2000, lakhs: 200000, millions: 2000000 };

function amount(raw: string, unit?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  const u = (unit ?? "").toLowerCase();
  if (u === "k") return n * 1e3;
  if (u === "l" || u.startsWith("lakh") || u.startsWith("lac")) return n * 1e5;
  if (u === "cr" || u.startsWith("crore")) return n * 1e7;
  return n;
}

/** Every rupee amount written in a piece of text. */
export function moneyAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(PRICE)) out.push(amount(m[1] ?? m[3], m[2]));
  return out.filter((n) => Number.isFinite(n));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prices the business really charges or offers — what a "₹X" in copy must be one of. */
function realAmounts(f: BusinessFacts): Set<number> {
  const out = new Set<number>();
  for (const p of f.products) {
    out.add(p.price);
    for (const o of f.offers) {
      if (o.percent !== null) out.add(Math.round(p.price * (1 - o.percent / 100)));
      if (o.flat !== null) out.add(p.price - o.flat);
    }
  }
  for (const o of f.offers) if (o.flat !== null) out.add(o.flat);
  if (f.shipping?.rate != null) out.add(f.shipping.rate);
  if (f.shipping?.freeThreshold != null) out.add(f.shipping.freeThreshold);
  // Prices the business states itself — on its site, in its descriptions,
  // in Business Knowledge ("Consultation fee ₹500").
  for (const n of moneyAmounts(knownText(f))) out.add(n);
  return out;
}

/** Same amount to the paisa — "₹549" and "₹549.00" are one price. */
function isRealAmount(amounts: Set<number>, v: number): boolean {
  for (const a of amounts) if (Math.abs(a - v) < 0.005) return true;
  return false;
}

export type ClaimsMode = "publish" | "draft";
/**
 * THREE TIERS, not two (2026-10-09).
 *
 * "price"  — the owner knows whether it is right, so a DRAFT keeps it
 *            with a warning. Publishing removes it.
 * "claim"  — removed in both modes. A fabricated review count, a
 *            ranking, a star rating: Hawlai holds the data that would
 *            settle these, and it says they are false. Nothing the owner
 *            can tell us makes "500 reviews" true when there are three
 *            orders on record.
 * "substantiation" — NEW, and it behaves like "price" for the same
 *            reason. "pure cotton", "organic", "FSSAI" are facts only
 *            the OWNER holds; Hawlai has no data that contradicts them,
 *            it simply has none that supports them. Deleting such a
 *            sentence from a draft tells a truthful owner their own
 *            product is a lie. So a draft keeps it, names it, and says
 *            what to write down; the publish path still removes it,
 *            because nobody is reading there.
 */
type Problem = { reason: string; kind: "price" | "claim" | "substantiation" };

// A link: with a scheme, starting www., or a bare domain on a common TLD.
// Never the domain half of an email address — "someone@gmail.com" is an
// address, not a link to gmail.com.
const LINK = /(?<![@\w.-])(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|in|co\.in|net|org|shop|store|online|io|co|app)(?![a-z0-9-])(?:\/[^\s<>"'()\]]*)?)/gi;

function hostOf(link: string): string {
  const withScheme = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return link.toLowerCase().replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Links in `text` that don't go to this business's own website.
 *
 * THE LIVE CASE: a promo email's button pointed to
 * "candlebyqaaf.com/products/lavender-candle". That domain does not exist;
 * the real store is hawlai.online/site/candle-by-qaaf. A broken link in
 * copy sent to a customer is wrong whoever receives it.
 *
 * Allowed: the storefront's own host, and any link the owner has written
 * into their own content (site, Business Knowledge) — their links are
 * theirs to use.
 *
 * THE SECOND LIVE CASE (2026-09-21): a workshop caption said "Book here"
 * and linked https://calendly.com — Calendly's own homepage, not
 * https://calendly.com/candlebyqaaf/workshop, which is where the booking
 * actually is. This check passed it, because it let a link through when
 * its HOST appeared anywhere in the owner's own text, and the host of the
 * real booking link is calendly.com. On a host the business does not own,
 * that is the difference between a booking and a dead end — so a
 * third-party link must now match the owner's link itself, or go deeper
 * into it. Only the storefront's own host keeps host-wide freedom, because
 * every path under it really is theirs.
 */
export function findUnsupportedLinks(text: string, f: BusinessFacts): string[] {
  const allowedHosts = new Set<string>();
  if (f.links?.store) allowedHosts.add(hostOf(f.links.store));
  for (const p of f.links?.products ?? []) allowedHosts.add(hostOf(p.url));
  const known = knownText(f);

  /**
   * A subdomain of the owner's own host is the owner's.
   *
   * MEASURED 2026-10-03: cdn.hawlai.online was read as a foreign host,
   * because the allowed set held the exact host only. An image served
   * from a CDN subdomain, a staging host, an app subdomain — all of them
   * were the business's own address being called somebody else's.
   *
   * Matched on a dot boundary, never a bare suffix: "hawlai.online" must
   * not make "evilhawlai.online" or "hawlai.online.attacker.com" ours.
   * Only downwards, too — owning cdn.example.com does not make
   * example.com theirs.
   */
  const isOwnHost = (host: string) =>
    Array.from(allowedHosts).some((allowed) => allowed !== "" && (host === allowed || host.endsWith(`.${allowed}`)));

  // Every address the owner has actually given, as whole links. Read as
  // links, not as text: "calendly.com" IS a substring of
  // "calendly.com/candlebyqaaf/workshop", and matching text was exactly
  // how the homepage passed as verified.
  const tidy = (s: string) => normalise(s).replace(/[.,;:!?]+$/, "").replace(/\/+$/, "");
  const ownLinks = new Set<string>();
  if (f.links?.booking) ownLinks.add(tidy(f.links.booking));
  for (const p of f.links?.products ?? []) ownLinks.add(tidy(p.url));
  for (const p of f.products) if (p.bookingUrl) ownLinks.add(tidy(p.bookingUrl));

  const reasons: string[] = [];
  for (const m of text.matchAll(LINK)) {
    const link = m[0].replace(/[.,;:!?]+$/, "");
    const host = hostOf(link);
    if (isOwnHost(host)) continue;
    const n = tidy(link);
    // One of the owner's own links, or a page inside one.
    const own = Array.from(ownLinks).filter((k) => k !== "");
    if (own.some((k) => n === k || n.startsWith(`${k}/`) || n.startsWith(`${k}?`))) continue;
    // A link the owner has written somewhere in their own content. Unless
    // it is an ANCESTOR of one of their real links — "calendly.com" when
    // the booking is at "calendly.com/candlebyqaaf/workshop". That is not
    // their page; it only looked like one because their page's address
    // contains it.
    const ancestorOfOwn = own.some((k) => k.startsWith(`${n}/`) || k.startsWith(`${n}?`));
    if (known.includes(n) && !ancestorOfOwn) continue;
    const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
    const sameHostAsBooking = booking ? hostOf(booking) === host : false;
    reasons.push(
      sameHostAsBooking && booking
        ? `a link to "${link}" — that is not the booking page, it's the front door of ${host}; bookings go to ${booking}`
        : f.links?.store
        ? `a link to "${link}" — that isn't this business's website; the store is ${f.links.store}`
        : `a link to "${link}" — this business has no published website to link to`
    );
  }
  return Array.from(new Set(reasons));
}

/**
 * Claims in `text` that the facts don't support. Each entry says what and why.
 *
 * Anything the business already says itself (site, catalogue, Business
 * Knowledge, brand pillars) is treated as supported: the owner stands
 * behind their own claims; Hawlai just mustn't invent new ones.
 */
export function findUnsupportedClaims(text: string, f: BusinessFacts): string[] {
  return Array.from(new Set(findProblems(text, f).map((p) => p.reason)));
}

function findProblems(text: string, f: BusinessFacts): Problem[] {
  const problems: Problem[] = [];
  const reasons = {
    push: (...rs: string[]) => {
      for (const reason of rs) problems.push({ reason, kind: "claim" });
    },
    /** A claim only the owner can substantiate — see the Problem type. */
    substantiation: (...rs: string[]) => {
      for (const reason of rs) problems.push({ reason, kind: "substantiation" });
    },
  };
  const known = knownText(f);
  const t = normalise(text);
  const said = (phrase: string) => known.includes(normalise(phrase));
  const each = (re: RegExp, reason: (m: RegExpMatchArray) => string | null) => {
    for (const m of text.matchAll(re)) {
      if (said(m[0])) continue;
      const r = reason(m);
      if (r) reasons.push(r);
    }
  };

  // Numbers about customers, sales and reviews
  const realCount = Math.max(f.allTime.paidOrders, f.allTime.leads);
  each(SOCIAL_PROOF, (m) =>
    amount(m[1], m[2]) > realCount ? `"${m[0].trim()}" — the business has ${f.allTime.paidOrders} paid order(s) and ${f.allTime.leads} lead(s) on record` : null
  );
  each(VAGUE_CROWD, (m) => (realCount < CROWD_MIN[m[1].toLowerCase()] ? `"${m[0]}" — the business has ${f.allTime.paidOrders} paid order(s) on record` : null));
  each(UNITS_SOLD, (m) => (amount(m[1], m[2]) > f.allTime.paidOrders ? `"${m[0].trim()}" — ${f.allTime.paidOrders} paid order(s) on record` : null));
  if (RATINGS.test(text) && !said(text.match(RATINGS)![0])) reasons.push("a star rating — Hawlai has no rating data for this business");
  const years = text.match(YEARS);
  if (years && !known.includes(`${years[1]} year`)) reasons.push(`"${years[0].trim()}" — no years-in-business figure on record`);

  // Offers, prices, shipping and packaging that must match the store
  // "Free shipping" is true only if CHECKOUT charges ₹0 — decided by the
  // same function checkout uses (lib/shipping), on the cheapest product
  // alone. A free-above-₹X store may say it only alongside its real
  // threshold ("free shipping above ₹999").
  const freeShipping = text.match(FREE_SHIPPING);
  if (freeShipping && !said(freeShipping[0])) {
    const s = f.shipping;
    // Shipping is charged on physical products only; a business that
    // sells only services has nothing to ship at all.
    const goods = physicalProducts(f);
    if (!goods.length && serviceItems(f).length) {
      reasons.push(`free shipping ("${freeShipping[0]}") — this business sells services, nothing is shipped`);
    } else {
      const cheapest = goods.length ? Math.min(...goods.map((p) => p.price)) : 0;
      const charged = !s || computeShippingAmount({ shipping_mode: s.mode, shipping_rate: s.rate, shipping_free_threshold: s.freeThreshold }, cheapest) > 0;
      const t = s?.freeThreshold;
      const namesThreshold =
        s?.mode === "free_above" && t != null &&
        new RegExp(`(?:above|over|from|orders?\\s+of)\\s*₹\\s?${t}\\b|₹\\s?${t}\\s*(?:\\+|or\\s+more|and\\s+above|se\\s+upar|ke\\s+upar)`, "i").test(text);
      if (charged && !namesThreshold) reasons.push(`free shipping ("${freeShipping[0]}") — the store's shipping is ${describeShipping(s)}`);
    }
  }
  each(PACKAGING, (m) => `"${m[0]}" — not mentioned anywhere on the site or in the products`);
  each(PERCENT_OFF, (m) => (f.offers.some((o) => o.percent === Number(m[1])) ? null : `"${m[0]}" — no active discount code gives ${m[1]}% off`));
  each(FLAT_OFF, (m) => {
    const v = amount(m[1]);
    return f.offers.some((o) => o.flat === v) ? null : `"${m[0]}" — no active discount code gives ₹${v} off`;
  });
  const amounts = realAmounts(f);
  for (const m of text.matchAll(PRICE)) {
    if (said(m[0])) continue;
    const v = amount(m[1] ?? m[3], m[2]);
    // ₹0 is a "free" claim, which the shipping and offer checks own.
    if (!Number.isFinite(v) || v === 0 || isRealAmount(amounts, v)) continue;
    problems.push({
      kind: "price",
      reason: `"${m[0].trim()}" — no product, service, offer or shipping amount on record is ₹${v.toLocaleString("en-IN")}, and the site and Business Knowledge don't mention it`,
    });
  }
  if (/first[\s-]order/i.test(text) && /(off|discount|free)/i.test(text) && f.offers.length === 0) {
    reasons.push("a first-order offer — the store has no active discount codes");
  }
  for (const term of CLAIM_TERMS) {
    if (!termAppears(t, term)) continue;
    // Said in ANY of its phrasings. An owner who records "paraffin-free"
    // has said "no paraffin": they are one fact, and asking them to
    // attest both spellings of it would be the software failing to
    // understand its own question. Only genuinely equivalent wordings
    // are grouped — a narrow claim never licenses a broader one.
    if (saidAnyOf(known, term)) continue;
    const message = `"${term}" — nothing on record backs it. If it's true, write it once ("${term}") in Business Knowledge or a product description and Hawlai can use it everywhere.`;
    // WHICH TERMS MAY SURVIVE A DRAFT, and the line is drawn by what the
    // claim is ABOUT rather than by how likely it is to be true.
    //
    // A claim about what the product IS — pure cotton, pure ghee,
    // handloom, soy wax — is a fact only the OWNER holds. Hawlai has
    // nothing that contradicts it, just nothing that supports it, and
    // deleting it from a draft tells a truthful owner their own product
    // is a lie.
    //
    // A claim about what the product DOES, or is certified as, is
    // different: a customer will test it. "The candle burns clean, with
    // no soot collecting at the rim" went out on 8 October 2026 and is
    // the reason this directory exists. Those stay strict in BOTH modes,
    // because a draft-lenient "no soot" is exactly the hole that caption
    // came through — tests/captionClaims.test.ts proves it, on draft
    // mode, under the name "THE WHOLE THING IS CAUGHT ON THE PATH THAT
    // PUBLISHED IT".
    if (PERFORMANCE_CLAIMS.has(term)) reasons.push(message);
    else reasons.substantiation(message);
  }

  // Rankings, superlatives, comparisons, guarantees and urgency
  each(RANKING, (m) => `"${m[0]}" — a ranking claim with nothing on record to back it`);
  const places = f.city ? `${PLACE}|${escapeRe(f.city.toLowerCase())}` : PLACE;
  const superlative = new RegExp(`\\b(?:${SUPERLATIVE_WORDS})\\b[^.!?\\n]{0,40}?\\b(?:in|across)\\s+(?:all\\s+of\\s+)?(?:${places})\\b`, "gi");
  each(superlative, (m) => `"${m[0]}" — a superlative with nothing on record to back it`);
  each(POSSESSIVE_SUPERLATIVE, (m) => `"${m[0]}" — a superlative with nothing on record to back it`);
  each(BEST_SELLING, (m) => `"${m[0]}" — Hawlai has no sales ranking for this business's products`);
  // A COMPARISON IS NEVER SUPPORTED BY OUR OWN FACTS, so `said` must not
  // suppress it.
  //
  // THE LIVE SUPPRESSION (3 Oct 2026). `said(phrase)` skips a flag when
  // the phrase appears in knownText — and knownText includes the
  // business's own site. So "safer than mass-market paraffin", written
  // on the About page by Hawlai, was its own evidence: the check found
  // the words on the site and concluded the business had said them. The
  // only items that reached the review card were the ones that bypass
  // `said` entirely — the offer patterns and the contact scrub — which
  // is exactly what the owner saw.
  //
  // Nothing a business says about ITSELF can establish a comparison with
  // somebody else's product. Whatever is on record, this is flagged.
  const always = (re: RegExp, reason: (m: RegExpMatchArray) => string) => {
    for (const m of text.matchAll(re)) reasons.push(reason(m));
  };
  always(COMPARATIVE, (m) => `"${m[0]}" — a comparison with competitors that nothing on record supports`);
  always(PRODUCT_COMPARATIVE, (m) => `"${m[0]}" — a comparison with competitors that nothing on record supports, and it doesn't even say what it's being compared with`);
  // Both of these are comparisons, so both bypass `said` for the reason
  // recorded above: nothing a business writes about itself can establish
  // a claim about somebody else's product.
  always(NAMED_COMPARISON, (m) => `"${m[0].trim()}" — a comparison with another product that nothing on record supports`);
  always(RIVAL_DISPARAGEMENT, (m) => `"${m[0].trim()}" — this says other products have that fault, which is a claim about them, not about yours`);
  each(EXACTNESS, (m) => `"${m[0]}" — nothing on record measures this, and "exact" is a measurement`);
  each(GUARANTEE, (m) => `"${m[0]}" — a guarantee the business hasn't offered`);
  each(SCARCITY, (m) => `"${m[0]}" — urgency about stock that nothing on record supports`);
  each(SLOT_SCARCITY, (m) => `"${m[0]}" — how many slots are left isn't on record; a service has no stock count, so nothing here backs the hurry`);

  // Links to a website that isn't the business's own
  reasons.push(...findUnsupportedLinks(text, f));

  // Health / efficacy and promised results
  each(HEALTH, (m) => `"${m[0]}" — a health or efficacy claim that needs real evidence`);
  each(RESULTS, (m) => `"${m[0]}" — a promised result that can't be verified`);

  return problems;
}

// A sentence ends at . ! ? । or an emoji — social copy uses emoji as full
// stops ("New candle is here 🕯️ Free shipping…"), and treating the two
// halves as one sentence would remove the honest half with the claim.
const PIECE =
  /[^.!?।\n\p{Extended_Pictographic}]*(?:[.!?।]+["'”’)\]]*|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)[ \t]*|[^.!?।\n\p{Extended_Pictographic}]+[ \t]*|\n/gu;

/**
 * Splits copy into sentences and lines, keeping every character so the
 * rest reads unchanged.
 *
 * A URL IS ONE CHARACTER TO THIS FUNCTION, and that is the whole reason
 * it is not a one-line `match`.
 *
 * THE BUG (measured 2026-10-03): the dots in a hostname are full stops
 * to PIECE. "See https://cdn.hawlai.online/logos/a.png here." split
 * after "https://cdn." — so removing the sentence that carried the link
 * removed "See https://cdn." and left "hawlai.online/logos/a.png here."
 * standing in the copy. Every unsupported link with a dotted host did
 * this: a foreign URL was reported as removed and a broken fragment of
 * it stayed in the text, on a surface the owner was about to send.
 *
 * So links are lifted out, the split runs on text with no dots that
 * aren't sentence ends, and they are put back exactly as they were.
 */
/**
 * Exported for src/lib/claims/narrativeProvenance.ts, which has to judge
 * copy one sentence at a time for the same reason this does — and must
 * not reimplement the link masking, because a URL's dots are not
 * sentence ends.
 */
export function pieces(text: string): string[] {
  const links: string[] = [];
  // U+0000 cannot appear in copy and is not a sentence end to PIECE, so
  // a link reduces to one inert character for the duration of the split.
  const masked = text.replace(LINK, (link) => {
    links.push(link);
    return `\u0000${links.length - 1}\u0000`;
  });
  const restore = (piece: string) => piece.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)] ?? "");
  return (masked.match(PIECE) ?? [masked]).map(restore);
}

/**
 * A booking link pointed at the wrong page on the right host, put right.
 *
 * "Book here: calendly.com" is not a claim to delete — the sentence is
 * true and the call to action is wanted. Only the address is wrong, and
 * the right one is known. Deleting the line would cost the booking just
 * as surely as the broken link did, so this rewrites it instead.
 */
export function repairBookingLinks(text: string, f: BusinessFacts): { text: string; fixed: string[] } {
  const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
  if (!booking) return { text, fixed: [] };
  const bookingHost = hostOf(booking);
  const target = normalise(booking).replace(/\/+$/, "");
  const fixed: string[] = [];
  const out = text.replace(LINK, (link: string) => {
    const trail = link.match(/[.,;:!?]+$/)?.[0] ?? "";
    const bare = trail ? link.slice(0, -trail.length) : link;
    if (hostOf(bare) !== bookingHost) return link;
    const n = normalise(bare).replace(/\/+$/, "");
    // The booking page itself, or a page inside it — leave it alone.
    if (n === target || n.startsWith(`${target}/`) || n.startsWith(`${target}?`)) return link;
    fixed.push(bare);
    return `${booking}${trail}`;
  });
  return { text: out, fixed: Array.from(new Set(fixed)) };
}

/**
 * Removes each sentence that makes an unsupported claim. The rest of the
 * copy is left exactly as written. In "draft" mode a sentence whose only
 * problem is an unverified price is kept, and the price is listed in
 * `priceWarnings` for the owner to check.
 *
 * A wrong booking link is repaired first, not removed: see
 * repairBookingLinks.
 */
export function stripUnsupported(
  text: string,
  f: BusinessFacts,
  mode: ClaimsMode = "publish"
): { text: string; removed: string[]; priceWarnings: string[]; substantiation: string[]; narrative: NarrativeFinding[]; linksFixed: string[] } {
  const repair = repairBookingLinks(text, f);
  text = repair.text;
  // THE STORY, CHECKED WHERE THE FACTS ARE (moved here 2026-10-10).
  //
  // Narrative provenance first lived in factsGate.guardOrMark, on the
  // claim that it was "the one place all eight generators pass
  // through". THAT WAS WRONG, and the audit of it is why this moved:
  // guardOrMark has six callers. socialMediaAgent guards a plain string
  // and calls stripUnsupported directly; seoToolkitAgent and adEngine
  // call guardGenerated directly; and chatbotAgent - the widget that
  // talks to website VISITORS - calls stripUnsupported directly too.
  // None of them had it. Exactly the per-surface mistake F-16 names,
  // committed while fixing F-16.
  //
  // This is the real one place: every path that checks a fact arrives
  // here, because this is what checks the fact.
  const story = checkNarrative(text, f, mode);
  text = story.text;
  if (findProblems(text, f).length === 0) {
    return { text, removed: [], priceWarnings: [], substantiation: [], narrative: story.findings, linksFixed: repair.fixed };
  }
  const kept: string[] = [];
  const removed: string[] = [];
  const priceWarnings: string[] = [];
  const substantiation: string[] = [];
  for (const piece of pieces(text)) {
    const problems = findProblems(piece, f);
    // A SENTENCE IS JUDGED BY ITS WORST PROBLEM. Existing precedent,
    // pinned by "a sentence with a price AND another claim is removed
    // even in a draft": leniency applies only when EVERY problem in the
    // sentence is a lenient kind. A true "pure cotton" beside a
    // fabricated review count does not rescue the count.
    const lenient = mode === "draft" && problems.every((p) => p.kind === "price" || p.kind === "substantiation");
    if (!problems.length) kept.push(piece);
    else if (lenient) {
      kept.push(piece);
      for (const problem of problems) {
        if (problem.kind === "price") priceWarnings.push(problem.reason);
        else substantiation.push(problem.reason);
      }
    } else removed.push(...problems.map((p) => p.reason));
  }
  const cleaned = kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: cleaned,
    removed: Array.from(new Set(removed)),
    priceWarnings: Array.from(new Set(priceWarnings)),
    substantiation: Array.from(new Set(substantiation)),
    narrative: story.findings,
    linksFixed: repair.fixed,
  };
}

// ---------------------------------------------------------------------
// WHEN THE FACTS COULD NOT BE READ AT ALL.
//
// F-01 (audit, 8 Oct 2026). Every guard above answers "is this claim on
// record" by reading the record, so the generators were written as
// `facts ? guard(...) : return output`. One transient failure inside
// gatherBusinessFactsSafely therefore turned the whole layer off —
// silently, with no _claimsNote, so the owner could not tell a checked
// draft from an unchecked one.
//
// This is the subset of the rules above that needs NO facts, and it is
// not a weaker check: with nothing on record, a claim about counts,
// ratings, sales, rankings, stock, guarantees, health or a competitor is
// unsupported BY DEFINITION. The facts are what could have excused it.
//
// Deliberately NOT included: prices and shipping amounts. Those cannot
// be judged either way without the store's numbers, and deleting a
// correct price would be its own kind of wrong. They are reported as
// unverifiable instead, for the caller to present as unverified.
// ---------------------------------------------------------------------

/** Rules whose verdict does not depend on the business's own records. */
const FACT_INDEPENDENT: { re: RegExp; why: (m: RegExpMatchArray) => string }[] = [
  { re: SOCIAL_PROOF, why: (m) => `"${m[0].trim()}" — a customer or review count, and no records could be read to support it` },
  { re: VAGUE_CROWD, why: (m) => `"${m[0].trim()}" — a crowd claim, and no records could be read to support it` },
  { re: UNITS_SOLD, why: (m) => `"${m[0].trim()}" — a sales figure, and no records could be read to support it` },
  { re: BEST_SELLING, why: (m) => `"${m[0]}" — a sales ranking, and no records could be read to support it` },
  { re: RANKING, why: (m) => `"${m[0]}" — a ranking claim with no records behind it` },
  { re: POSSESSIVE_SUPERLATIVE, why: (m) => `"${m[0]}" — a superlative with no records behind it` },
  { re: SCARCITY, why: (m) => `"${m[0]}" — urgency about stock, and no stock could be read` },
  { re: SLOT_SCARCITY, why: (m) => `"${m[0]}" — how many slots are left could not be read` },
  { re: GUARANTEE, why: (m) => `"${m[0]}" — a guarantee, and nothing could be read to show the business offers it` },
  { re: HEALTH, why: (m) => `"${m[0]}" — a health or efficacy claim that needs real evidence` },
  { re: RESULTS, why: (m) => `"${m[0]}" — a promised result that can't be verified` },
  // Comparisons bypass `said` even when the records CAN be read, because
  // nothing a business says about itself establishes a claim about
  // somebody else's product. With no records they are no different.
  { re: COMPARATIVE, why: (m) => `"${m[0]}" — a comparison with competitors that nothing supports` },
  { re: PRODUCT_COMPARATIVE, why: (m) => `"${m[0]}" — a comparison with competitors that nothing supports` },
  { re: NAMED_COMPARISON, why: (m) => `"${m[0].trim()}" — a comparison with another product that nothing supports` },
  { re: RIVAL_DISPARAGEMENT, why: (m) => `"${m[0].trim()}" — this says other products have that fault, which is a claim about them` },
];

/** Money and offer claims that need the store's numbers to judge. Reported, never stripped. */
const NEEDS_THE_STORE: { re: RegExp; label: string }[] = [
  { re: FREE_SHIPPING, label: "free shipping" },
  { re: PERCENT_OFF, label: "a discount" },
  { re: FLAT_OFF, label: "a discount" },
  { re: PRICE, label: "a price" },
];

/** A fresh global copy — the shared literals above carry lastIndex between calls. */
function everyMatch(re: RegExp, text: string): RegExpMatchArray[] {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))];
}

/**
 * What can still be said about copy when the facts are unreadable.
 *
 * `removed` are claims that are unsupported whatever the records say.
 * `unverifiable` are claims that might be true and cannot be checked
 * right now — the caller presents them as unverified rather than
 * deleting a possibly-correct price.
 */
export function findUnverifiableClaims(text: string): { removed: string[]; unverifiable: string[] } {
  const removed: string[] = [];
  for (const { re, why } of FACT_INDEPENDENT) {
    for (const m of everyMatch(re, text)) removed.push(why(m));
  }
  const unverifiable: string[] = [];
  for (const { re, label } of NEEDS_THE_STORE) {
    if (new RegExp(re.source, re.flags.replace("g", "")).test(text)) unverifiable.push(label);
  }
  return { removed: Array.from(new Set(removed)), unverifiable: Array.from(new Set(unverifiable)) };
}

/**
 * The same sentence-scoped removal stripUnsupported does, for the
 * fact-independent rules only. Shares `pieces` so a link is never split
 * mid-URL and an emoji still ends a sentence.
 */
export function stripUnverifiable(text: string): { text: string; removed: string[]; unverifiable: string[] } {
  const all = findUnverifiableClaims(text);
  if (all.removed.length === 0) return { text, removed: [], unverifiable: all.unverifiable };
  const kept: string[] = [];
  const removed: string[] = [];
  for (const piece of pieces(text)) {
    const found = findUnverifiableClaims(piece);
    if (found.removed.length === 0) kept.push(piece);
    else removed.push(...found.removed);
  }
  // The same tidy-up stripUnsupported does after removing a sentence.
  const cleaned = kept.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, removed: Array.from(new Set(removed)), unverifiable: all.unverifiable };
}

/**
 * Applies stripUnsupported to every piece of text in a generated result,
 * whatever its shape (a caption, slides, a 7-day calendar, an email
 * sequence). An array item whose main text is removed entirely is
 * dropped; keys starting with "_" are metadata and left alone.
 */
export function guardOutput<T>(output: T, f: BusinessFacts, mode: ClaimsMode = "publish"): { output: T; removed: string[]; priceWarnings: string[]; substantiation: string[]; narrative: NarrativeFinding[]; linksFixed: string[] } {
  const removed: string[] = [];
  const priceWarnings: string[] = [];
  const substantiation: string[] = [];
  const narrative: NarrativeFinding[] = [];
  const linksFixed: string[] = [];
  const emptied = (before: any, after: any) => typeof before === "string" && before.trim() !== "" && String(after ?? "").trim() === "";

  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = stripUnsupported(v, f, mode);
      removed.push(...r.removed);
      priceWarnings.push(...r.priceWarnings);
      substantiation.push(...r.substantiation);
      narrative.push(...r.narrative);
      linksFixed.push(...r.linksFixed);
      return r.text;
    }
    if (Array.isArray(v)) {
      const out: any[] = [];
      for (const item of v) {
        const next = walk(item);
        // An item whose text was removed entirely goes with it — a hook
        // that was only a claim, a slide with no headline left, a
        // calendar day with no caption left.
        if (emptied(item, next)) continue;
        if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).some((k) => !k.startsWith("_") && emptied(item[k], next[k]))) continue;
        out.push(next);
      }
      return out;
    }
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = k.startsWith("_") ? x : walk(x);
      return o;
    }
    return v;
  };

  const out = walk(output);
  return { output: out, removed: Array.from(new Set(removed)), priceWarnings: Array.from(new Set(priceWarnings)), substantiation: Array.from(new Set(substantiation)), narrative, linksFixed: Array.from(new Set(linksFixed)) };
}

/** What the owner is told — said plainly, never silently hidden. */
export function claimsNote(removed: string[]): string | null {
  if (removed.length === 0) return null;
  const n = removed.length;
  return `Hawlai removed ${n === 1 ? "a line" : "lines"} that made ${n === 1 ? "a claim" : `${n} claims`} it couldn't verify from your store data (${removed.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}). If a claim is true, add it to Business Knowledge and it will be allowed.`;
}

/** What the owner is told when a link was put right — never changed silently. */
export function linkFixedNote(fixed: string[], booking: string | null): string | null {
  if (fixed.length === 0 || !booking) return null;
  return `One link pointed at ${fixed[0]}, which isn't where your bookings are — Hawlai sent it to ${booking} instead.`;
}

/** What the owner is told about prices left in a draft. */
/**
 * What was KEPT but cannot be backed, and what to write so it stays.
 *
 * Three things, because a flag with no way forward reads as a bug: what
 * is unbacked, why it was left in, and the exact words to record. The
 * reason strings already carry the phrase to write (findProblems builds
 * them that way), so this frames rather than repeats.
 */
export function substantiationNote(warnings: string[]): string | null {
  if (warnings.length === 0) return null;
  const n = warnings.length;
  return `${n === 1 ? "One claim here isn't" : `${n} claims here aren't`} on your record: ${warnings.slice(0, 2).join(" ")}${n > 2 ? " …" : ""} ${n === 1 ? "It was" : "They were"} kept because you're reviewing this draft — published copy drops ${n === 1 ? "it" : "them"} instead.`;
}

export function priceWarningNote(warnings: string[]): string | null {
  if (warnings.length === 0) return null;
  const n = warnings.length;
  return `Check ${n === 1 ? "this price" : "these prices"} before you use this: ${warnings.slice(0, 2).join("; ")}${n > 2 ? "; …" : ""}. ${n === 1 ? "It was" : "They were"} left in because you're reviewing this draft — add the price to a product, service or Business Knowledge and Hawlai will recognise it next time.`;
}

/** guardOutput plus the notes, attached as `_claimsNote` for the result card. */
export function guardGenerated<T extends object>(
  output: T,
  f: BusinessFacts,
  mode: ClaimsMode = "publish"
): { output: T & { _claimsNote?: string }; removed: string[]; priceWarnings: string[]; substantiation: string[]; narrative: NarrativeFinding[]; linksFixed: string[] } {
  const r = guardOutput(output, f, mode);
  const booking = f.links?.booking ?? f.products.find((p) => p.bookingUrl)?.bookingUrl ?? null;
  const note = [claimsNote(r.removed), priceWarningNote(r.priceWarnings), substantiationNote(r.substantiation), narrativeNote(r.narrative, mode), linkFixedNote(r.linksFixed, booking)].filter(Boolean).join(" ");
  return { output: (note ? { ...r.output, _claimsNote: note } : r.output) as T & { _claimsNote?: string }, removed: r.removed, priceWarnings: r.priceWarnings, substantiation: r.substantiation, narrative: r.narrative, linksFixed: r.linksFixed };
}
