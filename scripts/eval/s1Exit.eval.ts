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
/**
 * The whole pipeline against canned replies, for nothing.
 *
 * This is the step that caught `server-only` breaking all 30 baseline
 * cases before a rupee was spent, and the founder asked for it before
 * every paid S2 run. A stub cannot tell us whether the copy is true —
 * it tells us the four calls happen, in order, and that the output
 * survives the plumbing.
 */
const STUB = process.env.EVAL_STUB === "1";
const OUT = join("scripts", "eval", "results");
const LEDGER = join("scripts", "eval", "spend.json");
/** Where a parallel run puts its own row, to be merged afterwards. */
const LEDGER_D = join("scripts", "eval", "spend.d");
const PER_RUN_CAP_INR = 30;

/**
 * The cases for the surface under test.
 *
 * EMAIL BY DEFAULT, so every S1 invocation still means what it meant.
 * S2 reuses this runner whole rather than forking it: a second copy
 * would drift, and the incompleteness reporting, the spacing, the retry
 * and the ledger are the parts that took the longest to get right.
 *
 *   EVAL_SURFACE=whatsapp  npx vitest run --config vitest.eval.config.mts scripts/eval/s1Exit.eval.ts
 */
const SURFACE = process.env.EVAL_SURFACE ?? "email";
/**
 * A slice of a surface's cases, as "1of2".
 *
 * NEEDED BY THE PER-RUN CAP, which did its job on 2026-10-20 and is the
 * reason this exists. The social run estimated Rs 30.57 against a
 * ceiling of Rs 30.00, so the harness stopped before calling anything -
 * correctly, and the twelve cases did not run.
 *
 * Twelve cases is the largest surface in the set, and the answer is not
 * to raise the ceiling: a cap that moves whenever something touches it
 * is not a cap. Two halves of six cost the same money, fit under the
 * cap, and produce two sheets that grade exactly as one would.
 */
const SLICE = process.env.EVAL_SLICE ?? "";

function sliced<T>(all: T[]): T[] {
  const m = /^(\d+)of(\d+)$/.exec(SLICE);
  if (!m) return all;
  const part = Number(m[1]);
  const parts = Number(m[2]);
  const size = Math.ceil(all.length / parts);
  return all.slice((part - 1) * size, part * size);
}

/**
 * Named cases only, comma-separated.
 *
 * FOR RECOVERING A PARTIAL RUN WITHOUT PAYING FOR ALL OF IT. The
 * parallel social runs of 2026-10-20 lost three cases to rate limiting
 * - "The AI service is busy" - and their 45-second retries hit it too,
 * because three processes each making seven calls per case is three
 * times the concurrent rate the spacing was tuned for. I warned about
 * exactly that before launching and kept per-process spacing, and
 * per-process spacing is not what the provider counts.
 *
 * Re-running both affected halves would have cost Rs 35 to recover
 * three cases and thrown away nine good ones. This costs about Rs 9.
 */
