// Dry run for the PROPOSED health and benefit rule class.
//
// NOTHING IS ENABLED BY THIS FILE. claimCheck is unchanged.
//
// WHY A NEW CLASS AND NOT A WIDENING. HEALTH already exists in
// claimCheck.ts and it is strict, but it needs either a medical VERB
// ("cures", "heals", "treats") or a named condition ("insomnia",
// "anxiety", "hair fall"). So:
//
//   "Relieves stress"   CAUGHT   - "relieves" plus a named condition
//   "Sleep better"      MISSED   - no verb, no condition
//   "Wake up refreshed" MISSED
//   "Helps you relax"   MISSED
//   "Good for the skin" MISSED
//
// These are SOFT benefit claims: an effect on the reader's body, mood
// or sleep, asserted without any of the words the medical rule looks
// for. They are the commonest shape in home-fragrance, wellness, food
// and personal-care copy, which is a large part of this product's
// market.
//
// WHY THEY ARE NOT MERELY PUFFERY. Under the ASCI code a claim about an
// effect on the body needs substantiation whether or not it names a
// disease. "Sleep better" is the claim an owner would be asked to
// prove, and nothing in the business's records can prove it.
//
// THE TIER MATTERS AS MUCH AS THE RULE. A benefit the owner HAS
// recorded is theirs to say. So this is proposed as `substantiation` -
// kept in a draft with a note saying how to make it sayable, stripped
// on publish - and NOT as `claim`, which would delete it from a draft
// the owner is still editing. One exception is argued below.
//
// USAGE
//   node scripts/benefitClaimsDryRun.mjs

/** PROPOSED. Tier: substantiation, except where noted. */
export const PROPOSED = [
  {
    name: "sleep / rest effect",
    tier: "substantiation",
    re: /\b(?:sleep|rest|doze|drift\s+off|nod\s+off)\s+(?:better|deeper|easier|faster|soundly|well)\b|\b(?:better|deeper|sounder)\s+sleep\b|\bwake\s+up\s+(?:refreshed|rested|renewed|clearer)\b|\bachchhi\s+neend\b|\bneend\s+(?:achchhi|gehri)\b/gi,
    why: "an effect on sleep that nothing on record backs",
  },
  {
    name: "mood / calm / focus effect",
    tier: "substantiation",
    re: /\b(?:helps?|lets?|makes?)\s+(?:you|him|her|them)\s+(?:relax|unwind|calm\s+down|sleep|feel\s+\w+)\b|\b(?:instantly|instant)\s+(?:calm|calming|relaxing|soothing)\b|\b(?:lifts?|improves?|boosts?)\s+(?:your\s+)?(?:mood|spirits|focus|concentration|energy)\b|\breduces?\s+(?:stress|tension|fatigue)\b|\bmood\s+(?:lifter|booster)\b/gi,
    why: "an effect on mood or focus that nothing on record backs",
  },
  {
    name: "body / skin / digestion effect",
    tier: "substantiation",
    // "the skin" as well as "your skin": the first draft of this rule
    // missed "Good for the skin on acne-prone days" for want of one
    // word, which is the kind of gap a dry run is for.
    re: /\b(?:good|great|better)\s+for\s+(?:your\s+|the\s+)?(?:skin|hair|gut|digestion|health|immunity|joints|bones|heart|eyes)\b|\b(?:improves?|aids?|supports?|helps?\s+with)\s+(?:your\s+|the\s+)?(?:digestion|immunity|metabolism|skin|hair\s*growth|circulation|sleep)\b|\b(?:detox(?:es|ifies)?|purifies|cleanses)\s+(?:your\s+|the\s+)?(?:body|blood|system|skin)\b/gi,
    why: "an effect on the body that nothing on record backs",
  },
  {
    name: "therapeutic framing",
    tier: "substantiation",
    re: /\b(?:therapeutic|healing|medicinal|restorative|rejuvenating|detoxifying)\b|\baroma\s*therapy\b|\bstress\s*[-\s]?(?:buster|relief|free)\b/gi,
    why: "a therapeutic framing that needs evidence",
  },
  {
    name: "safe for a vulnerable group",
    // THE ONE WITH A REAL-WORLD COST, and the reason it is proposed as
    // `claim` rather than `substantiation`: a candle, a food or a
    // cosmetic described as safe for a baby or in pregnancy, with no
    // test behind it, is the one claim here that can hurt somebody. A
    // draft is where the owner presses Publish from, so leaving it in
    // a draft is leaving it one click from a customer.
    tier: "claim",
    re: /\b(?:safe|suitable|gentle)\s+(?:enough\s+)?for\s+(?:babies|baby|infants?|newborns?|toddlers?|kids|children|pregnan\w+|asthmatics?|sensitive\s+skin)\b|\bnon[-\s]?toxic\b|\bhypo[-\s]?allergenic\b|\ballergy[-\s]free\b/gi,
    why: "a safety claim about a vulnerable group, which needs a test behind it",
  },
];

