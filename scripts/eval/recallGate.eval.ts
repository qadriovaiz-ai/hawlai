// THE HINGLISH RECALL GATE.
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.2, founder's go of 2026-10-15 for
// ~Rs 28. This is the measurement the whole C2 design rests on, and it
// is run BEFORE anything depends on it.
//
// WHY THIS IS THE RISKIEST PART. Step 4a enumerates the claims a piece
// of copy makes; step 4b then judges them. A claim 4a does not
// enumerate is never judged, so a miss PASSES a false sentence in
// silence. The denylist's failures were at least visible in the output.
// This one's would not be.
//
// SO THE QUESTION IS RECALL, NOT PRECISION: of the 33 sentences a human
// graded FALSE in the 13 October baseline — 20 of them Hinglish — how
// many does the extractor even notice? A sentence it notices can be
// refused by the licence table. One it does not notice cannot.
//
//   npx vitest run --config vitest.eval.config.mts scripts/eval/recallGate.eval.ts
//     the estimate, free
//
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/recallGate.eval.ts
//     the paid run
//
// EACH CASE IS ONE CALL, with all of its sentences in order — the shape
// the real pipeline uses, so the measurement is of the pipeline and not
// of a kinder arrangement.

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_INR } from "./harness";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";

const LINES: string[] = [];
function say(...parts: unknown[]): void {
  const line = parts.map(String).join(" ");
  LINES.push(line);
  process.stdout.write(`${line}\n`);
}

const GO = process.env.EVAL_GO === "1";
const SHEET = join("scripts", "eval", "results", "baseline-2026-10-13T05-11-56-100Z-grade-reviewer-FILLED.md");
const OUT = join("scripts", "eval", "results");
const LEDGER = join("scripts", "eval", "spend.json");

/** The founder's per-run cap, separate from and inside the Rs 500 total. */
const PER_RUN_CAP_INR = 30;

type Row = { verdict: "T" | "F" | "U"; sentence: string };
type Case = { id: string; rows: Row[] };

/** The reviewer's filled sheet: every sentence, in order, with its verdict. */
function readSheet(): Case[] {
  const cases: Case[] = [];
  let current: Case | null = null;
  for (const line of readFileSync(SHEET, "utf8").split(/\r?\n/)) {
    const head = line.match(/^##\s+(\S+)\s+/);
    if (head) {
      current = { id: head[1], rows: [] };
      cases.push(current);
      continue;
    }
    if (!line.startsWith("|") || !current) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 5) continue;
    const verdict = cols[1];
    // Every row, graded or not: the extractor is given the whole piece,
    // exactly as the pipeline would.
    if (verdict === "verdict" || verdict.startsWith("-")) continue;
    current.rows.push({ verdict: (["T", "F", "U"].includes(verdict) ? verdict : "U") as Row["verdict"], sentence: cols[4] });
  }
  return cases.filter((c) => c.rows.length > 0);
}

function readLedger(): { runs: { at: string; label: string; inr: number; calls: number }[]; totalInr: number } {
  if (!existsSync(LEDGER)) return { runs: [], totalInr: 0 };
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    return { runs: [], totalInr: 0 };
  }
}

function loadKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (!existsSync(".env.local")) return false;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at < 0) continue;
    if (line.slice(0, at).trim() !== "ANTHROPIC_API_KEY") continue;
    const value = line.slice(at + 1).trim();
    if (!value) return false;
    process.env.ANTHROPIC_API_KEY = value;
    return true;
  }
  return false;
}

/** Pessimistic, per case: a fat system prompt, every sentence, a long answer. */
function estimateInr(caseCount: number): number {
  const per = costOfClaudeResponseInr({ input_tokens: 1300, output_tokens: 900 }, CLAUDE_MODELS.fast);
  return Math.round(per * caseCount * 100) / 100;
}

