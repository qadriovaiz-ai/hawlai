// Dry run for the PROPOSED CLAIM_TERMS widening (phase 3, item 4.2).
//
// NOTHING IS ENABLED BY THIS FILE. CLAIM_TERMS in
// src/lib/claims/claimCheck.ts is unchanged, and this exists so the
// decision is made on evidence rather than on the shape of the list.
// Enabling it changes what EVERY guarded surface may say — content,
// email, paid ads, retargeting, WhatsApp, SEO — not just one.
//
// THREE CATEGORIES, because a list that only generalises past candles on
// paper has not been shown to generalise. Candles, a dairy, and a
// textile shop.
//
// A LIMITATION, STATED UP FRONT: these fixtures are reconstructed from
// this repository's own test data and the recorded live captions. They
// are NOT read from production. The result is indicative of how the
// rules behave, not a measurement of what any real business would lose.
// A production run needs the SQL in the report that accompanies
// scripts/materialClaimsDryRun.mjs, which only Ovaiz can execute.
//
// USAGE
//   node scripts/claimTermsDryRun.mjs

/** PROPOSED — category claims beyond one trade's materials. */
export const PROPOSED_CLAIM_TERMS = [
  // Food and dairy
  "pure ghee", "desi ghee", "a2 milk", "cold pressed", "stone ground", "fssai",
  "no preservatives", "preservative free", "farm fresh", "export quality",
  // Textiles
  "pure silk", "pure cotton", "100% cotton", "100% silk", "handloom", "khadi",
  "colour fast", "color fast", "azo free",
  // Cross-category marks and grades
  "organic", "handmade", "100%", "a grade", "isi", "bis", "gi tagged", "iso certified",
];

