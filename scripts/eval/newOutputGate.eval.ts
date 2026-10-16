// FIX 4 — THE GATE, ON THE NEW PIPELINE'S OWN OUTPUT.
//
// docs/PLAN-CORE-ARCHITECTURE.md §4c. The first recall gate measured the
// extractor against the 135 sentences of the 13 October baseline — copy
// written by the OLD prompt. The Select -> Write pipeline produces a
// different SHAPE of sentence: tight, built around an approved fact,
// with a flourish bolted on. The gate never saw that shape, and 13
// unsupported claims walked through it.
//
// This runs the extractor over the S1 exit run's own 123 sentences,
// saved, so NO NEW COPY IS GENERATED and the only cost is the
// extractor's calls.
//
// WHAT COUNTS AS CAUGHT, and the distinction matters. For most of the
// thirteen it is not enough that the sentence produces A claim: it
// already produced one, for the TRUE half. The question is whether the
// RIDER is now enumerated too.
//
//   refused   the sentence produces a claim of a type no record can
//             license (benefit, capability, safety, comparison) or a
//             customer_state claim. The verifier removes it with no
//             judge call. Fully mechanical.
//   enumerated  the rider appears as its own claim but of a licensable
//             type — "the ghee is pure" as `material`. It then goes to
//             the judge, which refused exactly this in the baseline
//             ("Fact says 'soy wax only' but not 'pure'").
//   missed    the sentence's claims do not mention the rider at all.
//
// Every claim for every one of the thirteen is printed, so the founder
// can disagree with my reading rather than take it.
//
//   npx vitest run --config vitest.eval.config.mts scripts/eval/newOutputGate.eval.ts
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/newOutputGate.eval.ts

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_INR } from "./harness";
import { MISSED_BY_GATE } from "./missedByGate";
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

/** Types the verifier refuses with no judge call. */
const REFUSED_OUTRIGHT = new Set(["benefit", "capability", "safety", "comparison", "customer_state"]);

/** The newest S1 exit run's sentences, in order, grouped by case. */
function s1Sentences(): { caseId: string; sentences: string[] }[] {
  const file = readdirSync(OUT)
    .filter((f) => f.startsWith("s1-exit") && f.endsWith(".json"))
    .sort()
    .pop();
  if (!file) return [];
  const parsed = JSON.parse(readFileSync(join(OUT, file), "utf8")) as { rows: { caseId: string; sentence: string }[] };
  const byCase = new Map<string, string[]>();
  for (const row of parsed.rows) {
    const list = byCase.get(row.caseId) ?? [];
    list.push(row.sentence);
    byCase.set(row.caseId, list);
  }
  return [...byCase.entries()].map(([caseId, sentences]) => ({ caseId, sentences }));
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

describe("the gate, on the new pipeline's output", () => {
  it("checks whether the thirteen are now enumerated", async () => {
    const cases = s1Sentences();
    const total = cases.reduce((n, c) => n + c.sentences.length, 0);
    const per = costOfClaudeResponseInr({ input_tokens: 1300, output_tokens: 900 }, CLAUDE_MODELS.fast);
    const estimate = Math.round(per * cases.length * 1.2 * 100) / 100;
    const ledger = readLedger();
    const spentSoFar = Math.round(ledger.totalInr * 100) / 100;

    say("");
    say("FIX 4 — THE GATE ON THE NEW PIPELINE'S OUTPUT");
    say("=".repeat(68));
    say(`cases                 ${cases.length}`);
    say(`sentences             ${total}   (from the saved S1 run — no new copy is generated)`);
    say(`known missed          ${MISSED_BY_GATE.length}   (the reviewer's list)`);
    say(`model                 ${CLAUDE_MODELS.fast}`);
    say(`ESTIMATE THIS RUN     Rs ${estimate.toFixed(2)}   (per-run cap Rs ${PER_RUN_CAP_INR.toFixed(2)})`);
    say(`already spent         Rs ${spentSoFar.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(68));

    // The saved run must have parsed, or every number below is about
    // nothing.
    expect(cases.length).toBe(9);
    expect(total).toBeGreaterThan(100);

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

    const { extractClaims } = await import("@/lib/facts/extractClaims");
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let spent = 0;
    let calls = 0;
    // Every claim the extractor produced, per sentence text.
    const claimsFor = new Map<string, { type: string; subject: string; canonical: string }[]>();

    for (const [i, c] of cases.entries()) {
      if (i > 0) await pause(8_000);
      process.stdout.write(`  ${c.caseId} … `);
      const r = await extractClaims(c.sentences);
      calls += 1;
      if (!r.ok) {
        say(`CALL FAILED — ${r.reason}`);
        continue;
      }
      spent += r.costInr;
      for (const claim of r.claims) {
        const text = c.sentences[claim.sentenceIndex];
        if (text === undefined) continue;
        const key = `${c.caseId}::${norm(text)}`;
        const list = claimsFor.get(key) ?? [];
        list.push({ type: claim.claimType, subject: claim.subject, canonical: claim.canonical });
        claimsFor.set(key, list);
      }
      say(`${r.claims.length} claim(s)`);
    }

    const rounded = Math.round(spent * 100) / 100;
    const verdicts: { caseId: string; text: string; klass: string; outcome: string; claims: string[] }[] = [];

    for (const m of MISSED_BY_GATE) {
      const found = claimsFor.get(`${m.caseId}::${norm(m.text)}`) ?? [];
      const refused = found.some((f) => REFUSED_OUTRIGHT.has(f.type));
      verdicts.push({
        caseId: m.caseId,
        text: m.text,
        klass: m.klass,
        outcome: refused ? "REFUSED OUTRIGHT" : found.length ? "enumerated — goes to the judge" : "MISSED",
        claims: found.map((f) => `${f.type}/${f.subject}: ${f.canonical}`),
      });
    }

    const missed = verdicts.filter((v) => v.outcome === "MISSED");
    const refusedCount = verdicts.filter((v) => v.outcome === "REFUSED OUTRIGHT").length;

    say("");
    say("=".repeat(68));
    say(`calls made            ${calls}`);
    say(`ACTUAL COST THIS RUN  Rs ${rounded.toFixed(2)}   (estimated Rs ${estimate.toFixed(2)})`);
    say(`RUNNING TOTAL         Rs ${(spentSoFar + rounded).toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("");
    say(`OF THE ${MISSED_BY_GATE.length} THE REVIEWER FOUND:`);
    say(`  refused outright    ${refusedCount}   (an unlicensable claim — removed with no judge call)`);
    say(`  enumerated          ${verdicts.length - refusedCount - missed.length}   (a licensable claim — the judge decides)`);
    say(`  STILL MISSED        ${missed.length}`);
    say("=".repeat(68));

    for (const v of verdicts) {
      say("");
      say(`[${v.caseId}] ${v.klass} — ${v.outcome}`);
      say(`   ${v.text.slice(0, 110)}`);
      if (!v.claims.length) say("   (no claims at all)");
      for (const c of v.claims) say(`     -> ${c}`);
    }

    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(OUT, `new-output-gate-${stamp}.json`), JSON.stringify({ verdicts, calls, inr: rounded }, null, 2), "utf8");
    writeFileSync(join(OUT, `new-output-gate-${stamp}.txt`), LINES.join("\n"), "utf8");
    ledger.runs.push({ at: new Date().toISOString(), label: `new-output-gate-${stamp}`, inr: rounded, calls });
    ledger.totalInr = Math.round((spentSoFar + rounded) * 100) / 100;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2), "utf8");

    expect(calls).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
