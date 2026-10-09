// Copy any business in the same line of work could have published.
//
// TIRED_MOVES in contentMarketingAgent already lists fifteen worn
// openings — in the PROMPT. A prompt is a request, and the model agrees
// with it right up until it does not. Nothing in the product checked
// afterwards, which is the same shape as every other finding in this
// audit: the rule existed, the enforcement did not.
//
// TWO RULES, both enforced here:
//
//   1. A worn opener. Detected on the FIRST sentence only, because
//      mid-piece "zara socho" is a legitimate turn of phrase and as an
//      opener it is the model reaching for the same move every time.
//
//   2. At least one recorded specific. A piece with no product name, no
//      price, no offer, no place, no occasion and no owner-recorded
//      detail is not writing about this business — it is writing about
//      the category.
//
// LANGUAGE-AWARE, NOT LANGUAGE-BLIND. Hawlai's default register is
// Hinglish (src/lib/content/language.ts), so an English-only list would
// have been a guard that works on the copy this product writes least.
// Each piece is checked against its OWN register plus English, because
// Hinglish copy mixes English in freely.
//
// The other script's list is NOT applied, and the honest reason is
// scoping rather than safety. An earlier version of this comment claimed
// cross-script matching "can only produce a false positive" — a
// mutation check disproved that: a Devanagari pattern simply cannot
// match romanised text, so allowing it would be harmless, and a worn
// HINDI opener inside a piece declared English goes unflagged. That is a
// known limit of the register scoping, not a protection it provides.

import { pieces } from "@/lib/claims/claimCheck";
import { textOfOutput, storyVocabulary } from "@/lib/content/storyEcho";
import { normaliseLanguage, type CopyLanguage } from "@/lib/content/language";
import { STORY_CATEGORY } from "@/lib/business/businessStory";
import type { BusinessFacts } from "@/lib/claims/businessFacts";

type Register = "english" | "hinglish" | "hindi";

// WHY NOT `\b` IN THE DEVANAGARI PATTERNS. JavaScript defines \b over
// [A-Za-z0-9_] only, so every Devanagari letter is a "non-word"
// character and a boundary between two of them never occurs: /में\b/
// cannot match "में सब" and silently matches nothing at all. Three of
// this module's Hindi patterns were written that way and all three were
// dead until a test caught them. This is the working equivalent — not
// followed by another Devanagari letter.
// Written inline in each pattern below as (?![\u0900-\u097F]) rather
// than interpolated: a template literal eats the backslash in \s, which
// turned the first version of this fix into three patterns matching
// "s*\u0925\u0915s+\u0917\u090F". The tests caught that too.

type Opener = {
  register: Register;
  re: RegExp;
  label: string;
  /**
   * How much of the field the pattern is tested against.
   *
   * "sentence" (the default) is the first sentence only, which is what
   * makes a worn OPENING distinguishable from the same phrase used
   * legitimately mid-piece.
   *
   * "opening" is the first ~160 characters, for the moves that span two
   * sentences. "Looking for a gift? Look no further." is ONE move, and
   * a first-sentence rule saw only "Looking for a gift?" — a perfectly
   * good question on its own. Widening the sentence rule to two
   * sentences instead would have flagged every honest piece whose
   * second sentence happens to start with one of these.
   */
  span?: "sentence" | "opening";
};

