// Reading a recorded sentence as a typed fact.
//
// PLAN-FACT-BOUND-GENERATION §5.1. A FactRecord is `key` + `value`, not
// a phrase — which is how Hinglish stops being a licensing problem.
// "Paraffin-free, soy wax only." and "Kabhi sasta paraffin wax mix nahi
// karti." are the SAME FACT, `material.paraffin = false`, and a
// sentence in either language cites the same id.
//
// THE GAP THIS CLOSES, verified on 2026-10-11: CLAIM_SYNONYMS
// (claimCheck.ts:222-243) has 16 pairs and every member of every pair
// is English, so a Hinglish record licensed nothing and TRUE copy was
// being stripped. The file's own comment records this happening once
// with "clean burning" in a Hinglish story. Under key+value there is no
// synonym table to be incomplete.
//
// A READING IS A READING, and that is why every one of these carries
// `inferred` rather than `observed`. The owner confirms the table once
// (§C.7), and until they do, an inferred reading is shown to them and
// licenses nothing. "I read this as: soy wax only, no paraffin. Right?"
//
// NO `\b` ANYWHERE NEAR DEVANAGARI. JS word boundaries are defined over
// [A-Za-z0-9_] and silently fail on Devanagari — that mistake has cost
// this codebase four separate incidents, three of them in one day.

export type Reading = {
  key: string;
  value: string | number | boolean;
  unit?: "hours" | "minutes" | "days" | "weeks" | "celsius" | "inr" | null;
  /** What in the sentence produced this, quoted back for the owner. */
  because: string;
};

/** Devanagari digits to ASCII, so one number parser handles both scripts. */
export function normaliseDigits(text: string): string {
  return String(text ?? "").replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** Hinglish and English number words, for the cases that are not digits. */
const WORD_NUMBERS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6,
  saat: 7, aath: 8, nau: 9, das: 10, barah: 12, pandrah: 15, bees: 20, pachchis: 25,
  tees: 30, chalees: 40, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90, sau: 100,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, ninety: 90, hundred: 100,
};

const UNIT_WORDS: { re: RegExp; unit: Reading["unit"] }[] = [
  { re: /(?:hours?|hrs?|ghante|ghanta|घंटे|घंटा)/i, unit: "hours" },
  { re: /(?:minutes?|mins?|minute|मिनट)/i, unit: "minutes" },
  { re: /(?:days?|din|दिन)/i, unit: "days" },
  { re: /(?:weeks?|hafte|hafta|सप्ताह)/i, unit: "weeks" },
];

/** A number written as digits or as a word, in either script. */
function numberNear(text: string): number | null {
  const t = normaliseDigits(text);
  const digits = t.match(/\d+(?:\.\d+)?/);
  if (digits) return Number(digits[0]);
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    // Explicit separators instead of \b: this string may contain
    // Devanagari, where \b does not work.
    if (new RegExp(`(?:^|[^a-z])${word}(?:[^a-z]|$)`, "i").test(t)) return n;
  }
  return null;
}

/**
 * How long something takes, and WHICH thing.
 *
 * "Har candle 24 ghante set hoti hai" is a CURE time, not a burn time,
 * and conflating them would license "burns for 24 hours" — a four-fold
 * performance claim out of a true sentence. So the verb decides the
 * key, and a duration with no verb we recognise produces no reading at
 * all rather than a guessed one.
 */
const DURATION_KINDS: { re: RegExp; key: string }[] = [
  { re: /(?:set|sets|setting|cure|cures|cured|curing|sookh|सेट)/i, key: "process.cure" },
  { re: /(?:burn|burns|burning|jal|जल)/i, key: "product.burn" },
  { re: /(?:last|lasts|lasting|chal|चल)/i, key: "product.lasts" },
  { re: /(?:deliver|delivery|ship|shipping|pahunch|पहुंच)/i, key: "shipping.time" },
  { re: /(?:workshop|session|class|batch\s+time)/i, key: "service.duration" },
];

/**
 * Material claims, as booleans — and the material is CAPTURED, never
 * enumerated.
 *
 * THE FIRST VERSION NAMED THEM: paraffin, soy, beeswax, coconut wax,
 * cotton, silk, parabens, preservatives. multiTenantVocabulary.test.ts
 * refused it, and rule 3 is right — one business's materials compiled
 * into a table every business runs is the same mistake as one
 * business's product noun.
 *
 * It was also worse engineering. What makes a sentence a material
 * claim is the SHAPE — "X-free", "no X", "X nahi", "made with X",
 * "only X", "sirf X" — not which X. Capturing it means a dairy's "no
 * preservatives", a textile's "pure silk" and a salon's "no ammonia"
 * all read correctly with no new code, and the Hinglish pairing the
 * founder asked for falls out for free: "paraffin nahi" and
 * "paraffin-free" produce the same key, `material.paraffin = false`.
 *
 * ORDER MATTERS: negations are tested first, so "paraffin nahi" can
 * never read as "has paraffin".
 */
