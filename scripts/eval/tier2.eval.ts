// TIER 2 — THE CASES ONLY A MODEL CAN SETTLE, IN ONE BATCHED RUN.
//
// docs/PLAN-S2-ADVERSARIAL.md §4, approved 2026-10-20. 170 of the 287
// adversarial cases are settled in code and run on every commit for
// nothing. These are the rest: claim typing (B7), extractor recall in a
// real batch (B11), judge entailment (B4, B8, B17) and the figure cases
// whose figure has to be read out of a sentence before any arithmetic
// can be done (B6).
//
// WHAT IT RUNS, AND WHAT IT DOES NOT. The two extraction passes, which
// are the cheap half of the pipeline and the half where recall lives.
// NOT the judge: that is a second call per batch for a verdict on
// meaning, and the cases that reach it are reported as NEEDS THE JUDGE
// rather than counted as passes. A gate that scored its undecidables as
// successes would be the most expensive kind of wrong.
//
// HOW A CASE IS SCORED. The same three mechanisms the pipeline uses,
// in the same order:
//
//   refused outright   a claim whose type nothing can license -
//                      benefit, safety, capability, comparison - or a
//                      customer_state claim. No judge call, in the
//                      product or here.
//   figure mismatch    a numeric claim whose figure appears in no
//                      record of this business, by the same arithmetic
//                      verifyClaims uses.
//   needs the judge    anything else. Honestly undecided.
//
// BATCHED BY FIXTURE AND SURFACE, because B11 is specifically about
// recall over a whole message: a sentence sent on its own is reported
// and refused, and the same sentence among four others is not. A batch
// that does not look like a message would measure the wrong thing,
// which is B18.
//
//   npx vitest run --config vitest.eval.config.mts scripts/eval/tier2.eval.ts
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/tier2.eval.ts

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractClaims, extractUnlicensable, UNLICENSABLE_TYPES, NEEDS_RECIPIENT_RECORD } from "@/lib/facts/extractClaims";
import { contextFromFacts } from "@/lib/facts/getContext";
import { figureInText } from "@/lib/facts/validateSelection";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";
import { BUDGET_INR } from "./harness";
import { WHATSAPP_ADVERSARIAL } from "./adversarial/whatsapp";
import { LEAD_MESSAGE_ADVERSARIAL } from "./adversarial/leadMessage";
import { SOCIAL_ADVERSARIAL } from "./adversarial/social";
import { PRODUCT_DESCRIPTION_ADVERSARIAL } from "./adversarial/productDescription";
import { tier2, type AdversarialCase } from "./adversarial/types";

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

const REFUSED = new Set<string>([...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]);
const NUMERIC = new Set(["price", "offer", "shipping", "duration", "count"]);

const ALL: AdversarialCase[] = tier2([
  ...WHATSAPP_ADVERSARIAL,
  ...LEAD_MESSAGE_ADVERSARIAL,
  ...SOCIAL_ADVERSARIAL,
  ...PRODUCT_DESCRIPTION_ADVERSARIAL,
]);

const kindFor = (surface: string) =>
  (surface === "social" ? "facebook_post" : surface) as any;

/**
 * How the cases are grouped into calls, and what each grouping costs.
 *
 * I ESTIMATED Rs 4 FOR THIS RUN AND THE DRY RUN SAID Rs 30. The
 * difference is batching: I had assumed about ten calls, and grouping
 * by fixture AND surface - so that every batch looks like a real
 * message - gives 24 batches and 48 calls. Saying so before spending
 * rather than after.
 *
 * BATCH SIZE ONLY MATTERS FOR ONE SHAPE. B11 is the claim that survives
 * in a five-sentence message and is caught on its own, so its cases
 * have to be measured in message-shaped batches or they measure
 * nothing. B6 and B7 - a figure against the wrong authority, and claim
 * typing - do not care how many sentences sit beside them.
 *
 * So "split" puts the B11 cases in message-shaped batches and everything
 * else in one batch per fixture. That is the cheap design that gives up
 * nothing the expensive one provides.
 */
type Strategy = "message" | "fixture" | "split";

function batches(strategy: Strategy): { key: string; cases: AdversarialCase[] }[] {
  const by = new Map<string, AdversarialCase[]>();
  const put = (key: string, c: AdversarialCase) => by.set(key, [...(by.get(key) ?? []), c]);
  for (const c of ALL) {
    if (strategy === "message") put(`${c.fixture.key}/${c.surface}`, c);
    else if (strategy === "fixture") put(c.fixture.key, c);
    // split: recall cases keep their message shape, the rest do not need it.
    else if (c.shape === "B11") put(`${c.fixture.key}/${c.surface}`, c);
    else put(c.fixture.key, c);
  }
  return [...by.entries()].map(([key, cases]) => ({ key, cases }));
}

const STRATEGY: Strategy = (process.env.EVAL_BATCH as Strategy) || "split";

/** Every figure this business has on record, for the arithmetic half. */
function recordsFor(c: AdversarialCase) {
  return contextFromFacts("biz_eval", c.fixture.facts, { kind: kindFor(c.surface), topic: c.topic }).records;
}

type Verdict = "refused" | "figure_mismatch" | "needs_judge";

