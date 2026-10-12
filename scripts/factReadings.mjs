// THE READING TABLE THE OWNER CONFIRMS, ONCE.
//
// PLAN-FACT-BOUND-GENERATION §C.7. A record extracted from a Hinglish
// sentence is a READING of that sentence — "I read this as: soy wax
// only, no paraffin. Right?" — so it carries `inferred` and licenses
// nothing until the owner says yes.
//
// THIS SCRIPT PRINTS THAT TABLE. It reads nothing from the database and
// writes nothing anywhere: rows come from a JSON file you point it at,
// or from the built-in sample below. Nothing is moved out of
// `business_story` by this or by anything it calls.
//
// USAGE
//   node scripts/factReadings.mjs                 the built-in sample
//   node scripts/factReadings.mjs rows.json       your own rows
//
// Where rows.json is what the query in docs/PLAN-AGENCY.md A.4c
// returns: [{ "id": "...", "category": "...", "title": "...",
// "content": "..." }, …]
//
// It is .mjs and imports nothing from src/ on purpose: the extractor is
// TypeScript with path aliases, so this re-implements nothing — it
// shells the same logic through tsx when available, and otherwise says
// so rather than printing a second, divergent answer.

import { readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

/** The sentences the founder pasted on 2026-10-11, as a runnable sample. */
const SAMPLE = [
  { id: "r1", category: "business_story", title: "How it's made, step by step", content: "Wax double boiler mein melt karti hoon. Phir fragrance milati hoon." },
  { id: "r2", category: "business_story", title: "The part that takes longest", content: "Fragrance ko 65 degrees par milana padta hai." },
  { id: "r3", category: "business_story", title: "The detail people notice", content: "Top bilkul smooth hota hai." },
  { id: "r4", category: "business_story", title: "What you refuse to do", content: "Kabhi sasta paraffin wax mix nahi karti." },
  { id: "r5", category: "business_story", title: "What people get wrong", content: "Log sochte hain ki 10 ghante jalti hai. 40 hours burn hota hai." },
  { id: "r6", category: "business_story", title: "Something I can stand behind", content: "Paraffin-free, soy wax only. Hand-poured in small batches." },
  { id: "r7", category: "business_story", title: "Materials and suppliers", content: "Lavender isliye choose ki kyunki kaam ke baad khud stressed rehti thi. Soy wax Kanpur ke supplier se aata hai." },
  { id: "r8", category: "business_story", title: "How it started", content: "Maine 2019 mein shuru kiya." },
  { id: "r9", category: "business_story", title: "The first customers", content: "Pehle customers mere padosi the." },
  { id: "r10", category: "business_story", title: "How you talk about the work", content: "Main ise apna kaam kehti hoon." },
];

const file = process.argv[2];
const rows = file ? JSON.parse(readFileSync(file, "utf8")) : SAMPLE;

// The extractor is the single source of truth, so this runs it rather
// than re-deriving anything. If tsx is not available the script says so
// instead of guessing — a second implementation that drifts from the
// first is exactly what this whole design is trying to stop.
const runner = existsSync("node_modules/.bin/tsx") || existsSync("node_modules/tsx");
if (!runner) {
  console.error("tsx is not installed, and this script will not re-implement the extractor.");
  console.error("Run the same table from the test instead:");
  console.error("  npx vitest run tests/factExtractor.test.ts -t 'readings to confirm'");
  process.exit(1);
}

const inline = `
import { extractFromKnowledge, readingsToConfirm } from "${process.cwd().replace(/\\/g, "/")}/src/lib/facts/extract.ts";
const rows = ${JSON.stringify(rows)};
const x = extractFromKnowledge("preview", rows);
const table = readingsToConfirm(x);

const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
console.log("");
console.log("READINGS TO CONFIRM — nothing is saved, nothing is moved.");
console.log("Each line is how Hawlai READ one of your sentences. Say yes, or correct it.");
console.log("");
console.log(pad("ROW", 30) + pad("HAWLAI READ IT AS", 34) + "FROM THESE WORDS");
console.log("-".repeat(108));
for (const r of table) {
  const reading = r.unit ? r.key + " = " + r.value + " " + r.unit : r.key + " = " + r.value;
  console.log(pad(r.rowTitle, 30) + pad(reading, 34) + '"' + r.because + '"');
}
if (!table.length) console.log("(no readings — nothing needed interpreting)");

console.log("");
console.log("QUOTED AS WRITTEN (no interpretation, no sign-off needed): " +
  x.records.filter((r) => r.confidence === "observed").length);

console.log("");
console.log("HELD BACK, and why:");
for (const s of x.skipped) console.log("  " + pad(s.rowTitle, 30) + s.reason);
for (const d of x.droppedMotive) console.log("  " + pad(d.rowTitle, 30) + 'motive sentence: "' + d.text.slice(0, 60) + '"');
for (const d of x.droppedBelief) console.log("  " + pad(d.rowTitle, 30) + 'reported belief (not a fact): "' + d.text.slice(0, 60) + '"');

console.log("");
console.log("TOTALS: " + x.records.length + " records, " + table.length + " need your yes, " +
  x.skipped.length + " rows held back, " + x.droppedMotive.length + " motive + " +
  x.droppedBelief.length + " reported-belief sentence(s) dropped.");
console.log("");
`;

// Written to a temp file rather than passed with --eval: on Windows the
// shell mangles a multi-line inline script, and the first version of
// this exited 0 having printed nothing at all.
const tmp = join(tmpdir(), `hawlai-readings-${process.pid}.ts`);
writeFileSync(tmp, inline, "utf8");
try {
  const r = spawnSync("npx", ["tsx", tmp], { stdio: "inherit", shell: process.platform === "win32" });
  process.exit(r.status ?? 1);
} finally {
  try { rmSync(tmp); } catch {}
}
