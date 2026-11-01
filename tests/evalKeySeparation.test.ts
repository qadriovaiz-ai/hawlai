// THE EVAL MUST NEVER SPEND THE PRODUCT'S BALANCE.
//
// WHAT THIS COST, 1 November 2026. Seven eval files each had an
// identical `loadKey()` that read ANTHROPIC_API_KEY out of .env.local
// and assigned it to process.env — the same variable lib/ai/claude.ts
// uses. So every paid eval run in S1 and S2, about Rs 905 in all and
// Rs 94.73 on 22 October alone, was spent from the balance production
// depends on. On 23 October the organisation's credit reached $0.00,
// and from 24 October to 1 November EVERY AI call in the live product
// failed with kind: "credits".
//
// Nine days of a dead product, found because the founder asked why a
// cost table was empty. I measured the cost of every run to the paisa
// and never once asked whose balance it came out of.
//
// Three properties are checked here, and the first is the one that
// matters: there is NO FALLBACK. A missing eval key stops the run.

import { describe, it, expect, afterEach } from "vitest";
import { loadEvalKey } from "../scripts/eval/harness";
import { code } from "./helpers/source";
import { readFileSync } from "node:fs";

const ORIGINAL_EVAL = process.env.EVAL_ANTHROPIC_API_KEY;
const ORIGINAL_PROD = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (ORIGINAL_EVAL === undefined) delete process.env.EVAL_ANTHROPIC_API_KEY;
  else process.env.EVAL_ANTHROPIC_API_KEY = ORIGINAL_EVAL;
  if (ORIGINAL_PROD === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_PROD;
});

/** What .env.local holds, so a test does not contradict the machine it runs on. */
function envFileHas(name: string): boolean {
  try {
    return readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .some((l) => l.startsWith(`${name}=`) && l.slice(l.indexOf("=") + 1).trim() !== "");
  } catch {
    return false;
  }
}

describe("1. THERE IS NO FALLBACK TO THE PRODUCTION KEY", () => {
  it("REFUSES WHEN THE EVAL KEY IS MISSING, even with a production key present", () => {
    // The fallback IS the fault. A missing eval key must stop the run,
    // not quietly bill the live product.
    if (envFileHas("EVAL_ANTHROPIC_API_KEY")) return; // the machine has one; the next test covers it
    delete process.env.EVAL_ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-production-key";
    const r = loadEvalKey();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/will NOT fall back/);
    expect(r.why).toMatch(/killed the live product/);
    // And it did not quietly keep the production key available either.
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-production-key");
  });

  it("AND REFUSES WHEN BOTH HOLD THE SAME KEY", () => {
    // Same key, same balance. The separation would be decorative.
    process.env.EVAL_ANTHROPIC_API_KEY = "sk-the-same-key";
    process.env.ANTHROPIC_API_KEY = "sk-the-same-key";
    const r = loadEvalKey();
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/same key/);
    expect(r.why).toMatch(/separate billing/);
  });

  it("accepts a genuinely separate key, and points the product code at it", () => {
    process.env.EVAL_ANTHROPIC_API_KEY = "sk-eval-only";
    process.env.ANTHROPIC_API_KEY = "sk-production-key";
    const r = loadEvalKey();
    expect(r.ok).toBe(true);
    // The eval runs the real product code, so the key has to reach
    // lib/ai/claude.ts — in THIS process, which is a vitest run of its
    // own and touches no deployment.
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-eval-only");
  });

  it("and an empty or whitespace value is not a key", () => {
    if (envFileHas("EVAL_ANTHROPIC_API_KEY")) return;
    for (const value of ["", "   "]) {
      process.env.EVAL_ANTHROPIC_API_KEY = value;
      process.env.ANTHROPIC_API_KEY = "sk-production-key";
      expect(loadEvalKey().ok, JSON.stringify(value)).toBe(false);
    }
  });
});

describe("2. ONE IMPLEMENTATION, because seven copies is how six keep spending", () => {
  it("NO EVAL FILE READS THE PRODUCTION KEY ANY MORE", () => {
    // Each of the seven had its own loadKey(). Fixing one would have
    // left six billing production.
    for (const file of [
      "scripts/eval/s1Exit.eval.ts",
      "scripts/eval/baseline.eval.ts",
      "scripts/eval/outputGate.eval.ts",
      "scripts/eval/newOutputGate.eval.ts",
      "scripts/eval/recallGate.eval.ts",
      "scripts/eval/tier2.eval.ts",
      "scripts/eval/gradedF.eval.ts",
    ]) {
      const src = code(file);
      expect(src, file).not.toMatch(/function loadKey/);
      expect(src, file).not.toMatch(/process\.env\.ANTHROPIC_API_KEY\s*=/);
      expect(src, file).toMatch(/loadEvalKey\(\)/);
    }
  });

  it("AND THE ONLY ASSIGNMENT LEFT IS THE HARNESS'S OWN", () => {
    const harness = code("scripts/eval/harness.ts");
    const assignments = harness.match(/process\.env\.ANTHROPIC_API_KEY\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
  });

  it("the eval key is documented, so the next person does not reach for the other one", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(/EVAL_ANTHROPIC_API_KEY=/);
    expect(example).toMatch(/Separate billing/i);
  });
});