const MATERIAL_SHAPES: { re: RegExp; value: boolean; group: number }[] = [
  // "no X", "without X", "free from X"
  { re: /\b(?:no|without|free\s+from)\s+(?:added\s+|any\s+)?([a-z][a-z-]{2,20})\b/i, value: false, group: 1 },
  // "X-free", "X free"
  { re: /\b([a-z][a-z-]{2,20})[-\s]free\b/i, value: false, group: 1 },
  // Hinglish negation: "paraffin nahi", "paraffin kabhi nahi"
  { re: /\b([a-z][a-z-]{2,20})(?:\s+wax)?\s+(?:kabhi\s+)?(?:nahi|mix\s+nahi)\b/i, value: false, group: 1 },
  // Devanagari negation. No \b: it does not work on this script.
  { re: /([ऀ-ॿ]{3,20})\s*नहीं/, value: false, group: 1 },
  // "only X", "X only", "sirf X" — exclusivity, which is an assertion
  // about what is NOT in it as much as what is.
  { re: /\b(?:only|sirf)\s+([a-z][a-z-]{2,20})\b/i, value: true, group: 1 },
  { re: /\b([a-z][a-z-]{2,20})(?:\s+wax)?\s+only\b/i, value: true, group: 1 },
  // "made with X", "made of X", "se bana"
  { re: /\bmade\s+(?:with|of|from|using)\s+(?:pure\s+)?([a-z][a-z-]{2,20})\b/i, value: true, group: 1 },
  // "pure X", "100% X"
  { re: /\b(?:pure|100\s*%)\s+([a-z][a-z-]{2,20})\b/i, value: true, group: 1 },
];

/**
 * Words that are never a material, so a captured group that lands on
 * one produces no reading.
 *
 * Generic English and Hinglish function words only — if a trade name
 * ever appears in this list, the list is wrong.
 */
const NOT_A_MATERIAL = new Set([
  "the", "and", "any", "all", "our", "your", "their", "this", "that", "them", "these", "those",
  "one", "two", "more", "less", "other", "others", "extra", "added", "added-on",
  "cost", "charge", "charges", "fee", "fees", "price", "shipping", "delivery", "return", "returns",
  "problem", "problems", "issue", "issues", "doubt", "tension", "worry", "compromise",
  "nahi", "kabhi", "bhi", "koi", "kuch", "sab", "mera", "meri", "hum", "main",
]);

function materialKey(word: string): string | null {
  const w = word.toLowerCase().replace(/^-+|-+$/g, "");
  if (!w || NOT_A_MATERIAL.has(w)) return null;
  return `material.${w.replace(/-/g, "_")}`;
}

/** How the work is done. Process claims had no rule of any kind before this. */
const PROCESSES: { re: RegExp; key: string }[] = [
  { re: /(?:hand[-\s]?poured|haath\s+se\s+(?:dali|bhari)|हाथ\s*से)/i, key: "process.hand_poured" },
  { re: /(?:hand[-\s]?made|handcrafted|handloom)/i, key: "process.handmade" },
  { re: /(?:small\s+batch(?:es)?|chhote\s+batch)/i, key: "process.small_batch" },
  { re: /(?:double\s+boiler|डबल\s*बॉयलर)/i, key: "process.double_boiler" },
  { re: /(?:cold[-\s]?pressed|bilona|stone[-\s]?ground)/i, key: "process.traditional" },
];

/**
 * What the business refuses to do.
 *
 * Kept as its own key because the FACT and the PHRASING come apart
 * here, which the founder named on 2026-10-11: the fact is "soy wax
 * only", and the owner's words — "never mixes cheap paraffin" — are a
 * pejorative about somebody else's product that copy may not reuse. The
 * record licenses the fact; nothing licenses the phrasing.
 */
const REFUSALS = /(?:never|refuse|won'?t|will\s+not|kabhi\s+nahi|नहीं\s*करती)/i;

/** A temperature, which is a process measurement and not a performance claim. */
const TEMPERATURE = /(\d+(?:\.\d+)?)\s*(?:degrees?|°|celsius|डिग्री)/i;

/**
 * Every typed reading a sentence supports.
 *
 * Returns [] for a sentence it cannot type — which is the common case
 * and is not a failure. An untyped factual sentence still becomes a
 * record (see extract.ts); it just licenses a restatement of itself
 * rather than a number.
 */
export function readingsFor(sentence: string): Reading[] {
  const s = String(sentence ?? "");
  if (!s.trim()) return [];
  const out: Reading[] = [];

  // Negations are tested before affirmations (MATERIAL_SHAPES order), and
  // the first reading for a given material wins, so "paraffin nahi"
  // cannot be overwritten by a later "paraffin" affirmation in the same
  // sentence.
  for (const shape of MATERIAL_SHAPES) {
    const m = s.match(shape.re);
    if (!m) continue;
    const key = materialKey(String(m[shape.group] ?? ""));
    if (!key) continue;
    out.push({ key, value: shape.value, because: m[0].trim() });
  }
  for (const p of PROCESSES) {
    if (p.re.test(s)) out.push({ key: p.key, value: true, because: (s.match(p.re) ?? [""])[0].trim() });
  }

  const n = numberNear(s);
  if (n != null) {
    const unit = UNIT_WORDS.find((u) => u.re.test(s));
    if (unit) {
      const kind = DURATION_KINDS.find((d) => d.re.test(s));
      // No recognised verb, no duration reading. A bare "24 ghante" in
      // a sentence we cannot type must NOT become a burn time.
      if (kind) {
        out.push({ key: `${kind.key}_${unit.unit}`, value: n, unit: unit.unit, because: `${n} ${unit.unit}` });
      }
    }
    const temp = normaliseDigits(s).match(TEMPERATURE);
    if (temp) out.push({ key: "process.temperature", value: Number(temp[1]), unit: "celsius", because: temp[0] });
  }

  if (REFUSALS.test(s)) {
    const material = out.some((r) => r.key.startsWith("material.") && r.value === false);
    // A refusal we can name is already covered by the material reading
    // above; one we cannot is recorded as a policy without inventing
    // what it is about.
    if (!material) out.push({ key: "policy.refusal", value: s.trim(), because: (s.match(REFUSALS) ?? [""])[0].trim() });
  }

  // De-duplicate by key: one sentence stating a fact twice is one fact.
  const byKey = new Map<string, Reading>();
  for (const r of out) if (!byKey.has(r.key)) byKey.set(r.key, r);
  return Array.from(byKey.values());
}