const normalise = (s) =>
  String(s ?? "").toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/['’]/g, "'").replace(/\s+/g, " ").trim();

// THE SYNONYM FAMILIES, which the first version of this script ignored —
// and ignoring them OVERSTATED the damage, which is the worse direction
// for a script whose job is to inform a decision.
//
// The real guard (claimCheck.isKnownClaim) does not ask whether the
// exact term appears in the business's own material. It asks whether any
// member of the term's synonym family does, in any word form. So a
// candle maker who writes "hand-poured" has already claimed "handmade",
// and asking them to attest both would be the software failing to
// understand its own question.
//
// Mirrored here rather than imported because claimCheck is TypeScript
// and this script is plain ESM run by node directly. The families below
// must stay in step with CLAIM_SYNONYMS; the test
// tests/claimTermsDryRun.test.ts asserts that for the families that
// already exist there.
const PROPOSED_SYNONYMS = [
  // Already in CLAIM_SYNONYMS today.
  ["handmade", "hand made", "hand poured", "handcrafted in"],
  // Proposed alongside the terms.
  ["pure ghee", "desi ghee"],
  ["no preservatives", "preservative free"],
  ["pure cotton", "100% cotton"],
  ["pure silk", "100% silk"],
  ["colour fast", "color fast"],
  ["organic", "certified organic"],
  ["export quality", "export grade"],
];

/** Every member of a term's family, so one recorded phrasing licenses the rest. */
function family(term) {
  return PROPOSED_SYNONYMS.find((group) => group.includes(term)) ?? [term];
}

/**
 * Which proposed terms a line uses that the business does not back
 * anywhere of its own.
 *
 * `knownText` is everything the business says about itself: its site
 * pages, product names and descriptions, Business Knowledge, brand
 * pillars and description. A claim already written into the website
 * counts as its own evidence — that is pre-existing behaviour and worth
 * knowing before reading the results.
 */
export function wouldFlag(text, knownBlob, { synonyms = true } = {}) {
  const t = normalise(text);
  const known = normalise(knownBlob);
  return PROPOSED_CLAIM_TERMS.filter((term) => {
    if (!t.includes(term)) return false;
    const wordings = synonyms ? family(term) : [term];
    return !wordings.some((w) => known.includes(w));
  });
}

// ---------------------------------------------------------------------
// The three businesses.
// ---------------------------------------------------------------------

const BUSINESSES = [
  {
    id: "candle_by_qaaf",
    category: "Home fragrance",
    // Reconstructed from tests/shortStaysSpecific.test.ts and
    // tests/claimsGuard.test.ts.
    known: [
      "Candle by Qaaf. Home fragrance, Shahjahanpur.",
      "Lavender candle. Hand-poured soy wax, 40 hour burn. 550.",
      "Candle Making Workshop. Hands-on soy wax candle making, 90 minutes. 800.",
      "Paraffin wax kabhi nahi — sirf soy wax, Kanpur ke supplier se.",
      "Har candle 24 ghante cure hoti hai — jaldi nikaali to surface kharab.",
      "Workshop mein har koi khushboo khud chunta hai.",
      "Hand-poured in small batches.",
    ].join("\n"),
    lines: [
      { surface: "content", id: "c1", text: "Hand-poured soy wax, 40 hour burn. Lavender candle, 550." },
      { surface: "content", id: "c2", text: "100% natural soy wax, organic essential oils." },
      { surface: "email", id: "e1", text: "Our handmade candles are made with pure soy wax." },
      { surface: "seo", id: "s1", text: "Organic handmade candles in Shahjahanpur — export quality." },
      { surface: "ads", id: "a1", text: "Candle Making Workshop, 90 minutes, 800." },
    ],
  },
  {
    id: "dairy_fixture",
    category: "Dairy and foods",
    known: [
      "Shree Dairy. Dairy and foods, Indore.",
      "Desi Ghee 500ml. Bilona method, from our own buffaloes. 850.",
      "Paneer 200g. Made fresh every morning. 120.",
      "FSSAI licence 11223344556677.",
      "We have no cold storage, so everything is sold the day it is made.",
    ].join("\n"),
    lines: [
      { surface: "content", id: "c1", text: "Desi ghee, bilona method, 850. FSSAI licensed." },
      { surface: "content", id: "c2", text: "Pure ghee with no preservatives, farm fresh and 100% organic." },
      { surface: "email", id: "e1", text: "A2 milk paneer, cold pressed and export quality." },
      { surface: "whatsapp", id: "w1", text: "Paneer made fresh every morning. 120 for 200g." },
      { surface: "seo", id: "s1", text: "Stone ground, preservative free, A grade dairy in Indore." },
    ],
  },
  {
    id: "textile_fixture",
    category: "Sarees and fabric",
    known: [
      "Meena Textiles. Sarees and fabric, Varanasi.",
      "Banarasi silk saree. Handloom, pure silk, zari border. 6500.",
      "Cotton kurta fabric, 2.5m. 480.",
      "Every saree is woven by weavers we have worked with for eleven years.",
    ].join("\n"),
    lines: [
      { surface: "content", id: "c1", text: "Handloom Banarasi, pure silk, zari border. 6500." },
      { surface: "content", id: "c2", text: "100% cotton kurta fabric, colour fast and azo free." },
      { surface: "email", id: "e1", text: "Khadi and pure cotton, ISO certified, GI tagged Banarasi." },
      { surface: "ads", id: "a1", text: "Cotton kurta fabric, 2.5m, 480." },
      { surface: "seo", id: "s1", text: "Organic handmade sarees, A grade silk, export quality." },
    ],
  },
];

function run() {
  console.log("PROPOSED CLAIM_TERMS DRY RUN — nothing is enabled by this script.\n");
  console.log(`${PROPOSED_CLAIM_TERMS.length} proposed terms, 3 businesses, ${BUSINESSES.reduce((n, b) => n + b.lines.length, 0)} lines.\n`);

  let totalStripped = 0;
  for (const b of BUSINESSES) {
    console.log("=".repeat(70));
    console.log(`${b.id}  (${b.category})`);
    console.log("=".repeat(70));

    const selfSupporting = PROPOSED_CLAIM_TERMS.filter((t) => family(t).some((w) => normalise(b.known).includes(w)));
    console.log(`Backed by this business's own material (directly or by synonym), so never stripped:`);
    console.log(`  ${selfSupporting.join(", ") || "(none)"}`);
    console.log("");

    for (const line of b.lines) {
      const hits = wouldFlag(line.text, b.known);
      const naive = wouldFlag(line.text, b.known, { synonyms: false });
      if (hits.length) totalStripped += 1;
      const savedBySynonym = naive.filter((t) => !hits.includes(t));
      console.log(`${hits.length ? "STRIP " : "keep  "} [${line.surface}] ${line.id}`);
      console.log(`        ${line.text}`);
      if (hits.length) console.log(`        -> would lose the sentence carrying: ${hits.join(", ")}`);
      if (savedBySynonym.length) {
        console.log(`        -> kept only because a synonym IS on record: ${savedBySynonym.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log("=".repeat(70));
  console.log(`Lines affected: ${totalStripped} of ${BUSINESSES.reduce((n, b) => n + b.lines.length, 0)}`);
  console.log("");
  console.log("HOW TO READ THIS. The claims guard removes by SENTENCE, so a");
  console.log("line marked STRIP loses the whole sentence containing the term —");
  console.log("a true price in the same sentence as an unbacked claim goes with");
  console.log("it. That is existing behaviour, not something this list changes,");
  console.log("and it is the reason the list is worth reading before enabling.");
  console.log("");
  console.log("Fixtures are reconstructed from this repo's tests, NOT production.");
}

if (process.argv[1]?.endsWith("claimTermsDryRun.mjs")) run();