const normalise = (s) =>
  String(s ?? "").toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/['’]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Which proposed rules a line trips that the business does not back.
 *
 * Same licensing rule as the live guard: a phrase the business has
 * written down in its own records is theirs to repeat.
 */
export function wouldFlag(text, knownBlob) {
  const known = normalise(knownBlob);
  const hits = [];
  for (const rule of PROPOSED) {
    for (const m of String(text).matchAll(rule.re)) {
      const phrase = normalise(m[0]);
      if (phrase && known.includes(phrase)) continue;
      hits.push({ rule: rule.name, tier: rule.tier, phrase: m[0].trim() });
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
      "Paraffin wax kabhi nahi, sirf soy wax.",
      "Har candle 24 ghante set hoti hai.",
    ].join("\n"),
    lines: [
      { id: "the one Ovaiz named", text: "Light it an hour before bed and sleep better." },
      { id: "mood", text: "It helps you relax after a long day." },
      { id: "therapeutic", text: "Aromatherapy for your evenings, a real stress buster." },
      { id: "vulnerable group", text: "Non-toxic and safe for babies." },
      { id: "wake up", text: "You will wake up refreshed." },
      { id: "honest: the recorded facts", text: "Soy wax, 40 hour burn. 550." },
      { id: "honest: about the reader, no claim", text: "Evenings get loud. Light one at eight and the room slows down." },
      { id: "honest: a smell is not an effect", text: "It smells of lavender and a little vanilla." },
      { id: "honest: the recorded cure time", text: "Har candle 24 ghante set hoti hai." },
    ],
  },
  {
    id: "dairy_fixture",
    category: "Dairy and foods",
    known: ["Shree Dairy, Indore.", "Desi Ghee 500ml. Bilona method. 850.", "FSSAI licence 11223344556677."].join("\n"),
    lines: [
      { id: "digestion", text: "Bilona ghee aids digestion and supports immunity." },
      { id: "body", text: "Good for your joints and your skin." },
      { id: "honest", text: "Desi ghee, bilona method, 850. FSSAI licensed." },
      { id: "honest: a method is not a benefit", text: "Churned by hand, the way it has always been done." },
    ],
  },
  {
    id: "skincare_fixture",
    category: "Personal care",
    known: ["Neem and Co, Pune.", "Neem face wash 100ml. 320.", "Paraben free, as printed on the label."].join("\n"),
    lines: [
      { id: "skin", text: "Good for the skin on acne-prone days." },
      { id: "vulnerable group", text: "Hypoallergenic and gentle for sensitive skin." },
      { id: "detox", text: "It purifies your skin overnight." },
      { id: "honest: on the label", text: "Paraben free, as printed on the label." },
      { id: "honest: an ingredient is not a claim", text: "Neem and tulsi, 320." },
    ],
  },
];

function run() {
  console.log("PROPOSED HEALTH / BENEFIT RULE CLASS - nothing is enabled by this script.\n");
  const total = BUSINESSES.reduce((n, b) => n + b.lines.length, 0);
  console.log(`${PROPOSED.length} proposed rules, ${BUSINESSES.length} businesses, ${total} lines.`);
  console.log("Proposed tier: substantiation, except the vulnerable-group rule, which is proposed as claim.\n");
  let flagged = 0;
  let falsePositives = 0;
  let missed = 0;

  for (const b of BUSINESSES) {
    console.log("=".repeat(70));
    console.log(`${b.id}  (${b.category})`);
    console.log("=".repeat(70));
    for (const line of b.lines) {
      const hits = wouldFlag(line.text, b.known);
      const honest = line.id.startsWith("honest");
      if (hits.length) flagged += 1;
      if (hits.length && honest) falsePositives += 1;
      if (!hits.length && !honest) missed += 1;
      const mark = hits.length ? (honest ? "FALSE+" : "FLAG  ") : honest ? "keep  " : "MISS  ";
      console.log(`${mark} [${line.id}]`);
      console.log(`        ${line.text}`);
      for (const h of hits) console.log(`        -> ${h.rule} (${h.tier}): "${h.phrase}"`);
    }
    console.log("");
  }

  console.log("=".repeat(70));
  console.log(`Lines flagged: ${flagged} of ${total}`);
  console.log(`MISSED problem lines: ${missed}`);
  console.log(`FALSE POSITIVES on honest lines: ${falsePositives}  <- the number that decides this`);
  console.log("");
  console.log("Fixtures are reconstructed from this repo's tests, NOT production.");
}

if (process.argv[1]?.endsWith("benefitClaimsDryRun.mjs")) run();