const ONLY_CASES = (process.env.EVAL_CASES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const EMAIL_CASES = ONLY_CASES.length
  ? CASES.filter((c) => ONLY_CASES.includes(c.id))
  : sliced(CASES.filter((c) => c.surface === SURFACE));

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

/**
 * Canned replies for the four calls, in order.
 *
 * It answers by TOOL NAME rather than by call count, because the order
 * is what is being tested: if the door ever called them out of order, a
 * count-based stub would hide it and this will not.
 */
function stubPipeline(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    if (!String(url).includes("anthropic.com")) return original(url, init);
    const body = JSON.parse(init.body);
    const tool = body?.tools?.[0]?.name;
    const reply = (content: unknown) =>
      new Response(JSON.stringify({ content, usage: { input_tokens: 0, output_tokens: 0 }, model: body.model }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    if (tool === "select_claims") {
      // Cite nothing, so Validate approves nothing and the writer gets
      // the "do not fill the gap" branch. That exercises the path a
      // thin-record business actually takes.
      return reply([{ type: "tool_use", name: tool, input: { claims: [], conflicts: [], unknowns: ["a stub run selects nothing"] } }]);
    }
    if (tool === "report_claims") return reply([{ type: "tool_use", name: tool, input: { claims: [] } }]);
    if (tool === "report_verdicts") return reply([{ type: "tool_use", name: tool, input: { verdicts: [] } }]);
    // The write step: prose, in the shape each surface expects.
    return reply([
      {
        type: "text",
        text: JSON.stringify({
          subject: "A stub subject",
          message: "Hum yahan hain. Koi sawaal ho toh poochh lo.",
          text: "Hum yahan hain. Koi sawaal ho toh poochh lo.",
          body: "Hum yahan hain. Koi sawaal ho toh poochh lo.",
        }),
      },
    ]);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("the S1 exit test", () => {
  it("re-runs the email cases through the fact-bound pipeline", async () => {
    const base = baselineEmail();
    const estimate = estimateInr(EMAIL_CASES.length);
    const ledger = readLedger();
    const spentSoFar = Math.round(ledger.totalInr * 100) / 100;

    say("");
    say(`EXIT TEST — the fact-bound pipeline on ${SURFACE}`);
    say("=".repeat(66));
    say(`cases                 ${EMAIL_CASES.length}${SLICE ? ` of this surface, slice ${SLICE}` : ""}  (${EMAIL_CASES.map((c) => c.id).join(", ")})`);
    say(`baseline (email)      ${base.claims} claim sentences: ${base.T} T, ${base.F} F, ${base.U} U`);
    say(`ESTIMATE THIS RUN     Rs ${estimate.toFixed(2)}   (per-run cap Rs ${PER_RUN_CAP_INR.toFixed(2)})`);
    say(`already spent         Rs ${spentSoFar.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(66));

    // THE BASELINE IS EMAIL'S. For another surface there is a graded
    // baseline in the 13 October run too, but these three assertions
    // are email's numbers, so they only hold for email — checked rather
    // than silently compared against the wrong thing.
    if (SURFACE !== "email") {
      say(`NOTE: the baseline figures above are EMAIL's. This run is ${SURFACE}.`);
      say(`Its own 13 October baseline: see the graded sheet, surface ${SURFACE}.`);
    }
    // The baseline must have parsed, or every comparison below is a
    // claim about nothing.
    //
    // NINE, NOT TEN. I reported ten to the founder, from
    // `grep -c 'surface: "email"'` — which also counted the line in the
    // EvalCase type that lists the four surfaces. The baseline's 70
    // email claim sentences are unaffected: that number comes from the
    // graded sheet, not from this count.
    expect(EMAIL_CASES.length).toBeGreaterThan(0);
    if (SURFACE === "email") {
      expect(EMAIL_CASES.length).toBe(9);
      expect(base.claims).toBe(70);
      expect(base.F).toBe(20);
      expect(base.T).toBe(34);
    }

    // A STUB IS NOT A SPEND, SO NO CEILING APPLIES TO IT.
    //
    // Found on 2026-10-20 with Rs 6.25 left: the product-description
    // wiring could not be checked with a free stub run, because the
    // ceiling test ran before the STUB test and refused it. That is
    // backwards in the worst possible way - a stub costs nothing, and
    // the moment it matters MOST is exactly when the budget is almost
    // gone and no paid run is available to prove a wiring works.
    if (!STUB && (estimate > PER_RUN_CAP_INR || estimate + spentSoFar > BUDGET_INR)) {
      say("STOPPING: over a ceiling. Nothing was called.");
      return;
    }
    if (!GO && !STUB) {
      say("");
      say("Estimate only — nothing called, nothing spent.");
      say("  EVAL_STUB=1  the whole pipeline against canned replies, free");
      say("  EVAL_GO=1    the paid run");
      return;
    }
    if (!STUB && !loadKey()) {
      say("STOPPING: ANTHROPIC_API_KEY has no value in .env.local.");
      return;
    }

    // THE FLAG IS FORCED HERE, not left to the environment: an exit test
    // that measured the OLD path because a variable was unset would
    // report a pass for the wrong pipeline.
    const previous = process.env.FACT_BOUND_COPY;
    process.env.FACT_BOUND_COPY = "1";

    // Declared out here because the summary below reports them.
    const SPACING_MS = Number(process.env.EVAL_SPACING_MS ?? 12_000);
    const RETRY_PAUSE_MS = Number(process.env.EVAL_RETRY_PAUSE_MS ?? 45_000);
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let retries = 0;

    const spend = new Spend();
    const restore = STUB ? stubPipeline() : meterFetch(spend);
    const rows: GradedSentence[] = [];
    const perCase: {
      id: string;
      sentences: number;
      removed: number;
      note: string | null;
      incomplete: boolean;
      error?: string;
      /** The agent's own account of why nothing was written. */
      failure?: { kind?: string; cause?: string; detail?: string; malformed?: boolean } | null;
    }[] = [];

    try {
      const { runCase } = await import("./surfaces");
      // SPACED, AND RETRIED ONCE. Five of nine cases were dropped by
      // the provider in the run of 2026-10-16: four calls per email,
      // nine emails, back to back. The pipeline failed closed on each,
      // which is correct, and left the run worthless.
      //
      // A gap between cases and one retry after a longer pause is a
      // MEASUREMENT fix, not a product one — nothing here changes what
      // the door does when a call is refused.
      for (const [index, c] of EMAIL_CASES.entries()) {
        if (index > 0) await pause(SPACING_MS);
        process.stdout.write(`  ${c.id} … `);
        try {
          let r: any = await runCase(c);
          if (r.incomplete) {
            process.stdout.write(`refused, waiting ${Math.round(RETRY_PAUSE_MS / 1000)}s and retrying … `);
            await pause(RETRY_PAUSE_MS);
            r = await runCase(c);
            retries += 1;
          }
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
          perCase.push({ id: c.id, sentences: graded.length, removed: r.removed.length, note, incomplete, failure: r.failure ?? null });
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
    const label = `${SURFACE === "email" ? "s1-exit" : `s2-${SURFACE}`}${SLICE ? `-${SLICE}` : ""}${ONLY_CASES.length ? "-topup" : ""}-${stamp}`;
    writeFileSync(join(OUT, `${label}.json`), JSON.stringify({ label, baseline: base, perCase, rows }, null, 2), "utf8");
    writeFileSync(join(OUT, `${label}-grade-reviewer.md`), gradingSheet(rows, "reviewer"), "utf8");

    const rounded = STUB ? 0 : spend.rounded;
    say("");
    say("=".repeat(66));
    say(`sentences produced    ${rows.length}   (baseline email run produced 136 in total)`);
    const incomplete = perCase.filter((p) => p.incomplete || p.error);
    say(`cases that threw      ${perCase.filter((p) => p.error).length}`);
    say(`CASES THAT WROTE NOTHING  ${incomplete.length} of ${EMAIL_CASES.length}${incomplete.length ? `   <<< ${incomplete.map((p) => p.id).join(", ")}` : ""}`);
    say(`calls made            ${spend.calls}   (4 per email: select, write, extract, judge)`);
    say(`cases retried         ${retries}   (spacing ${SPACING_MS}ms between cases)`);
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
      // AND WHY, not just which. A run that says only "3 of 6 wrote
      // nothing" sends somebody back to the provider's dashboard
      // guessing; the agents know the difference between a truncated
      // reply, an unreachable model and an exhausted account.
      for (const p of incomplete) {
        const f = p.failure;
        const why = f
          ? [f.kind && `kind: ${f.kind}`, f.malformed && "the reply could not be parsed", f.cause && `cause: ${f.cause}`, f.detail && `detail: ${f.detail}`]
              .filter(Boolean)
              .join(" | ")
          : p.error
            ? `threw: ${p.error}`
            : "no reason recorded by the agent";
        say(`   [${p.id}] ${why}`);
      }
      say(`THIS RUN IS INCOMPLETE. ${incomplete.length} of ${EMAIL_CASES.length} cases never reached the model, so the`);
      say("sheet below covers only the rest and NO verdict about the pipeline can");
      say("be drawn from it. The low cost is the symptom, not the result.");
      say("=".repeat(66));
    }
    say(`GRADE THIS: ${join(OUT, `${label}-grade-reviewer.md`)}`);
    say("The three numbers are the reviewer's to fill in. This run measures cost and produces the sheet.");

    writeFileSync(join(OUT, `${label}-summary.txt`), LINES.join("\n"), "utf8");
    // A STUB SPENDS NOTHING AND IS NOT A RUN, so it never touches the
    // ledger — a zero row there would make the run count a lie.
    if (!STUB) ledger.runs.push({ at: new Date().toISOString(), label, inr: rounded, calls: spend.calls });
    if (!STUB) {
      ledger.totalInr = Math.round((spentSoFar + rounded) * 100) / 100;
      // ONE FILE PER RUN, BECAUSE THREE RUNS GO AT ONCE NOW.
      //
      // The founder asked for the three confirmation runs in parallel.
      // Each process reads this ledger, appends its own row and writes
      // the whole file back — so three of them racing would silently
      // drop two rows, and the ledger is the only record of what has
      // been spent. An instrument that loses its own measurements is
      // the worst version of B18.
      //
      // So a run writes its row to spend.d/ and nothing else, and the
      // rows are merged into spend.json afterwards. The "already spent"
      // figure each parallel run PRINTS is therefore the total as it
      // stood when they all started, which is accurate for the decision
      // it informs — whether the run may begin — and is reconciled
      // after.
      mkdirSync(LEDGER_D, { recursive: true });
      writeFileSync(join(LEDGER_D, `${label}.json`), JSON.stringify({ at: new Date().toISOString(), label, inr: rounded, calls: spend.calls }, null, 2), "utf8");
    }

    if (STUB) say("STUB RUN — canned replies, nothing called, nothing spent.");
    else expect(spend.calls).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
