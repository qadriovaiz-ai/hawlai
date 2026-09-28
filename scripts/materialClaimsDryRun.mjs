// Dry run for the PROPOSED materials/ingredients claim terms.
//
// These terms are NOT enabled. CLAIM_TERMS in src/lib/claims/claimCheck.ts
// is unchanged, and a test asserts it stays that way until the list below
// is approved — turning them on changes what every guarded surface
// (content, email, paid ads, retargeting, WhatsApp) is allowed to say,
// not just SEO.
//
// WHAT IT ANSWERS: which existing lines would be stripped, and which
// would survive because the business already says the same thing
// somewhere of its own. A term is allowed when it appears in knownText —
// the site's own pages, product names and descriptions, Business
// Knowledge, brand pillars and description. So a claim already written
// into the website counts as its own evidence; that is pre-existing
// behaviour, and worth knowing before reading the results.
//
// USAGE
//   node scripts/materialClaimsDryRun.mjs <known.json> <candidates.json>
//
//   known.json      { "text": "...everything the business says about itself..." }
//   candidates.json [ { "surface": "email", "id": "...", "text": "..." }, ... ]
//
// The SQL that produces candidates.json is in the report that accompanies
// this file.

import { readFileSync } from "fs";

/** PROPOSED — materials, ingredients and how a thing was made. */
export const PROPOSED_MATERIAL_TERMS = [
  // Wax and base materials — the family that started this: a meta
  // description offered "No paraffin, no fake fragrance" for a business
  // whose Business Story says neither.
  "paraffin free", "no paraffin", "paraffin",
  "soy wax", "pure soy", "beeswax", "coconut wax", "palm free",
  // Fragrance and additives
  "no synthetic fragrance", "synthetic fragrance free", "no fake fragrance",
  "essential oil", "essential oils", "natural fragrance", "no added colour", "no added color", "dye free",
  // Wick and burn
  "lead free", "cotton wick", "wooden wick", "zinc free",
  // Make and provenance
  "hand poured", "handmade", "hand made", "small batch",
  // Adjacent categories, so this generalises past candles
  "bpa free", "food grade", "stainless steel", "solid wood", "pure cotton", "100% cotton", "gold plated", "sterling silver",
];

const normalise = (s) => String(s ?? "").toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/['’]/g, "'").replace(/\s+/g, " ").trim();

export function wouldFlag(text, knownBlob) {
  const t = normalise(text);
  const known = normalise(knownBlob);
  return PROPOSED_MATERIAL_TERMS.filter((term) => t.includes(term) && !known.includes(term));
}

export function report(known, candidates) {
  const rows = [];
  for (const c of candidates) {
    const hits = wouldFlag(c.text, known);
    if (hits.length) rows.push({ surface: c.surface, id: c.id, terms: hits, line: String(c.text).slice(0, 200) });
  }
  return rows;
}

if (process.argv[1]?.endsWith("materialClaimsDryRun.mjs") && process.argv[2]) {
  const known = JSON.parse(readFileSync(process.argv[2], "utf8")).text ?? "";
  const candidates = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : [];
  const rows = report(known, candidates);
  console.log(`candidates: ${candidates.length}  would be stripped: ${rows.length}`);
  for (const r of rows) console.log(`\n[${r.surface}] ${r.id}\n  terms: ${r.terms.join(", ")}\n  line:  ${r.line}`);
  const selfSupporting = PROPOSED_MATERIAL_TERMS.filter((t) => normalise(known).includes(t));
  console.log(`\nAlready backed by the business's own material, so never stripped: ${selfSupporting.join(", ") || "(none)"}`);
}
