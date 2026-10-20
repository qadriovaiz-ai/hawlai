// IS THIS RUN'S OUTPUT WORTH GRADING?
//
// Every exit run so far has been offered to the founder for blind
// grading on the strength of its own removal list, and three times that
// list was not evidence of anything:
//
//   run 6   "[LICENSE NUMBER NEEDED]" went out with no removal, because
//           a placeholder is not a claim and nothing was looking
//   run 7   a benefit claim reworded past a verb list of mine
//   run 8   ZERO removals in six cases — and one case had failed closed
//           while another's extractor came back empty, so silence read
//           as approval
//
// THE RUN CANNOT BE THE JUDGE OF THE RUN. So this reads a finished
// run's SURVIVING sentences back out of the saved results and asks the
// extractor about them again, from scratch. Any claim of a type nothing
// can license — benefit, safety, capability, comparison, customer_state
// — is a sentence that should have been removed and was not.
//
// It is the founder's first two numbers, computed mechanically, before
// a human spends an hour on a sheet that is not worth grading. About
// Rs 3 against Rs 12 for the run itself.
//
// IT IS NOT A SUBSTITUTE FOR THE BLIND GRADING. It can only catch what
// the extractor sees; a vague claim riding on a true fact still needs a
// person. It is a gate in front of the person's time.
//
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/outputGate.eval.ts
//   EVAL_RESULTS=<file.json> to gate a specific run

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractClaims, UNLICENSABLE_TYPES, NEEDS_RECIPIENT_RECORD } from "@/lib/facts/extractClaims";
import { notCopySentences } from "@/lib/content/notCopy";
import { WHATSAPP_OPT_OUT } from "@/lib/expertise/channelRules";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";
import { BUDGET_INR } from "./harness";

const GO = process.env.EVAL_GO === "1";
const OUT = join("scripts", "eval", "results");
const LEDGER = join("scripts", "eval", "spend.json");

const LINES: string[] = [];
function say(s = ""): void {
  LINES.push(s);
  process.stdout.write(`${s}\n`);
}

function loadKey(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  if (!existsSync(".env.local")) return false;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at < 0 || line.slice(0, at).trim() !== "ANTHROPIC_API_KEY") continue;
    const value = line.slice(at + 1).trim();
    if (!value) return false;
    process.env.ANTHROPIC_API_KEY = value;
    return true;
  }
  return false;
}

/** Nothing on record can ever license these. A survivor is a failure. */
const REFUSED = new Set<string>([...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]);

/** The AI-failure text, which is not copy and must not be graded as it. */
const FAILURE_MARKERS = [/something went wrong/i, /try again/i];

function newestResults(): string {
  if (process.env.EVAL_RESULTS) return process.env.EVAL_RESULTS;
  const file = readdirSync(OUT)
    .filter((f) => f.startsWith("s2-") && f.endsWith(".json") && !f.includes("grade"))
    .sort()
    .pop();
  if (!file) throw new Error("no s2 results to gate");
  return join(OUT, file);
}

/**
 * The sentences a case actually shipped, grouped.
 *
 * THE OPT-OUT LINE IS DROPPED, because it is appended after the door
 * and the extractor never saw it in the run. A batch I measure must be
 * the batch the pipeline sent, or I am clearing a pipeline on sentences
 * it never handled — which is the mistake the first recall gate made.
 */
function shipped(file: string): { caseId: string; sentences: string[] }[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { rows: { caseId: string; sentence: string }[] };
  const byCase = new Map<string, string[]>();
  for (const row of parsed.rows) {
    const text = String(row.sentence ?? "").trim();
    if (!text) continue;
    if (text.includes("Reply STOP") || text.includes(WHATSAPP_OPT_OUT)) continue;
    const list = byCase.get(row.caseId) ?? [];
    list.push(text);
    byCase.set(row.caseId, list);
  }
  return [...byCase.entries()].map(([caseId, sentences]) => ({ caseId, sentences }));
}