// WRITTEN AS SHAPES, NOT PHRASES, for the same reason the narrative
// patterns are: the model does not reuse wording, it reuses the move.
// "Struggling with X?" is the move; X changes every time.
const OPENERS: Opener[] = [
  // Struggling with… / …ki tension?
  { register: "english", re: /^\s*(?:are\s+you\s+)?strugg?ling\s+with\b/i, label: "Struggling with…" },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\b(?:ki|ka|ke)\s+(?:tension|pareshani|problem)\s*\?/i, label: "…ki tension?" },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\bse\s+pareshan\s*\?/i, label: "…se pareshan?" },
  { register: "hindi", re: /^[^।!?\n]{0,60}(?:की\s+समस्या|से\s+परेशान)\s*\?/, label: "…की समस्या?" },

  // Are you tired of…
  { register: "english", re: /^\s*(?:are\s+you\s+)?(?:tired|sick|fed\s+up)\s+of\b/i, label: "Are you tired of…" },
  { register: "hinglish", re: /^\s*(?:thak|bore)\s+(?:gaye|gayi|gaye\s+ho|ho\s+gaye)\b/i, label: "Thak gaye ho…" },
  { register: "hindi", re: /^\s*थक\s+गए(?![ऀ-ॿ])/, label: "थक गए हैं…" },

  // Look no further
  { register: "english", re: /^[^.!?\n]{0,80}\blook\s+no\s+further\b/i, label: "Look no further" },
  // The two-sentence form, which is how TIRED_MOVES actually lists it.
  {
    register: "english",
    re: /^\s*(?:looking|searching|hunting)\s+for\b[^.!?\n]{0,80}\?\s*look\s+no\s+further/i,
    label: "Looking for X? Look no further",
    span: "opening",
  },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\b(?:talash|khoj)\s+(?:khatam|khatm)\b/i, label: "Aapki talash khatam" },
  { register: "hindi", re: /^[^।!?\n]{0,60}तलाश\s+ख़?तम/, label: "आपकी तलाश ख़त्म" },

  // In today's fast-paced world…
  { register: "english", re: /^\s*in\s+(?:today'?s|this)\s+(?:fast[- ]paced\s+|busy\s+|modern\s+|digital\s+)?world\b/i, label: "In today's fast-paced world" },
  { register: "english", re: /^\s*in\s+today'?s\s+\w+\s+(?:era|age|times)\b/i, label: "In today's … era" },
  { register: "hinglish", re: /^\s*aaj\s+ke\s+(?:time|zamane|daur|yug)\s+(?:mein|me)\b/i, label: "Aaj ke zamane mein" },
  { register: "hindi", re: /^\s*आज\s+के\s+(?:ज़माने|जमाने|दौर|समय)\s+में(?![ऀ-ॿ])/, label: "आज के ज़माने में" },

  // Elevate / transform / upgrade your…
  { register: "english", re: /^\s*(?:elevate|transform|revolutioni[sz]e|upgrade)\s+your\b/i, label: "Elevate your…" },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\bko\s+(?:upgrade|next\s+level)\b/i, label: "…ko upgrade karo" },
  { register: "hindi", re: /^[^।!?\n]{0,60}को\s+बेहतर\s+बनाएं/, label: "…को बेहतर बनाएं" },

  // Unlock the…
  { register: "english", re: /^\s*(?:unlock|discover|unleash)\s+the\b/i, label: "Unlock the…" },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\bka\s+(?:raaz|raz|secret)\b/i, label: "…ka raaz" },
  { register: "hindi", re: /^[^।!?\n]{0,60}का\s+राज़?(?![ऀ-ॿ])/, label: "…का राज़" },

  // Imagine…
  { register: "english", re: /^\s*(?:imagine|picture)\s+(?:this|a|an|your|yourself)\b/i, label: "Imagine…" },
  { register: "hinglish", re: /^\s*(?:zara\s+socho|socho\s+zara|sochiye\s+zara)\b/i, label: "Zara socho…" },
  { register: "hindi", re: /^\s*ज़?रा\s+सोच/, label: "ज़रा सोचिए…" },

  // Say goodbye to…
  { register: "english", re: /^\s*say\s+(?:goodbye|bye)\s+to\b/i, label: "Say goodbye to…" },
  { register: "hinglish", re: /^[^.!?\n]{0,60}\bko\s+bye\s+(?:bolo|kaho|boliye)\b/i, label: "…ko bye bolo" },
  { register: "hindi", re: /^[^।!?\n]{0,60}को\s+कहिए\s+अलविदा/, label: "…को कहिए अलविदा" },

  // Introducing / Meet the… — from TIRED_MOVES, now enforced.
  { register: "english", re: /^\s*(?:introducing|meet\s+the|presenting)\b/i, label: "Introducing / Meet the…" },
];

