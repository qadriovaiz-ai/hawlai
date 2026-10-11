// Dry run for 1a-i: the two forms that got through on 11 October.
//
// NOTHING IS ENABLED BY THIS FILE.
//
// THE LIVE LINE: "a cheap candle fades after two days."
//
// Two separate misses, both mine, both from the morning of the same day:
//
//   ATTRIBUTED_PEJORATIVE needs the noun to be one of
//   alternatives|ones|options|versions|brands|products|stuff.
//   A PRODUCT NOUN IS NOT IN THAT LIST, so "cheap candles" passes
//   while "cheap ones" is caught. I built the list from the live
//   sentence ("cheap synthetic alternatives") and never asked what
//   else a pejorative attaches to.
//
//   SPELLED_DURATION accepts for|in|within|up to before the number.
//   "after" is not there. "fades in two days" is caught; "fades after
//   two days" is not.
//
// WHY A DRY RUN FOR A TWO-WORD WIDENING. Both are STRIP rules: a false
// positive deletes a true sentence from an owner's copy. The pejorative
// one is the risk — "cheap" is a word honest copy uses about PRICE
// ("a cheap way to try a new scent"), and the product-noun widening is
// exactly what could catch that.
//
// USAGE
//   node scripts/pejorativeAndDurationDryRun.mjs

/** What is live today, for comparison. */
export const CURRENT = {
  pejorative:
    /\b(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|ordinary|generic|inferior)\s+(?:[\w-]+\s+){0,2}(?:alternatives?|ones|options|versions|brands?|products?|stuff)\b/gi,
  duration:
    /\b(?:lasts?|lasting|burns?|burning|stays?|staying|holds?|holding|lingers?|lingering|keeps?|keeping|fades?|fading)(?:\s+(?:off|on|out))?\s+(?:for\s+|in\s+|within\s+|up\s+to\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety|\d+)\s+(?:minutes?|hours?|days?|weeks?)\b/gi,
};

/**
 * PROPOSED.
 *
 * The pejorative keeps its noun list and adds a general shape: the
 * pejorative adjective followed by a plural or singular common noun,
 * but ONLY when the sentence is drawing a contrast. Without the
 * contrast requirement, "a cheap way to try a scent" is caught, and
 * that sentence is honest and about price.
 *
 * The contrast markers are the words that make it a comparison rather
 * than a description: not, unlike, than, instead of, rather than,
 * while, whereas, most, other, some, typical, ordinary — plus the
 * Hinglish ones an Indian owner's copy actually uses.
 */
export const PROPOSED = {
  pejorative: [
    // 1. The existing noun list, unchanged — these need no contrast
    //    marker because the noun itself names somebody else's product.
    /\b(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|ordinary|generic|inferior)\s+(?:[\w-]+\s+){0,2}(?:alternatives?|ones|options|versions|brands?|products?|stuff)\b/gi,
    // 2. NEW: pejorative + any noun, when a contrast marker is present
    //    in the same sentence.
    // THE NEGATION EXCLUSION, and the dry run is the only reason it
    // exists. The first version caught "Not cheap but it lasts." and
    // "Not a cheap candle but worth it." — both the business talking
    // about ITS OWN PRICE, which is honest and extremely common in
    // Indian copy. A pejorative DIRECTLY negated is self-referential,
    // not a claim about anyone else. "Not LIKE cheap candles" still
    // matches, because "like" sits in between.
    /\b(?:not|unlike|than|instead\s+of|rather\s+than|while|whereas|most|other|some|typical|usual)\b[^.!?]{0,60}(?<!\bnot\s)(?<!\bnot\sa\s)(?<!\bnot\san\s)\b(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|inferior)\s+[\w-]+\b/gi,
    /\b(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|inferior)\s+[\w-]+\b[^.!?]{0,60}\b(?:unlike|than|instead\s+of|rather\s+than|whereas)\b/gi,
    // 3. NEW: the live shape — an indefinite article plus a pejorative
    //    product, which IS a contrast even with no marker word:
    //    "a cheap candle fades after two days" is about somebody
    //    else's candle, not about price.
    /\b(?:a|an|the)\s+(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|inferior)\s+[\w-]+\s+(?:fades?|burns?|melts?|cracks?|smokes?|breaks?|lasts?|goes|gives)\b/gi,
  ],
  duration:
    /\b(?:lasts?|lasting|burns?|burning|stays?|staying|holds?|holding|lingers?|lingering|keeps?|keeping|fades?|fading)(?:\s+(?:off|on|out))?\s+(?:for\s+|in\s+|within\s+|up\s+to\s+|after\s+|by\s+|over\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety|\d+)\s+(?:minutes?|hours?|days?|weeks?)\b/gi,
};

