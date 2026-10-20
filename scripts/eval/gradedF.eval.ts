// THE THREE THE FOUNDER GRADED F, SENT TO THE EXTRACTOR AS THEMSELVES.
//
// Blind grading of the sixth S2a WhatsApp run, 20 October 2026:
//
//   dairy-05  a placeholder in the message            (notCopy.ts, code)
//   salon-04  "apke baal soft aur shiny ho jayenge"   a benefit claim
//   dairy-10  "Fresh desi ghee and paneer"            one property, two
//                                                     things, one record
//
// The first is code and has its own tests. The other two are the
// extractor failing to enumerate a claim, so they are measurable here
// for about ten paise rather than Rs 12 — the whole point of having a
// gate separate from an exit run.
//
// CONTROLS ARE HALF OF IT. Rules 6c and 6d are new removal pressure,
// and over-firing has been the recurring fault of this sequence: six
// times a check of mine deleted something true. So the sentences that
// must NOT become benefit claims are sent in the same run.
//
//   EVAL_GO=1 npx vitest run --config vitest.eval.config.mts scripts/eval/gradedF.eval.ts

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractClaims, UNLICENSABLE_TYPES, NEEDS_RECIPIENT_RECORD } from "@/lib/facts/extractClaims";
import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";
import { BUDGET_INR } from "./harness";

const GO = process.env.EVAL_GO === "1";
const LEDGER = join("scripts", "eval", "spend.json");

function say(s = ""): void {
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

/** Must be refused outright: nothing on record can license these. */
const REFUSED = new Set<string>([...UNLICENSABLE_TYPES, ...NEEDS_RECIPIENT_RECORD]);

/** The graded failures, verbatim. */
const MUST_CATCH = [
  { id: "salon-04", text: "₹3500 mein apke baal soft aur shiny ho jayenge 💇‍♀️", want: "a benefit claim — the change is to the reader" },
  { id: "dairy-10", text: "Fresh *desi ghee* and *paneer* now in Indore with flat ₹50 delivery anywhere in the city.", want: "two claims, one per product, so the ghee's has no evidence" },
];

/** Must NOT become a benefit claim. Over-firing is the other failure. */
const MUST_NOT = [
  { id: "control-1", text: "Order ho jayega 10 minute mein.", why: "the business acts, not the reader's own thing" },
  { id: "control-2", text: "Aapko 10% off milega FIRST10 se.", why: "an offer, not a promise about the reader" },
  { id: "control-3", text: "₹120 for 250g.", why: "a price and a pack size" },
  { id: "control-4", text: "Har ek hand-poured, small batches mein.", why: "a property of the thing (6a)" },
];

describe("the three graded F, and the controls for the rules that fix them", () => {
  it("enumerates the benefit and splits the list, without over-firing", async () => {
    const per = costOfClaudeResponseInr({ input_tokens: 2600, output_tokens: 400 }, CLAUDE_MODELS.fast);
    const estimate = Math.round(per * 2 * 1.3 * 100) / 100;
    const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { runs: [], totalInr: 0 };

    say();
    say("THE GRADED F — EXTRACTOR GATE");
    say("=".repeat(68));
    say(`must catch            ${MUST_CATCH.length}`);
    say(`controls              ${MUST_NOT.length}`);
    say(`ESTIMATE THIS RUN     Rs ${estimate.toFixed(2)}`);
    say(`already spent         Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
    say("=".repeat(68));

    if (!GO) {
      say("DRY RUN — set EVAL_GO=1 to spend.");
      return;
    }
    expect(loadKey()).toBe(true);

    let spent = 0;
    const report = async (label: string, sentences: string[]) => {
      const r = await extractClaims(sentences, { logContext: null });
      spent += r.costInr;
      expect(r.ok).toBe(true);
      if (!r.ok) return [];
      say("");
      say(`[${label}]`);
      for (const s of sentences) say(`  "${s}"`);
      for (const c of r.claims) {
        const refused = REFUSED.has(c.claimType) ? "  <- REFUSED OUTRIGHT" : "";
        const about = c.aboutProduct ? ` about: ${c.aboutProduct}` : "";
        const figure = c.value ? ` [${c.value.number}${c.value.unit ? ` ${c.value.unit}` : ""}]` : "";
        say(`  - ${c.claimType}${figure} "${c.canonical}"${about}${refused}`);
      }
      if (!r.claims.length) say("  (no claims reported)");
      return r.claims;
    };

    const caught = await report("MUST CATCH", MUST_CATCH.map((m) => m.text));
    const controls = await report("CONTROLS — none of these may be a benefit", MUST_NOT.map((m) => m.text));

    say("");
    say("=".repeat(68));
    const benefits = caught.filter((c) => c.claimType === "benefit");
    const aboutGhee = caught.filter((c) => /ghee/i.test(c.aboutProduct ?? ""));
    const aboutPaneer = caught.filter((c) => /paneer/i.test(c.aboutProduct ?? ""));
    say(`salon-04  benefit claims reported        ${benefits.length}   (needs >= 1)`);
    say(`dairy-10  claims naming the ghee          ${aboutGhee.length}`);
    say(`dairy-10  claims naming the paneer        ${aboutPaneer.length}   (both needed: the split is the fix)`);
    const overFired = controls.filter((c) => c.claimType === "benefit");
    say(`controls  wrongly typed benefit           ${overFired.length}   (must be 0)`);
    for (const c of overFired) say(`           OVER-FIRED: "${c.canonical}"`);
    say(`ACTUAL COST           Rs ${spent.toFixed(2)}`);
    say("=".repeat(68));

    ledger.runs.push({ at: new Date().toISOString(), label: "graded-f extractor gate", inr: Math.round(spent * 100) / 100, calls: 2 });
    ledger.totalInr = Math.round((ledger.totalInr + spent) * 100) / 100;
    writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
    say(`RUNNING TOTAL         Rs ${ledger.totalInr.toFixed(2)} of Rs ${BUDGET_INR.toFixed(2)}`);
  }, 180_000);
});