/**
 * Which pattern lists apply to a piece written in this register.
 *
 * English always, because Hinglish and Hindi copy both borrow English
 * openings freely. Never the other script's list: Devanagari tested
 * against romanised Hinglish can only be a false positive.
 */
function listsFor(language: CopyLanguage): Register[] {
  const asked = normaliseLanguage(language);
  if (asked === "hindi") return ["hindi", "english"];
  if (asked === "hinglish") return ["hinglish", "english"];
  return ["english"];
}

/** Every string in a generated piece, so an opener is caught in whichever field starts the read. */
function stringsOf(output: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (key?.startsWith("_")) return;
    if (typeof v === "string") {
      if (v.trim()) out.push(v);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(output);
  return out;
}

/**
 * A worn opener, named.
 *
 * Checked on EVERY field rather than on the joined text: a caption's
 * `text`, a blog's `intro` and a carousel's first slide are all places a
 * reader starts, and which field comes first in the JSON is an accident
 * of the schema. A mutation that looked at only the first field was
 * caught by a test, so that part is load-bearing.
 *
 * WHAT IS NOT DOING THE WORK: taking `pieces(field)[0]` rather than the
 * whole field. Every sentence-span pattern above is `^`-anchored and
 * bounded by `[^.!?
]`, so the two are equivalent today — a mutation
 * swapping one for the other survived, correctly. It is kept as the
 * guard for a future pattern written without an anchor, and said plainly
 * here so nobody mistakes it for more than that. The `span` distinction
 * IS load-bearing: a two-sentence move is invisible to the first
 * sentence alone.
 */
export function openerProblem(output: unknown, language: CopyLanguage = "hinglish"): string | null {
  const lists = listsFor(language);
  for (const field of stringsOf(output)) {
    const first = (pieces(field)[0] ?? field).trim();
    const opening = field.trim().slice(0, 160);
    if (!first) continue;
    for (const opener of OPENERS) {
      if (!lists.includes(opener.register)) continue;
      if (opener.re.test(opener.span === "opening" ? opening : first)) return opener.label;
    }
  }
  return null;
}

/** Rupee amounts, however they are written, so a real price counts as a specific. */
const MONEY = /(?:₹|\brs\.?\s?|\binr\s?)\s?(\d[\d,]*)|(\d[\d,]*)\s*(?:rupees|\/-)/gi;

/**
 * What this piece carries that belongs to THIS business.
 *
 * Deliberately generous about what counts: a price, a product name, an
 * offer, the city, or a word only the owner's own notes contain. The
 * question is not "is this good copy", it is "could any competitor have
 * published this unchanged".
 */
export function specificsIn(output: unknown, facts: BusinessFacts | null | undefined): string[] {
  const text = textOfOutput(output);
  const lower = text.toLowerCase();
  if (!facts) return [];
  const found: string[] = [];

  const named = (facts.products ?? []).some((p) => {
    const name = String(p?.name ?? "").trim().toLowerCase();
    // A one-word product name that is also the category ("candles") is
    // not a specific — every competitor sells those too.
    if (name.length < 4) return false;
    if (name === String(facts.category ?? "").toLowerCase()) return false;
    return lower.includes(name);
  });
  if (named) found.push("a product name");

  const prices = new Set(
    (facts.products ?? [])
      .map((p: any) => (typeof p?.price === "number" ? p.price : null))
      .filter((n): n is number => typeof n === "number" && n > 0)
  );
  if (prices.size) {
    for (const m of lower.matchAll(MONEY)) {
      const n = Number(String(m[1] ?? m[2] ?? "").replace(/,/g, ""));
      if (prices.has(n)) {
        found.push("a real price");
        break;
      }
    }
  }

  const offer = (facts.offers ?? []).some((o: any) => {
    const label = String(o?.label ?? "").trim().toLowerCase();
    const code = String(o?.code ?? "").trim().toLowerCase();
    return (label.length >= 4 && lower.includes(label)) || (code.length >= 3 && lower.includes(code));
  });
  if (offer) found.push("a real offer");

  const city = String(facts.city ?? "").trim().toLowerCase();
  if (city.length >= 3 && lower.includes(city)) found.push("where the business is");

  // A word that appears in the owner's own notes and nowhere in the
  // catalogue — the same vocabulary usesOwnStory measures, reused rather
  // than recomputed.
  const vocabulary = storyVocabulary(facts);
  const said = new Set(lower.normalize("NFKD").split(/[^a-z0-9₹]+/).filter(Boolean));
  const owned = [...vocabulary.strong, ...vocabulary.ordinary].some((w) => said.has(w));
  if (owned) found.push("a detail you recorded");

  return found;
}

/**
 * What the piece is missing, phrased as something the owner can add.
 *
 * Only ever ONE thing, and only ever something this business could
 * actually supply: a list of five is a lecture, and a note asking for a
 * price from a business with no products is noise.
 */
export function missingSpecific(facts: BusinessFacts | null | undefined): string {
  if (!facts) return "something only your business could say";
  const hasStory = (facts.ownerFacts ?? []).some((k) => k.category === STORY_CATEGORY);
  // NOT "or price": a price is not a distinguishing specific
  // (DISTINGUISHING above), so asking for one would tell the owner to do
  // the thing that does not fix it.
  if ((facts.products ?? []).length) return "the product's name, or what makes it yours";
  if (hasStory) return "a detail from your own notes";
  return "what's included, or the occasion people buy it for";
}

/**
 * The specifics that actually DISTINGUISH this business.
 *
 * A PRICE IS NOT ON THIS LIST, and that correction came from reading
 * storyEcho's own header rather than from my own reasoning. It says, of
 * the caption that started this whole thread:
 *
 *   "The price (₹800) and the duration (90 minutes) come from the
 *    catalogue — every competitor has those too, and counting them would
 *    have passed the very caption that started this."
 *
 * My first version of this rule counted a real price as sufficient. It
 * would therefore have passed that exact caption — the one the owner
 * complained about — and the module next door had already written down
 * why. A price supports a piece; it does not make it this business's.
 */
const DISTINGUISHING = new Set(["a product name", "a real offer", "where the business is", "a detail you recorded"]);

/** Has this business written down anything a piece could be specific about? */
export function hasAnythingRecorded(facts: BusinessFacts | null | undefined): boolean {
  if (!facts) return false;
  if ((facts.products ?? []).length) return true;
  if ((facts.offers ?? []).length) return true;
  if (String(facts.city ?? "").trim()) return true;
  return (facts.ownerFacts ?? []).some((k) => String(k?.content ?? "").trim());
}

export type GenericVerdict = {
  generic: boolean;
  /** The worn opener, when that is what is wrong. */
  opener: string | null;
  /** The one thing to add, when nothing of this business is in the piece. */
  missing: string | null;
  /** Everything found, including the table-stakes ones, for the note and for tests. */
  specifics?: string[];
};

/**
 * Could any business in this line of work have published this?
 *
 * WITH NO FACTS this returns NOT generic, which is the opposite
 * direction from the claims guard next door and is deliberate. The
 * claims guard fails closed because an unsupported claim is wrong
 * whatever the records say. Genericness is not: with nothing readable to
 * be specific ABOUT, a piece cannot be faulted for lacking it, and
 * retrying it would spend a second model call to produce the same words.
 */
export function isGeneric(
  output: unknown,
  facts: BusinessFacts | null | undefined,
  language: CopyLanguage = "hinglish"
): GenericVerdict {
  const opener = openerProblem(output, language);
  if (!facts) return { generic: Boolean(opener), opener, missing: null, specifics: [] };

  // NOTHING RECORDED MEANS NOTHING TO BE SPECIFIC ABOUT.
  //
  // Mirrors usesOwnStory, whose own comment says it best: "True when
  // there's no story to use: a business that hasn't written one can't be
  // failed for missing it." The same has to hold here, and an existing
  // test caught it when the gate was inverted — a business with no
  // products, no offers, no city and no notes was being marked generic
  // and told to add something it had no way to add.
  //
  // The worn-opener rule still applies: that one needs no records.
  if (!hasAnythingRecorded(facts)) return { generic: Boolean(opener), opener, missing: null, specifics: [] };

  const specifics = specificsIn(output, facts);
  // A price or a duration does not rescue a piece — see DISTINGUISHING.
  const distinguishing = specifics.filter((s) => DISTINGUISHING.has(s));
  const missing = distinguishing.length === 0 ? missingSpecific(facts) : null;
  return { generic: Boolean(opener) || Boolean(missing), opener, missing, specifics };
}

/**
 * What the owner is told, naming the fix rather than the fault.
 *
 * Replaces GENERIC_NOTE's wording, which asked for the founder's STORY —
 * withdrawn as the default on 2026-10-09 (docs/PRINCIPLES.md P1). A
 * stranger reading a caption cares about the product and about
 * themselves.
 */
export function genericNote(verdict: { opener?: string | null; missing?: string | null }): string {
  const parts: string[] = [];
  if (verdict.opener) {
    parts.push(`That opened with "${verdict.opener}" — an opening every business uses, so a reader skips it.`);
  }
  if (verdict.missing) {
    parts.push(
      `Nothing in this one belongs to your business, so it reads like any business in your line of work could have written it. Add ${verdict.missing} and I can say it.`
    );
  }
  return parts.join(" ");
}

/**
 * The prompt for the one retry.
 *
 * Kept as a builder rather than inlined so the retry's instructions are
 * testable without a model call. The shape is retryWithStory's, which
 * was expensive to get right: an EDIT at the same length, not a fresh
 * generation, because a regeneration drifts off the topic the owner
 * asked for.
 */
export function retryBrief(verdict: GenericVerdict, facts: BusinessFacts | null | undefined): string {
  const lines: string[] = [];
  if (verdict.opener) {
    lines.push(`- Do NOT open with "${verdict.opener}" or anything close to it. Start somewhere this piece actually starts.`);
  }
  if (verdict.missing) {
    const products = (facts?.products ?? []).slice(0, 3).map((p: any) => {
      const price = typeof p?.price === "number" && p.price > 0 ? ` (₹${p.price})` : "";
      return `${p?.name ?? ""}${price}`.trim();
    }).filter(Boolean);
    const offers = (facts?.offers ?? []).slice(0, 2).map((o: any) => String(o?.label ?? "").trim()).filter(Boolean);
    const city = String(facts?.city ?? "").trim();

    // NOTHING CONCRETE TO HAND OVER MEANS NO RETRY AT ALL.
    //
    // Caught by an existing test when the gate was inverted: a business
    // with no products, no offers, no city and no notes still produced a
    // brief, so the retry ran. That call could not have made the piece
    // specific — there is nothing to be specific ABOUT — so the only
    // thing it could do is invent, which is the failure this entire
    // phase exists to prevent. An empty brief makes the caller skip,
    // exactly as `storyForRetry` returning [] used to.
    if (products.length || offers.length || city) {
      lines.push(`- Put ONE thing from this business into it — ${verdict.missing}. Not a new claim, not a number you invent: only what is listed below.`);
      if (products.length) lines.push(`  On record: ${products.join(" · ")}`);
      if (offers.length) lines.push(`  Offers on record: ${offers.join(" · ")}`);
      if (city) lines.push(`  Where: ${city}`);
    }
  }
  return lines.join("\n");
}
