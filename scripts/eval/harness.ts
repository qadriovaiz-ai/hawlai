// THE EVAL HARNESS.
//
// PLAN-FACT-BOUND-GENERATION §8. Its job is to make one number
// answerable: is the new verifier better than what we have? That means
// the CURRENT system has to be measured first, on the same cases, by
// the same graders — a baseline, before anything is built to beat.
//
// WHAT THIS FILE DOES AND DOES NOT DO.
//
//   does      drive the real surfaces, tally the real cost, split the
//             output into sentences, and write a sheet a human grades
//   does not  decide whether a sentence is true. That is the graders'
//             job and it cannot be automated — if it could, the
//             verifier would already exist.
//
// MONEY. Every paid call is counted from the API's own usage numbers
// through costOfClaudeResponseInr, the same function the product bills
// with. The estimate is printed BEFORE a run; the actual and the
// running total after. A run whose estimate would cross the ceiling
// does not start.

import { costOfClaudeResponseInr } from "@/lib/usage/pricing";
import { CLAUDE_MODELS } from "@/lib/models";
import { pieces } from "@/lib/claims/claimCheck";
import { contextFromFacts, type TaskKind } from "@/lib/facts/getContext";
import { classifySentence } from "@/lib/facts/sentenceKind";
import { copySentences, isLabelField } from "@/lib/content/copySentences";
import type { EvalCase } from "./cases";

/**
 * The ceiling the founder set, in rupees, across all paid runs.
 *
 * Rs 500 to begin with, spent by 2026-10-20: S1 took eleven exit runs
 * (Rs 396.41) and S2a eight (Rs 90.48). A further Rs 60 was approved
 * the same day, against docs/PLAN-S2B-BUDGET.md, for the S2a/S2b phase,
 * raised again to Rs 80 for that phase on 2026-10-20, on the condition
 * that gates come first — the
 * extractor gate costs about Rs 2 and finds more than a Rs 12 run.
 *
 * RAISED HERE AND NOWHERE ELSE, so the number a run prints is the
 * number that was approved. A run whose estimate crosses it does not
 * start.
 */
export const BUDGET_INR = 964;

/**
 * WHAT A CASE HAS ACTUALLY COST, MEASURED — not modelled.
 *
 * FOUND ON 2026-10-22, AFTER OVERSPENDING AN APPROVAL BY Rs 16.73.
 * Four runs were approved at about Rs 78 on the strength of this
 * function, and cost Rs 94.73. The estimate was not slightly out; it
 * described a pipeline that no longer exists.
 *
 * The old version modelled exactly four calls an email - select,
 * write, extract, judge - at 1500/1100/900/700 input tokens, plus 20%.
 * Every one of those numbers has since been overtaken by this
 * session's own work:
 *
 *   the second net        extractUnlicensable is a FIFTH call, added
 *                         beside the extractor and never added here
 *   the second pass       runFactChecks runs again after the retries
 *                         whenever the copy changed
 *   the retry itself      a removal means writing and re-verifying
 *   bigger prompts        the records block, the two evidence headings
 *                         and rubric rules 8-10 took input from ~1100
 *                         to ~2600 tokens a call
 *
 * Measured calls per case on 2026-10-22: 8.7, 7.8, 7.0, 5.0 against
 * the four this modelled.
 *
 * SO IT IS NO LONGER MODELLED AT ALL. A hand-written call list is a
 * second description of the pipeline, and it drifts the moment the
 * pipeline changes - the same fault as the output gate keeping its own
 * arithmetic (B18). These are the rupees four real runs cost, divided
 * by their cases, and the estimate is the WORST of them plus headroom.
 * When the pipeline grows another call, the next run's actual cost
 * lands here and the estimate follows reality instead of leading it.
 */
export const MEASURED_PER_CASE_INR: { on: string; surface: string; inr: number; cases: number }[] = [
  { on: "2026-10-22", surface: "whatsapp", inr: 19.44, cases: 6 },
  { on: "2026-10-22", surface: "facebook_post 1of2", inr: 29.65, cases: 6 },
  { on: "2026-10-22", surface: "facebook_post 2of2", inr: 24.89, cases: 6 },
  { on: "2026-10-22", surface: "product_description", inr: 20.75, cases: 6 },
];

/** The dearest case anyone has actually paid for, in rupees. */
export const WORST_MEASURED_PER_CASE_INR = Math.max(...MEASURED_PER_CASE_INR.map((m) => m.inr / m.cases));

export function estimateInr(caseCount: number): number {
  // 20% headroom on the worst measured case. An estimate that comes in
  // UNDER is the one that matters: it is the number an approval is
  // asked for.
  return Math.round(WORST_MEASURED_PER_CASE_INR * caseCount * 1.2 * 100) / 100;
}

/** A running tally of what a run actually spent, read off the API's own usage. */
export class Spend {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  inr = 0;

  record(usage: any, model: string): void {
    this.calls += 1;
    this.inputTokens += Number(usage?.input_tokens ?? 0);
    this.outputTokens += Number(usage?.output_tokens ?? 0);
    this.inr += costOfClaudeResponseInr(usage, model);
  }