function hits(res, text) {
  const list = Array.isArray(res) ? res : [res];
  const out = [];
  for (const re of list) {
    re.lastIndex = 0;
    for (const m of String(text).matchAll(re)) out.push(m[0].trim());
  }
  return out;
}

const CASES = [
  // --- must be caught (the live line and its family) ---
  { want: "strip", text: "A cheap candle fades after two days." },
  { want: "strip", text: "Not like cheap candles that fade in a week." },
  { want: "strip", text: "Unlike synthetic candles, ours is soy wax." },
  { want: "strip", text: "Most cheap candles smoke." },
  { want: "strip", text: "Better than the cheap wax other sellers use." },
  { want: "strip", text: "What separates it from cheap synthetic alternatives." },
  { want: "strip", text: "The scent fades after two days." },
  { want: "strip", text: "It burns out within thirty minutes." },

  // --- must NOT be caught (the cost side) ---
  // "cheap" about PRICE, which is honest and common in Indian copy.
  { want: "keep", text: "A cheap way to try a new scent." },
  { want: "keep", text: "Cheap and cheerful, under 300 rupees." },
  { want: "keep", text: "We kept it cheap so you can gift two." },
  { want: "keep", text: "Not cheap, but it lasts." },
  // recorded durations
  { want: "keep", text: "Soy wax, 40 hour burn. 550." },
  { want: "keep", text: "Har candle 24 ghante set hoti hai." },
  { want: "keep", text: "Melt, choose your scent, pour. Ninety minutes, one candle." },
  { want: "keep", text: "Each session runs for two hours." },
  // description, no contrast
  { want: "keep", text: "The generic term for it is soy wax." },
  { want: "keep", text: "Evenings get loud. Light one at eight." },
];

function run() {
  console.log("PROPOSED: pejorative product nouns + 'after' duration — nothing enabled by this script.\n");
  let fixed = 0, stillMissed = 0, falsePositives = 0, newFalsePositives = 0;

  for (const c of CASES) {
    const before = [...hits(CURRENT.pejorative, c.text), ...hits(CURRENT.duration, c.text)];
    const after = [...hits(PROPOSED.pejorative, c.text), ...hits(PROPOSED.duration, c.text)];
    const wasCaught = before.length > 0;
    const nowCaught = after.length > 0;

    let mark;
    if (c.want === "strip") {
      mark = nowCaught ? (wasCaught ? "ok    " : "FIXED ") : "MISS  ";
      if (!wasCaught && nowCaught) fixed += 1;
      if (!nowCaught) stillMissed += 1;
    } else {
      mark = nowCaught ? (wasCaught ? "FALSE+" : "NEW-F+") : "keep  ";
      if (nowCaught) falsePositives += 1;
      if (!wasCaught && nowCaught) newFalsePositives += 1;
    }
    console.log(`${mark} ${c.text}`);
    if (after.length) console.log(`        -> ${Array.from(new Set(after)).map((h) => `"${h}"`).join(", ")}`);
  }

  console.log("\n" + "=".repeat(68));
  console.log(`FIXED (was missed, now caught):      ${fixed}`);
  console.log(`STILL MISSED:                        ${stillMissed}`);
  console.log(`FALSE POSITIVES on honest lines:     ${falsePositives}`);
  console.log(`  of those, NEWLY introduced by this: ${newFalsePositives}   <- the number that decides this`);
  console.log("");
  console.log('"cheap" about price is the whole risk here. A NEW-F+ on any of');
  console.log("the four price lines means the widening is wrong, not the list.");
}

if (process.argv[1]?.endsWith("pejorativeAndDurationDryRun.mjs")) run();
