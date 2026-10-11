// Dry run for the PROPOSED comparative and performance rules.
//
// NOTHING IS ENABLED BY THIS FILE. claimCheck is unchanged.
//
// WHY EACH LINE WAS MISSED on the 11 October Facebook post, read out of
// the existing patterns rather than guessed:
//
//   "...separates a candle made with real fragrance oil from one made
//    with cheap synthetic alternatives"
//     - NAMED_COMPARISON knows "different from", "compared to",
//       "versus". It does not know "separates X from Y".
//     - RIVAL_DISPARAGEMENT only fires on a NEGATED pejorative:
//       "without the synthetic hit". Here the pejorative is ATTRIBUTED
//       to the rival - "made with cheap synthetic alternatives" - which
//       is the same claim with the negation removed.
//
//   "...rather than burning off in twenty minutes"
//     - every duration rule in the file reads digits. "twenty" is a
//       word.
//
//   "the scent lasts"
//     - there is no performance-duration rule at all. Nothing in the
//       claims layer asks how long anything lasts.
//
//   "Unlike most candles, ours is steady"
//     - COMPARATIVE's `unlike` list is brands|stores|shops|sellers|
//       competitors|companies. A PRODUCT noun is not in it, and the
//       existing comment explains why "unlike" was kept narrow:
//       "unlike anything you've smelled" is flourish, not a claim about
//       somebody else's wax. That reasoning still holds, so the
//       proposal below widens it to product nouns only when preceded by
//       most/other/the, never bare.
//
// USAGE
//   node scripts/comparativeDryRun.mjs