  get rounded(): number {
    return Math.round(this.inr * 100) / 100;
  }
}

/**
 * Wraps global fetch so every Anthropic response is counted, and the
 * call still goes through untouched.
 *
 * A PASS-THROUGH, not an interceptor: it must never change what the
 * product sends or receives, or the baseline measures the harness
 * instead of the product. The response body is read from a clone so
 * the caller's own `json()` still works.
 */
export function meterFetch(spend: Spend, model: string = CLAUDE_MODELS.standard): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const res = await original(url, init);
    try {
      if (String(url).includes("anthropic.com")) {
        const copy = res.clone();
        const body: any = await copy.json();
        if (body?.usage) spend.record(body.usage, body?.model ?? model);
      }
    } catch {
      // A metering failure must never fail the call being metered. The
      // run reports fewer calls than it made, which the call count in
      // the summary makes visible.
    }
    return res;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Each eval surface, as the context's task kind. */
const TASK_KIND: Record<string, TaskKind> = {
  email: "email",
  facebook_post: "social_post",
  whatsapp: "whatsapp",
  lead_message: "lead_message",
};

export type GradedSentence = {
  caseId: string;
  fixture: string;
  trade: string;
  scenario: string;
  surface: string;
  field: string;
  sentence: string;
  /** What the classifier thinks: only `factual` needs evidence. */
  kind: string;
  /** The records that exist for this tenant, as the grader's reference. */
  availableFacts: string[];
  /** What the guard already removed, so a grader is not asked about it. */
  removedByGuard: string[];
  watch: string;
};

/**
 * Split one case's output into the rows a grader scores.
 *
 * ONE ROW PER SENTENCE, with the tenant's records beside it — the
 * founder's instruction: "har sentence record ke saath dikhao". A
 * grader who has to go looking for the facts will guess instead.
 */
export function toGradedRows(
  c: EvalCase,
  output: Record<string, unknown>,
  removedByGuard: string[]
): GradedSentence[] {
  // THE RECORDS BOX IS BUILT FROM THE SAME FUNCTION THE DOOR USES.
  //
  // It used to assemble its own list — the owner's rows, the catalogue,
  // the shipping line — and so showed the grader a DIFFERENT record set
  // from the one the pipeline actually had. The founder caught it on 19
  // October: `business.city` had been a record for two runs, "Indore"
  // appeared six times in the output, and the sheet had no city field
  // at all, so he could not verify the claim and said so. Offers and
  // counts were missing too.
  //
  // That is the same fault as the fixture's `ownerFacts: []` in S1-1,
  // running the other way: then the graders saw records the pipeline
  // lacked, now the pipeline had records the graders could not see.
  // Either way the sheet is not evidence about the pipeline.
  //
  // contextFromFacts is the door's own reader, so there is one source
  // and a grader can check any claim against what was really there.
  const task = { kind: TASK_KIND[c.surface] ?? ("other" as const), topic: c.topic };
  const ctx = c.fixture.facts ? contextFromFacts(c.fixture.key, c.fixture.facts, task) : null;
  const records = ctx
    ? Array.from(
        new Set(
          ctx.records.map((r) => {
            // A `statement.*` key is an internal handle, not something
            // to show a person.
            if (r.key.startsWith("statement.")) return `the owner wrote: "${String(r.value)}"`;
            const value = r.value === null ? "NO ANSWER ON RECORD" : String(r.value);
            return `${r.key} = ${value}${r.unit ? ` ${r.unit}` : ""}`;
          })
        )
      )
    : [];
  // WHAT THE SLICE LEFT OUT, named. getContext narrows to the product
  // the topic mentions, so a grader judging a price needs to know which
  // other products existed and were withheld — otherwise a wrong-price
  // claim looks unjudgeable.
  const withheld =
    ctx && ctx.slice.narrowedByTopic
      ? (c.fixture.facts?.products ?? [])
          .map((p: any) => String(p?.name ?? ""))
          .filter((name) => name && !ctx.slice.products.includes(name))
          .map((name) => `(not given to the writer for this piece: ${name})`)
      : [];
  const available = [...records, ...withheld];

  const rows: GradedSentence[] = [];
  // ENUMERATED BY THE DOOR'S OWN FUNCTION, not by a second copy here.
  //
  // FOUND 2026-10-22, auditing why dairy-06's three tags arrived as one
  // row. This loop used `pieces()` on every field, while copySentences
  // splits a hashtags field with `splitTags` — so the door checked
  // "#ShreeDairy", "#BilonaGhee" and "#FSSAICertified" as three
  // sentences and the sheet showed the founder one. A grader cannot
  // rule on a tag that is not a row, and I could not tell from the
  // sheet which of the three had been checked.
  //
  // The same B18 shape as the records box before 19 October and the
  // output gate's own arithmetic before 20 October: wherever the
  // instrument re-describes the pipeline, it eventually describes a
  // different one.
  for (const s of copySentences(output ?? {})) {
    {
      {
        const field = s.field;
        rows.push({
          caseId: c.id,
          fixture: c.fixture.label,
          trade: c.fixture.trade,
          scenario: c.scenario,
          surface: c.surface,
          field,
          sentence: s.text,
          // CLASSIFIED ON THE OPENED-OUT FORM, so a hashtag is not
          // presented to a human grader as "not a claim".
          //
          // 26 of the 29 hashtag rows in the social sheet of
          // 2026-10-20 were labelled `feeling`, because
          // classifySentence("#SoyWaxOnly") sees one unreadable token.
          // The grader was therefore never asked to rule on
          // "#HandPouredInShahjahanpur" or "#SoyWaxOnly" - and that is
          // why a social sheet could come back clean with claims
          // sitting in its tags.
          // A HASHTAG ROW IS ALWAYS PUT TO THE GRADER AS A CLAIM.
          //
          // Opening the tag into words is necessary and not sufficient:
          // "Best In Indore", "Hand Poured In Shahjahanpur" and "Free
          // Shipping" classify factual once expanded, but "Soy Wax
          // Only" and "Pure Soy" still do not - the classifier has no
          // cue for a bare material or a bare booster.
          //
          // The field name is information we already have, so it
          // decides. A tag that turns out to be harmless costs the
          // grader one glance; a tag that hides a claim costs a false
          // publication, and 26 of 29 hashtag rows were being labelled
          // "feeling" before this.
          // A LABEL ROW IS ALWAYS PUT TO THE GRADER AS A CLAIM, and
          // that now covers titles. salon-11's title "Keratin
          // Treatment — Ek Session, Smooth Finish" was labelled
          // "feeling", so the founder was never asked to rule on
          // "Smooth Finish" — the same miss as the 26 hashtag rows.
          kind: isLabelField(field) ? "factual" : classifySentence(s.analysed),
          availableFacts: available,
          removedByGuard,
          watch: c.watch,
        });
      }
    }
  }
  return rows;
}