export function verdictFor(c: AdversarialCase, claims: { claimType: string; value?: { number: number } | null }[]): Verdict {
  if (claims.some((cl) => REFUSED.has(cl.claimType))) return "refused";
  const records = recordsFor(c);
  for (const cl of claims) {
    if (!cl.value || !NUMERIC.has(cl.claimType)) continue;
    const found = records.some((r) => figureInText(r, cl.value!.number) || Number(r.value) === cl.value!.number);
    if (!found) return "figure_mismatch";
  }
  return "needs_judge";
}

describe("tier 2 — the model-dependent adversarial cases", () => {
  it("runs every one of them in one batched pass", async () => {
    const list = batches(STRATEGY);
    const sentences = ALL.length;
    // Two calls per batch: the main extraction and the second net.
    const per = costOfClaudeResponseInr({ input_tokens: 3000, output_tokens: 600 }, CLAUDE_MODELS.fast);
    const estimate = Math.round(per * list.length * 2 * 1.2 * 100) / 100;
    const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { runs: [], totalInr: 0 };

    say();
    say("TIER 2 — THE CASES ONLY A MODEL CAN SETTLE");
    say("=".repeat(70));
    say(`cases                ${sentences}`);
    say(`batching             ${STRATEGY}   (EVAL_BATCH=message | fixture | split)`);
    say(`batches              ${list.length}`);
    for (const alt of ["message", "fixture", "split"] as Strategy[]) {
      const n = batches(alt).length;
      say(`   ${alt.padEnd(8)} ${String(n).padStart(2)} batches, ${String(n * 2).padStart(2)} calls, about Rs ${(per * n * 2 * 1.2).toFixed(2)}`);
    }
    say(`calls                ${list.length * 2}   (extraction + the second net, per batch)`);
    say(`ESTIMATE THIS RUN    Rs ${estimate.toFixed(2)}`);
    say(`already spent        Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(70));
    if (!GO) {
      say("DRY RUN — set EVAL_GO=1 to spend.");
      return;
    }
    expect(loadKey()).toBe(true);

    let spent = 0;
    const rows: { c: AdversarialCase; verdict: Verdict; claims: string[] }[] = [];
    const unreachable: string[] = [];

    for (const batch of list) {
      const texts = batch.cases.map((c) => c.sentence);
      const [main, net] = await Promise.all([
        extractClaims(texts, { logContext: null }),
        extractUnlicensable(texts, { logContext: null }),
      ]);
      spent += (main.ok ? main.costInr : 0) + (net.ok ? net.costInr : 0);
      if (!main.ok) {
        unreachable.push(batch.key);
        continue;
      }
      const claims = [...main.claims, ...(net.ok ? net.claims : [])];
      batch.cases.forEach((c, index) => {
        const mine = claims.filter((cl) => cl.sentenceIndex === index);
        rows.push({ c, verdict: verdictFor(c, mine), claims: mine.map((cl) => `${cl.claimType}:${cl.canonical}`) });
      });
    }

    // ── the report ────────────────────────────────────────────────────
    const caught = rows.filter((r) => r.c.direction === "must_be_removed" && r.verdict !== "needs_judge");
    const missed = rows.filter((r) => r.c.direction === "must_be_removed" && r.verdict === "needs_judge");
    const wronglyRefused = rows.filter((r) => r.c.direction === "must_survive" && r.verdict !== "needs_judge");
    const survived = rows.filter((r) => r.c.direction === "must_survive" && r.verdict === "needs_judge");

    say();
    say("=".repeat(70));
    say(`MUST BE REMOVED — settled here      ${caught.length}`);
    say(`MUST BE REMOVED — needs the judge   ${missed.length}   (undecided, NOT a pass)`);
    say(`MUST SURVIVE  — WRONGLY REFUSED     ${wronglyRefused.length}   (must be 0)`);
    say(`MUST SURVIVE  — reached the judge   ${survived.length}`);
    say(`batches unreachable                 ${unreachable.length}${unreachable.length ? `   <<< ${unreachable.join(", ")}` : ""}`);
    say(`ACTUAL COST                         Rs ${spent.toFixed(2)}`);
    say("=".repeat(70));

    if (wronglyRefused.length) {
      say();
      say("WRONGLY REFUSED — a true sentence the extraction layer would delete:");
      for (const r of wronglyRefused) {
        say(`  [${r.c.id} ${r.c.shape}] "${r.c.sentence}"`);
        say(`     ${r.verdict} — ${r.claims.join(" | ") || "(no claims)"}`);
        say(`     why it is true: ${r.c.because}`);
      }
    }
    if (missed.length) {
      say();
      say("NEEDS THE JUDGE — the extraction layer does not settle these:");
      for (const r of missed) say(`  [${r.c.id} ${r.c.shape}] "${r.c.sentence}" — ${r.claims.join(" | ") || "(no claims)"}`);
    }

    ledger.runs.push({ at: new Date().toISOString(), label: "tier-2 adversarial gate", inr: Math.round(spent * 100) / 100, calls: list.length * 2 });
    ledger.totalInr = Math.round((ledger.totalInr + spent) * 100) / 100;
    writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
    writeFileSync(join(OUT, `tier2-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`), `${LINES.join("\n")}\n`);
    say(`RUNNING TOTAL        Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
  }, 900_000);
});