/** PROPOSED — comparisons and performance claims. */
export const PROPOSED = [
  {
    name: "separates X from Y",
    re: /\b(?:separates|sets\s+\w+\s+apart\s+from|the\s+difference\s+between)\b[^.!?]{0,80}\bfrom\b|\bsets\s+(?:it|this|ours?|them)\s+apart\b/gi,
    why: "a comparison with another product that nothing on record supports",
  },
  {
    name: "pejorative ATTRIBUTED to the rival",
    // The mirror of RIVAL_DISPARAGEMENT: "made with cheap synthetic
    // alternatives", "unlike the mass-produced ones".
    re: /\b(?:cheap|cheaper|synthetic|artificial|mass[-\s]produced|factory[-\s]made|ordinary|generic|inferior)\s+(?:[\w-]+\s+){0,2}(?:alternatives?|ones|options|versions|brands?|candles?|products?|stuff)\b/gi,
    why: "an attribute asserted about someone else's product",
  },
  {
    name: "unlike most/other PRODUCTS",
    re: /\bunlike\s+(?:most|other|the)\s+(?:[\w-]+\s+)?[\w-]+s\b/gi,
    why: "a comparison with products nothing on record describes",
  },
  {
    name: "most/other X don't",
    re: /\b(?:most|other)\s+[\w-]+s\s+(?:don'?t|do\s+not|can'?t|cannot|won'?t|fail|never)\b/gi,
    why: "a claim about what other products do not do",
  },
  {
    name: "duration attached to a performance verb",
    // NARROWED AFTER THIS SCRIPT WAS WRONG. The first version flagged
    // ANY spelled-out duration, and when the rule went live
    // tests/preferredLanguage.test.ts caught it on "Ninety minutes, one
    // candle that's yours" - a candle-making WORKSHOP. A workshop's
    // length is the central fact of a service, not a performance
    // claim, and service businesses state durations constantly. Every
    // fixture here was a product burn time, so the whole category was
    // missing from the dry run.
    re: /\b(?:lasts?|lasting|burns?|burning|stays?|staying|holds?|holding|lingers?|lingering|keeps?|keeping|fades?|fading)(?:\s+(?:off|on|out))?\s+(?:for\s+|in\s+|within\s+|up\s+to\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|sixty|ninety|\d+)\s+(?:minutes?|hours?|days?|weeks?)\b/gi,
    why: "a length of time nothing on record measures",
  },
  {
    name: "performance duration",
    re: /\b(?:the\s+)?(?:scent|fragrance|smell|aroma|burn|colour|color|shine|finish)\s+(?:lasts?|holds?|stays?|lingers?|keeps?)\b|\b(?:lasts?|burns?)\s+(?:for\s+)?(?:all|the\s+whole|hours?|days?)\b/gi,
    why: "a performance claim nothing on record measures",
  },
];

const normalise = (s) =>
  String(s ?? "").toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/['’]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Which proposed rules a line trips that the business does not back.
 *
 * A duration the business HAS recorded ("40 hour burn") must not be
 * flagged when the copy repeats it, so the known text is checked for the
 * matched phrase the same way the real guard does.
 */
export function wouldFlag(text, knownBlob) {
  const known = normalise(knownBlob);
  const hits = [];
  for (const rule of PROPOSED) {
    for (const m of String(text).matchAll(rule.re)) {
      const phrase = normalise(m[0]);
      if (phrase && known.includes(phrase)) continue;
      hits.push({ rule: rule.name, phrase: m[0].trim() });
    }
  }
  return hits;
}

const BUSINESSES = [
  {
    id: "candle_by_qaaf",
    category: "Home fragrance",
    known: [
      "Candle by Qaaf. Home fragrance, Shahjahanpur.",
      "Lavender candle. Soy wax, 40 hour burn. 550.",
      "Paraffin wax kabhi nahi — sirf soy wax, Kanpur ke supplier se.",
      "Har candle 24 ghante set hoti hai.",
      "Rose se logon ko sirdard hota tha.",
    ].join("\n"),
    lines: [
      { id: "the live post, line 1", text: "What separates a candle made with real fragrance oil from one made with cheap synthetic alternatives." },
      { id: "the live post, line 2", text: "It fills the room rather than burning off in twenty minutes." },
      { id: "the live post, line 3", text: "The scent lasts." },
      { id: "honest: the recorded burn", text: "Soy wax, 40 hour burn. 550." },
      { id: "honest: the recorded cure", text: "Har candle 24 ghante set hoti hai." },
      { id: "honest: plain copy", text: "Lavender candle, 550. Ships across Shahjahanpur." },
      { id: "honest: about the reader", text: "Evenings get loud. Light one at eight and the room slows down." },
      // THE CATEGORY THIS SCRIPT ORIGINALLY MISSED: a service's own
      // duration. Caught by tests/preferredLanguage.test.ts, not here.
      { id: "honest: a workshop's length", text: "Melt, choose your scent, pour. Ninety minutes, one candle that's yours." },
      { id: "honest: a session length", text: "Each session runs for two hours." },
    ],
  },
  {
    id: "dairy_fixture",
    category: "Dairy and foods",
    known: ["Shree Dairy, Indore.", "Desi Ghee 500ml. Bilona method. 850.", "Paneer made fresh every morning.", "FSSAI licence 11223344556677."].join("\n"),
    lines: [
      { id: "comparative", text: "Unlike most ghees, ours is made the bilona way." },
      { id: "attributed pejorative", text: "Not the cheap factory-made stuff you find in packets." },
      { id: "performance", text: "The aroma lasts for days." },
      { id: "honest", text: "Desi ghee, bilona method, 850. FSSAI licensed." },
      { id: "honest: a real daily fact", text: "Paneer made fresh every morning." },
    ],
  },
  {
    id: "textile_fixture",
    category: "Sarees and fabric",
    known: ["Meena Textiles, Varanasi.", "Banarasi silk saree. Handloom, pure silk, zari border. 6500.", "Woven by weavers we have worked with for eleven years."].join("\n"),
    lines: [
      { id: "comparative", text: "What sets it apart from the mass-produced ones on the market." },
      { id: "most X don't", text: "Most sarees don't hold their colour after a wash." },
      { id: "performance", text: "The colour stays for years." },
      { id: "honest", text: "Handloom Banarasi, pure silk, zari border. 6500." },
      { id: "honest: the recorded relationship", text: "Woven by weavers we have worked with for eleven years." },
    ],
  },
];

function run() {
  console.log("PROPOSED COMPARATIVE / PERFORMANCE RULES — nothing is enabled by this script.\n");
  console.log(`${PROPOSED.length} proposed rules, 3 businesses, ${BUSINESSES.reduce((n, b) => n + b.lines.length, 0)} lines.\n`);
  let flagged = 0;
  let falsePositives = 0;

  for (const b of BUSINESSES) {
    console.log("=".repeat(70));
    console.log(`${b.id}  (${b.category})`);
    console.log("=".repeat(70));
    for (const line of b.lines) {
      const hits = wouldFlag(line.text, b.known);
      const honest = line.id.startsWith("honest");
      if (hits.length) flagged += 1;
      if (hits.length && honest) falsePositives += 1;
      const mark = hits.length ? (honest ? "FALSE+" : "STRIP ") : honest ? "keep  " : "MISS  ";
      console.log(`${mark} [${line.id}]`);
      console.log(`        ${line.text}`);
      for (const h of hits) console.log(`        -> ${h.rule}: "${h.phrase}"`);
    }
    console.log("");
  }

  console.log("=".repeat(70));
  console.log(`Lines flagged: ${flagged} of ${BUSINESSES.reduce((n, b) => n + b.lines.length, 0)}`);
  console.log(`FALSE POSITIVES on honest lines: ${falsePositives}  <- the number that decides this`);
  console.log("");
  console.log("MISS on a non-honest line means the proposal does not catch it and");
  console.log("the live sentence would still go out. FALSE+ means an honest line");
  console.log("would lose its sentence, which is the cost side.");
  console.log("");
  console.log("Fixtures are reconstructed from this repo's tests, NOT production.");
}

if (process.argv[1]?.endsWith("comparativeDryRun.mjs")) run();