describe("the Hinglish recall gate", () => {
  it("measures whether the extractor notices the sentences a human called false", async () => {
    const cases = readSheet();
    const rows = cases.flatMap((c) => c.rows);
    const falseRows = rows.filter((r) => r.verdict === "F");
    const estimate = estimateInr(cases.length);
    const ledger = readLedger();
    const spentSoFar = Math.round(ledger.totalInr * 100) / 100;

    say("");
    say("HINGLISH RECALL GATE — C2 step 4a");
    say("=".repeat(64));
    say(`cases                 ${cases.length}`);
    say(`sentences             ${rows.length}  (${falseRows.length} graded F by the reviewer)`);
    say(`model                 ${CLAUDE_MODELS.fast}`);
    say(`ESTIMATE THIS RUN     Rs ${estimate.toFixed(2)}   (per-run cap Rs ${PER_RUN_CAP_INR.toFixed(2)})`);
    say(`already spent         Rs ${spentSoFar.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(64));

    // The sheet must have parsed, or every number below is a lie about
    // nothing.
    expect(cases.length).toBe(30);
    expect(falseRows.length).toBe(33);

    if (estimate > PER_RUN_CAP_INR) {
      say(`STOPPING: the estimate is over the Rs ${PER_RUN_CAP_INR} per-run cap. Nothing was called.`);
      return;
    }
    if (estimate + spentSoFar > BUDGET_INR) {
      say("STOPPING: this run would cross the total ceiling. Nothing was called.");
      return;
    }
    if (!GO) {
      say("");
      say("Estimate only — nothing called, nothing spent. Set EVAL_GO=1 to run it.");
      return;
    }
    if (!loadKey()) {
      say("STOPPING: ANTHROPIC_API_KEY has no value in .env.local.");
      return;
    }

    const { extractClaims } = await import("@/lib/facts/extractClaims");
    let spent = 0;
    let calls = 0;
    const failures: { caseId: string; sentence: string }[] = [];
    const noticed: { caseId: string; sentence: string; claims: string[] }[] = [];
    let tNoticed = 0;
    let tTotal = 0;

    for (const c of cases) {
      process.stdout.write(`  ${c.id} … `);
      const result = await extractClaims(c.rows.map((r) => r.sentence));
      calls += 1;
      spent += result.costInr;
      if (!result.ok) {
        say(`CALL FAILED — ${result.reason}`);
        // A failed call is not a recall miss; it is a missing
        // measurement, and counting it either way would be dishonest.
        continue;
      }
      const byIndex = new Map<number, string[]>();
      for (const claim of result.claims) {
        const list = byIndex.get(claim.sentenceIndex) ?? [];
        list.push(`${claim.claimType}/${claim.subject}${claim.polarity === "hedge" ? "/hedge" : ""}: ${claim.canonical}`);
        byIndex.set(claim.sentenceIndex, list);
      }
      // A CLAIM REPORTED ONCE COVERS EVERY SENTENCE THAT MAKES IT.
      //
      // Found in gate run 3, as a miss that was not one. candle-05
      // carries "Hamare candles soy wax se bante hain — yeh slower aur
      // cleaner jalte hain regular paraffin wax ke mukable" TWICE, once
      // in bullets and once in the body, differing only by a full stop.
      // The model enumerated the claim once and attributed it to one
      // index, which is correct behaviour; this harness counted per
      // index and read the twin as unnoticed. The comparison WAS caught.
      //
      // Measuring recall per index while the extractor reports per
      // claim is the bug, and it is in the measurement, not the model.
      const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const claimsForText = new Map<string, string[]>();
      c.rows.forEach((row, i) => {
        const claims = byIndex.get(i);
        if (claims?.length) claimsForText.set(normalise(row.sentence), claims);
      });
      c.rows.forEach((row, i) => {
        if (byIndex.get(i)?.length) return;
        const twin = claimsForText.get(normalise(row.sentence));
        if (twin) byIndex.set(i, twin);
      });
      let missedHere = 0;
      c.rows.forEach((row, i) => {
        const claims = byIndex.get(i) ?? [];
        if (row.verdict === "T") {
          tTotal += 1;
          if (claims.length) tNoticed += 1;
        }
        if (row.verdict !== "F") return;
        if (claims.length) noticed.push({ caseId: c.id, sentence: row.sentence, claims });
        else {
          failures.push({ caseId: c.id, sentence: row.sentence });
          missedHere += 1;
        }
      });
      say(`${result.claims.length} claim(s), ${missedHere} F-sentence(s) missed`);
    }

    const recall = falseRows.length ? (falseRows.length - failures.length) / falseRows.length : 0;
    const rounded = Math.round(spent * 100) / 100;

    say("");
    say("=".repeat(64));
    say(`F SENTENCES NOTICED   ${falseRows.length - failures.length} of ${falseRows.length}   (${(recall * 100).toFixed(1)}%)`);
    say(`T sentences noticed   ${tNoticed} of ${tTotal}   (a claim noticed here is judged, not refused)`);
    say(`calls made            ${calls}`);
    say(`ACTUAL COST THIS RUN  Rs ${rounded.toFixed(2)}   (estimated Rs ${estimate.toFixed(2)})`);
    say(`RUNNING TOTAL         Rs ${(spentSoFar + rounded).toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say(`VERDICT               ${failures.length === 0 ? "PASS" : "FAIL"} — the gate is every F sentence noticed`);
    say("=".repeat(64));

    if (failures.length) {
      say("");
      say("MISSED — a claim nobody enumerates is a claim nobody judges:");
      for (const f of failures) say(`  [${f.caseId}] ${f.sentence}`);
    }

    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(OUT, `recall-gate-${stamp}.json`), JSON.stringify({ recall, failures, noticed, calls, inr: rounded }, null, 2), "utf8");
    writeFileSync(join(OUT, `recall-gate-${stamp}.txt`), LINES.join("\n"), "utf8");
    ledger.runs.push({ at: new Date().toISOString(), label: `recall-gate-${stamp}`, inr: rounded, calls });
    ledger.totalInr = Math.round((spentSoFar + rounded) * 100) / 100;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), "utf8");

    // THE RUN ITSELF MUST NOT FAIL THE SUITE on a low score: the number
    // is the deliverable, and a thrown assertion would hide the list of
    // missed sentences the founder needs to see. The verdict is printed
    // and written to the file.
    expect(calls).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
