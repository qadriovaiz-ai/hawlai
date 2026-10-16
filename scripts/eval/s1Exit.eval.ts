// THE S1 EXIT TEST.
//
// docs/PLAN-CORE-ARCHITECTURE.md §3, exactly as the design states it:
//
//   "Re-run the 13 Oct eval on email cases: unsupported claims 0 by
//    reviewer grading; wrongly-removed not worse; cost per email
//    measured"
//
// The same ten email cases, the same three tenants, the same saved
// fixtures. Nothing new is invented, so the comparison is to the
// baseline and not to a kinder set.
//
// WHAT IT DOES NOT DECIDE. It produces a grading sheet and measures
// cost. Whether a sentence is true is the reviewer's call — one human
// grader, by the founder's decision of 2026-10-16. My own regex probes
// decided nothing here; believing them is the mistake that made the
// first baseline report wrong.
//
//   npx vitest run --config vitest.eval.config.mts scripts/eval/s1Exit.eval.ts
//     estimate only, free
//
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/s1Exit.eval.ts
//     the paid run, with FACT_BOUND_COPY forced on

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "./cases";
import { BUDGET_INR, Spend, meterFetch, toGradedRows, gradingSheet, type GradedSentence } from "./harness";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";

const LINES: string[] = [];
function say(...parts: unknown[]): void {
  const line = parts.map(String).join(" ");
  LINES.push(line);
  process.stdout.write(`${line}\n`);
}

const GO = process.env.EVAL_GO === "1";
const OUT = join("scripts", "eval", "results");
const LEDGER = join("scripts", "eval", "spend.json");
const PER_RUN_CAP_INR = 30;

/** The email cases, in the baseline's own order. */
const EMAIL_CASES = CASES.filter((c) => c.surface === "email");

/**
 * The baseline, email only, from the reviewer's filled sheet.
 *
 * Counted from the file rather than typed in, so the comparison cannot
 * drift from the data it claims to compare against.
 */