describe("the output gate", () => {
  it("asks the extractor again about what a run actually shipped", async () => {
    const file = newestResults();
    const cases = shipped(file);
    const per = costOfClaudeResponseInr({ input_tokens: 2600, output_tokens: 500 }, CLAUDE_MODELS.fast);
    const estimate = Math.round(per * cases.length * 1.3 * 100) / 100;
    const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { runs: [], totalInr: 0 };

    say();
    say("OUTPUT GATE — is this run worth grading?");
    say("=".repeat(68));
    say(`gating               ${file.replace(/\\/g, "/")}`);
    say(`cases                ${cases.length}`);
    say(`sentences            ${cases.reduce((n, c) => n + c.sentences.length, 0)}   (opt-out line excluded: the door never saw it)`);
    say(`ESTIMATE THIS RUN    Rs ${estimate.toFixed(2)}`);
    say(`already spent        Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(68));
    if (!GO) {
      say("DRY RUN — set EVAL_GO=1 to spend.");
      return;
    }
    expect(loadKey()).toBe(true);

    let spent = 0;
    const survivors: { caseId: string; claimType: string; canonical: string }[] = [];
    const notCopyFound: { caseId: string; sentence: string }[] = [];
    const failed: string[] = [];

    for (const c of cases) {
      // CHECKED IN CODE FIRST, FREE. A failure message or a leftover
      // placeholder is not something to ask a model about.
      for (const s of c.sentences) {
        if (FAILURE_MARKERS.some((re) => re.test(s))) failed.push(c.caseId);
      }
      for (const f of notCopySentences(c.sentences)) {
        notCopyFound.push({ caseId: c.caseId, sentence: c.sentences[f.sentenceIndex] });
      }

      const r = await extractClaims(c.sentences, { logContext: null });
      spent += r.costInr;
      say();
      say(`[${c.caseId}]  ${c.sentences.length} sentence(s)`);
      if (!r.ok) {
        say(`  EXTRACTOR UNREACHABLE — this case is not gated, and not graded either`);
        failed.push(c.caseId);
        continue;
      }
      if (!r.claims.length) {
        // The run-8 shape. Saying nothing is not saying it is fine.
        say(`  NO CLAIMS REPORTED — the same empty answer that made run 8 look clean`);
      }
      for (const claim of r.claims) {
        const bad = REFUSED.has(claim.claimType);
        if (bad) survivors.push({ caseId: c.caseId, claimType: claim.claimType, canonical: claim.canonical });
        say(`  ${bad ? "***" : "   "} ${claim.claimType} "${claim.canonical}"${bad ? "   <- SHOULD HAVE BEEN REMOVED" : ""}`);
      }
    }

    say();
    say("=".repeat(68));
    say(`CLAIMS THAT SHOULD HAVE BEEN REMOVED   ${survivors.length}`);
    for (const s of survivors) say(`   [${s.caseId}] ${s.claimType} — "${s.canonical}"`);
    say(`SENTENCES THAT ARE NOT COPY            ${notCopyFound.length}`);
    for (const n of notCopyFound) say(`   [${n.caseId}] "${n.sentence}"`);
    say(`CASES THAT DID NOT RUN                 ${[...new Set(failed)].length}${failed.length ? `   <<< ${[...new Set(failed)].join(", ")}` : ""}`);
    say(`ACTUAL COST                            Rs ${spent.toFixed(2)}`);
    const worth = survivors.length === 0 && notCopyFound.length === 0 && failed.length === 0;
    say("=".repeat(68));
    say(worth ? "WORTH GRADING. Send the sheet." : "NOT WORTH GRADING. Fix these first, and do not spend a human hour on it.");
    say("=".repeat(68));

    ledger.runs.push({ at: new Date().toISOString(), label: `output gate on ${file.split(/[\\/]/).pop()}`, inr: Math.round(spent * 100) / 100, calls: cases.length });
    ledger.totalInr = Math.round((ledger.totalInr + spent) * 100) / 100;
    writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
    writeFileSync(join(OUT, `output-gate-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`), `${LINES.join("\n")}\n`);
    say(`RUNNING TOTAL        Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
  }, 300_000);
});
