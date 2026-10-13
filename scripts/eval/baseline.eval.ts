// THE BASELINE RUN — the current system, measured.
//
// PLAN-FACT-BOUND-GENERATION §8.1. Nothing is built to beat this until
// this exists, because "the verifier removes 9% of honest copy" means
// nothing without the number it is being compared to.
//
// IT DOES NOT RUN BY ACCIDENT. Without --go it prints the estimate and
// exits. With --go it checks the estimate against the remaining budget
// and refuses rather than crossing it.
//
//   npx tsx scripts/eval/run.ts              estimate only, free
//   npx tsx scripts/eval/run.ts --go         the paid run
//   npx tsx scripts/eval/run.ts --go --stub  the whole pipeline, free
//
// --stub is how the harness itself was verified before a rupee was
// spent: the same code path with a canned model reply.

import { describe, it, expect } from "vitest";

// process.stdout.write, not console.log: vitest buffers console output
// per test and the run summary — the numbers this whole thing exists to
// report — was being swallowed. The summary is also written to a file,
// because a number you have to scroll back for is a number nobody
// reads.
const LINES: string[] = [];
function say(...parts: unknown[]): void {
  const line = parts.map(String).join(" ");
  LINES.push(line);
  process.stdout.write(`${line}
`);
}
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CASES } from "./cases";
import { BUDGET_INR, Spend, estimateInr, meterFetch, toGradedRows, gradingSheet, type GradedSentence } from "./harness";
import { CLAUDE_MODELS } from "@/lib/models";

// Flags come from the ENVIRONMENT here, not argv: vitest owns argv.
//
//   npx vitest run --config vitest.eval.config.mts
//     estimate only, nothing called, nothing spent
//
//   EVAL_STUB=1 npx vitest run --config vitest.eval.config.mts
//     the whole pipeline against a canned reply, still free
//
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts
//     the paid run
const GO = process.env.EVAL_GO === "1" || process.env.EVAL_STUB === "1";
const STUB = process.env.EVAL_STUB === "1";
const OUT = join("scripts", "eval", "results");
const LEDGER = join("scripts", "eval", "spend.json");

// ---------------------------------------------------------------------
// The key, loaded from .env.local the way the app does. Never printed.
// ---------------------------------------------------------------------
function loadKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (!existsSync(".env.local")) return false;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    if (name !== "ANTHROPIC_API_KEY") continue;
    const value = line.slice(at + 1).trim();
    if (!value) return false;
    process.env.ANTHROPIC_API_KEY = value;
    return true;
  }
  return false;
}

type Ledger = { runs: { at: string; label: string; inr: number; calls: number }[]; totalInr: number };

function readLedger(): Ledger {
  if (!existsSync(LEDGER)) return { runs: [], totalInr: 0 };
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    return { runs: [], totalInr: 0 };
  }
}