function baselineEmail(): { T: number; F: number; U: number; claims: number } {
  const sheet = join(OUT, "baseline-2026-10-13T05-11-56-100Z-grade-reviewer-FILLED.md");
  const tally = { T: 0, F: 0, U: 0, claims: 0 };
  let surface = "";
  for (const line of readFileSync(sheet, "utf8").split(/\r?\n/)) {
    const head = line.match(/^##\s+\S+\s+.*?·\s*(\w+)\s*·/);
    if (head) {
      surface = head[1];
      continue;
    }
    if (!line.startsWith("|") || surface !== "email") continue;
    const verdict = line.split("|").map((c) => c.trim())[1];
    if (verdict === "T" || verdict === "F" || verdict === "U") {
      tally[verdict] += 1;
      tally.claims += 1;
    }
  }
  return tally;
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

/** Four calls an email: select and write on sonnet, extract and judge on haiku. */
function estimateInr(caseCount: number): number {
  const per =
    costOfClaudeResponseInr({ input_tokens: 1500, output_tokens: 350 }, CLAUDE_MODELS.standard) +
    costOfClaudeResponseInr({ input_tokens: 1100, output_tokens: 450 }, CLAUDE_MODELS.standard) +
    costOfClaudeResponseInr({ input_tokens: 900, output_tokens: 400 }, CLAUDE_MODELS.fast) +
    costOfClaudeResponseInr({ input_tokens: 700, output_tokens: 200 }, CLAUDE_MODELS.fast);
  // 20% headroom: the first baseline's estimate was 4x its actual, and
  // an estimate that comes in UNDER is the one that matters.
  return Math.round(per * caseCount * 1.2 * 100) / 100;
}

describe("the S1 exit test", () => {
  it("re-runs the email cases through the fact-bound pipeline", async () => {
    const base = baselineEmail();
    const estimate = estimateInr(EMAIL_CASES.length);
    const ledger = readLedger();
    const spentSoFar = Math.round(ledger.totalInr * 100) / 100;

    say("");
    say("S1 EXIT TEST — the fact-bound pipeline on email");
    say("=".repeat(66));
    say(`cases                 ${EMAIL_CASES.length}  (${EMAIL_CASES.map((c) => c.id).join(", ")})`);
    say(`baseline, email only  ${base.claims} claim sentences: ${base.T} T, ${base.F} F, ${base.U} U`);
    say(`ESTIMATE THIS RUN     Rs ${estimate.toFixed(2)}   (per-run cap Rs ${PER_RUN_CAP_INR.toFixed(2)})`);
    say(`already spent         Rs ${spentSoFar.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(66));

    // The baseline must have parsed, or every comparison below is a
    // claim about nothing.
    //
    // NINE, NOT TEN. I reported ten to the founder, from
    // `grep -c 'surface: "email"'` — which also counted the line in the
    // EvalCase type that lists the four surfaces. The baseline's 70
    // email claim sentences are unaffected: that number comes from the
    // graded sheet, not from this count.
    expect(EMAIL_CASES.length).toBe(9);
    expect(base.claims).toBe(70);
    expect(base.F).toBe(20);
    expect(base.T).toBe(34);

    if (estimate > PER_RUN_CAP_INR || estimate + spentSoFar > BUDGET_INR) {
      say("STOPPING: over a ceiling. Nothing was called.");
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

    // THE FLAG IS FORCED HERE, not left to the environment: an exit test
    // that measured the OLD path because a variable was unset would
    // report a pass for the wrong pipeline.
    const previous = process.env.FACT_BOUND_COPY;
    process.env.FACT_BOUND_COPY = "1";

    const spend = new Spend();
    const restore = meterFetch(spend);
    const rows: GradedSentence[] = [];
    const perCase: { id: string; sentences: number; removed: number; note: string | null; incomplete: boolean; error?: string }[] = [];

    try {
      const { runCase } = await import("./surfaces");
      for (const c of EMAIL_CASES) {
        process.stdout.write(`  ${c.id} … `);
        try {
          const r: any = await runCase(c);
          const graded = toGradedRows(c, r.output, r.removed);
          rows.push(...graded);
          const note = r.output?._factsNote ?? null;
          // A CASE THAT FAILED CLOSED IS NOT A CASE THAT RAN.
          //
          // The run of 2026-10-16 reported "cases that failed 0" and a
          // cost of Rs 9.46 while FIVE of nine cases had produced
          // nothing but the AI-failure message: their select call was
          // refused by the provider, the pipeline failed closed exactly
          // as designed, and no exception was thrown. The cheap number
          // looked like good news. An incomplete run must not be able
          // to read as a clean one.
          const incomplete = Boolean(r.incomplete);
          perCase.push({ id: c.id, sentences: graded.length, removed: r.removed.length, note, incomplete });
          say(`${graded.length} sentence(s)${note ? ", facts note present" : ""}${incomplete ? "   *** NOTHING WAS WRITTEN - the model could not be reached ***" : ""}`);
        } catch (err: any) {
          perCase.push({ id: c.id, sentences: 0, removed: 0, note: null, incomplete: true, error: err?.message ?? String(err) });
          say(`FAILED — ${err?.message ?? err}`);
        }
      }
    } finally {
      restore();
      if (previous === undefined) delete process.env.FACT_BOUND_COPY;
      else process.env.FACT_BOUND_COPY = previous;
    }

    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const label = `s1-exit-${stamp}`;
    writeFileSync(join(OUT, `${label}.json`), JSON.stringify({ label, baseline: base, perCase, rows }, null, 2), "utf8");
    writeFileSync(join(OUT, `${label}-grade-reviewer.md`), gradingSheet(rows, "reviewer"), "utf8");

    const rounded = spend.rounded;
    say("");
    say("=".repeat(66));
    say(`sentences produced    ${rows.length}   (baseline email run produced 136 in total)`);
    const incomplete = perCase.filter((p) => p.incomplete || p.error);
    say(`cases that threw      ${perCase.filter((p) => p.error).length}`);
    say(`CASES THAT WROTE NOTHING  ${incomplete.length} of ${EMAIL_CASES.length}${incomplete.length ? `   <<< ${incomplete.map((p) => p.id).join(", ")}` : ""}`);
    say(`calls made            ${spend.calls}   (4 per email: select, write, extract, judge)`);
    say(`tokens                ${spend.inputTokens} in, ${spend.outputTokens} out`);
    say(`ACTUAL COST THIS RUN  Rs ${rounded.toFixed(2)}   (estimated Rs ${estimate.toFixed(2)})`);
    say(`COST PER EMAIL        Rs ${(rounded / Math.max(1, EMAIL_CASES.length)).toFixed(2)}   (baseline was Rs 0.93)`);
    say(`RUNNING TOTAL         Rs ${(spentSoFar + rounded).toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(66));
    say("");
    say("WHAT THE OWNER WOULD HAVE BEEN TOLD, per case:");
    for (const p of perCase) {
      if (!p.note) continue;
      say(`  [${p.id}]`);
      for (const line of String(p.note).split("\n")) say(`     ${line}`);
    }
    say("");
    if (incomplete.length) {
      say("");
      say("=".repeat(66));
      say(`THIS RUN IS INCOMPLETE. ${incomplete.length} of ${EMAIL_CASES.length} cases never reached the model, so the`);
      say("sheet below covers only the rest and NO verdict about the pipeline can");
      say("be drawn from it. The low cost is the symptom, not the result.");
      say("=".repeat(66));
    }
    say(`GRADE THIS: ${join(OUT, `${label}-grade-reviewer.md`)}`);
    say("The three numbers are the reviewer's to fill in. This run measures cost and produces the sheet.");

    writeFileSync(join(OUT, `${label}-summary.txt`), LINES.join("\n"), "utf8");
    ledger.runs.push({ at: new Date().toISOString(), label, inr: rounded, calls: spend.calls });
    ledger.totalInr = Math.round((spentSoFar + rounded) * 100) / 100;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), "utf8");

    expect(spend.calls).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