/** Every string inside a generated output, however it is nested. */
function flatten(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith("_"))
      .flatMap(([, v]) => flatten(v));
  }
  return [];
}

/**
 * The sheet two graders fill in, independently.
 *
 * EVERY ROW IS SCOREABLE, and that is a correction to this file. The
 * first version pre-filled a dash against every row the classifier did
 * not call `factual` — 224 of 329 in the baseline run — on the word of a
 * classifier that reads romanised Hindi as sentiment. Both of the real
 * failures that run produced were inside the skipped set. A grader can
 * still answer "not a claim"; what they can no longer have is that
 * answer filled in for them by a guess.
 *
 * TWO FILES, IDENTICAL, so neither scorer sees the other's answer —
 * the founder asked for a second blind scorer, and a shared file is not
 * blind. Agreement between them is the number that says whether the
 * labelling itself is reliable; without it, a single grader's bad day
 * looks like a model regression.
 */
export function gradingSheet(rows: GradedSentence[], grader: string): string {
  const out: string[] = [
    `# Grading sheet — ${grader}`,
    "",
    "Score **every** sentence.",
    "",
    "- **T** — true, and the records support it",
    "- **F** — false, or the records do not support it",
    "- **U** — cannot tell from the records (this is a real answer, not a cop-out)",
    "- **—** — not a claim at all: a feeling, a greeting, a question, a call to action",
    "",
    "**Do not trust the `kind` column.** It is this codebase's own classifier",
    "guessing, and it is English-biased. In the baseline run of 13 October 2026",
    "it called \"yeh slower aur cleaner jalte hain regular paraffin wax ke",
    "mukable\" a *feeling*. That is a comparison with a competitor's product —",
    "the worst sentence in the whole run — and the first version of this sheet",
    "told you to leave it blank. Read the sentence, not the label.",
    "",
    "**SCOPE RULE (founder, 16 October 2026).** A sentence that makes a",
    "claim about ONE named product or service needs a record about THAT",
    "product or service. A general fact about how the business works does",
    "not support it, however true that general fact is — so a sentence in",
    "the shape *general business fact → specific product claim* is **U or",
    "F, never T**. \"We do not use ammonia-based products\" is the",
    "business's practice; \"this treatment contains no ammonia\" is a claim",
    "about one item, and only a record about that item supports it.",
    "",
    "Do not look at the other grader's sheet until yours is finished.",
    "",
  ];
  let lastCase = "";
  for (const r of rows) {
    if (r.caseId !== lastCase) {
      lastCase = r.caseId;
      out.push("", `---`, "", `## ${r.caseId} — ${r.fixture} (${r.trade}) · ${r.surface} · ${r.scenario}`, "");
      out.push(`**Watch for:** ${r.watch}`, "");
      out.push("**The records this business actually has:**", "");
      for (const f of r.availableFacts) out.push(`- ${f}`);
      if (!r.availableFacts.length) out.push("- _none — the records could not be read_");
      if (r.removedByGuard.length) {
        out.push("", "**Already removed by the guard (not yours to score):**", "");
        for (const x of r.removedByGuard) out.push(`- ${x}`);
      }
      out.push("", "| verdict | kind | field | sentence |", "|---|---|---|---|");
    }
    out.push(`|   | ${r.kind} | ${r.field} | ${r.sentence.replace(/\|/g, "\\|")} |`);
  }
  return out.join("\n");
}