async function runEval(): Promise<{ ran: boolean; reason?: string }> {
  const estimate = estimateInr(CASES.length);
  const ledger = readLedger();
  const spentSoFar = Math.round(ledger.totalInr * 100) / 100;
  const remaining = Math.round((BUDGET_INR - spentSoFar) * 100) / 100;

  say("");
  say("EVAL — BASELINE OF THE CURRENT SYSTEM");
  say("=".repeat(64));
  say(`cases                 ${CASES.length}  (3 tenants: products, services, food)`);
  say(`model                 ${CLAUDE_MODELS.standard}`);
  say(`assumed per case      3 calls, 2600 in + 420 out tokens each (pessimistic)`);
  say("");
  say(`ESTIMATE FOR THIS RUN  Rs ${estimate.toFixed(2)}`);
  say(`already spent          Rs ${spentSoFar.toFixed(2)}  (${ledger.runs.length} previous run(s))`);
  say(`budget                 Rs ${BUDGET_INR.toFixed(2)}`);
  say(`remaining              Rs ${remaining.toFixed(2)}`);
  say("=".repeat(64));

  if (estimate > remaining) {
    say("");
    say(`STOPPING: the estimate (Rs ${estimate.toFixed(2)}) is more than the remaining budget (Rs ${remaining.toFixed(2)}).`);
    say("Nothing has been called. Raise the ceiling or cut the case list.");
    return { ran: false, reason: "over budget" };
  }

  if (!GO) {
    say("");
    say("Estimate only — nothing was called and nothing was spent.");
    say("Set EVAL_GO=1 to run it, or EVAL_STUB=1 to exercise the whole pipeline for free.");
    return { ran: false, reason: "estimate only" };
  }

  if (!STUB && !loadKey()) {
    say("");
    say("STOPPING: ANTHROPIC_API_KEY is not set and has no value in .env.local.");
    return { ran: false, reason: "no key" };
  }

  const spend = new Spend();
  const restore = STUB ? stubModel() : meterFetch(spend);
  const rows: GradedSentence[] = [];
  const perCase: { id: string; sentences: number; removed: number; error?: string }[] = [];

  try {
    // Imported here, AFTER the key is in the environment, because the
    // client reads it when a call is made rather than at import time —
    // but ordering it this way removes the question entirely.
    const { runCase } = await import("./surfaces");
    for (const c of CASES) {
      process.stdout.write(`  ${c.id} … `);
      try {
        const r = await runCase(c);
        const graded = toGradedRows(c, r.output, r.removed);
        rows.push(...graded);
        perCase.push({ id: c.id, sentences: graded.length, removed: r.removed.length });
        say(`${graded.length} sentence(s), ${r.removed.length} removed`);
      } catch (err: any) {
        perCase.push({ id: c.id, sentences: 0, removed: 0, error: err?.message ?? String(err) });
        say(`FAILED — ${err?.message ?? err}`);
      }
    }
  } finally {
    restore();
  }

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = STUB ? `stub-${stamp}` : `baseline-${stamp}`;

  writeFileSync(join(OUT, `${label}.json`), JSON.stringify({ label, perCase, rows }, null, 2), "utf8");
  for (const grader of ["ovaiz", "reviewer"]) {
    writeFileSync(join(OUT, `${label}-grade-${grader}.md`), gradingSheet(rows, grader), "utf8");
  }

  const factual = rows.filter((r) => r.kind === "factual").length;
  say("");
  say("=".repeat(64));
  say(`sentences produced     ${rows.length}  (${factual} factual, ${rows.length - factual} not)`);
  say(`cases that failed      ${perCase.filter((p) => p.error).length}`);
  if (STUB) {
    say("STUB RUN — no API calls, nothing spent.");
  } else {
    const total = Math.round((spentSoFar + spend.rounded) * 100) / 100;
    say(`calls made             ${spend.calls}`);
    say(`tokens                 ${spend.inputTokens} in, ${spend.outputTokens} out`);
    say(`ACTUAL COST THIS RUN   Rs ${spend.rounded.toFixed(2)}   (estimated Rs ${estimate.toFixed(2)})`);
    say(`RUNNING TOTAL          Rs ${total.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    ledger.runs.push({ at: new Date().toISOString(), label, inr: spend.rounded, calls: spend.calls });
    ledger.totalInr = total;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), "utf8");
    if (total > BUDGET_INR) say("WARNING: the running total has crossed the ceiling. No further run will start.");
  }
  say("");
  say(`grading sheets         ${join(OUT, `${label}-grade-ovaiz.md`)}`);
  say(`                       ${join(OUT, `${label}-grade-reviewer.md`)}`);
  say("=".repeat(64));
  say("");
  writeFileSync(join(OUT, `${label}-summary.txt`), LINES.join("\n"), "utf8");
  return { ran: true };
}

/** A canned reply, so the whole pipeline can be exercised for nothing. */
function stubModel(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    if (!String(url).includes("anthropic.com")) return original(url, init);
    const body = {
      content: [{ type: "text", text: JSON.stringify({
        subject: "A quieter evening",
        message: "Evenings get loud. The lavender candle is soy wax with a 40 hour burn. 999, and shipping is free. Order on the store page.",
        text: "Evenings get loud. The lavender candle is soy wax with a 40 hour burn. 999, and shipping is free. Order on the store page.",
        reply: "Yes, it is 999.",
      }) }],
      usage: { input_tokens: 0, output_tokens: 0 },
      model: CLAUDE_MODELS.standard,
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("eval: the baseline of the current system", () => {
  it("runs every case and writes the grading sheets", async () => {
    const r = await runEval();
    // An estimate-only invocation is a PASS, not a skip: printing the
    // number is the whole job when no flag is set.
    expect(r).toBeTruthy();
    if (r.ran) {
      // A run that produced nothing is a broken harness, not a result.
      const files = existsSync(OUT) ? require("node:fs").readdirSync(OUT) : [];
      expect(files.some((f: string) => f.endsWith("-grade-ovaiz.md"))).toBe(true);
    }
  });
});
