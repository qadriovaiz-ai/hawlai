// C2 STEP 1 — WHICH FACTS ARE WE GOING TO STATE?
//
// docs/PLAN-CORE-ARCHITECTURE.md §2.1. The model chooses from the
// records it is shown and cites them by id. It does not write a word of
// copy here, and it does not decide whether a claim is allowed — that
// is step 2, in code.
//
// WHY A SEPARATE STEP AT ALL. Today the model is handed the facts and
// asked for finished copy, so "which claims to make" and "how to say
// them" happen in one breath and neither is inspectable. Splitting them
// makes the first one a list a human can read, and a list code can
// refuse.
//
// WHAT IT MUST DO WITH A CONFLICT. The owner asking for something the
// records contradict is not an error and not a claim: dairy-04 in the
// baseline asked for "our 20% diwali discount" when the real code gives
// 10%. That comes back as a conflict naming both numbers, so the owner
// is told rather than obeyed or silently corrected.
//
// AND IT MUST STILL SELECT WHAT IS TRUE. The S2a WhatsApp run of
// 2026-10-19 showed what happens otherwise: dairy-10 asked for "free
// home delivery", the conflict was reported exactly right — shipping is
// flat Rs 50 — and no shipping figure was selected at all, because rule
// 3 read as "stay out of it". The writer then wrote the true sentence
// "Delivery costs Rs 50" on its own initiative, and step 4 removed it
// for having no approved claim behind it. A recorded fact was deleted
// from the message by the rule meant to protect the owner's records.
//
// NUMBERS ARE NEVER WRITTEN HERE. A claim carrying a figure must carry
// the figure FROM the cited record; step 2 checks it against that record
// and rejects a mismatch. The model's job is to point, not to compute.

import { callClaude, type AiFailureKind } from "@/lib/ai/claude";
import { CLAUDE_MODELS } from "@/lib/models";
import type { FactRecord } from "@/lib/facts/factRecord";
import { CLAIM_TYPES, type ClaimType } from "@/lib/facts/extractClaims";
import type { Context } from "@/lib/facts/getContext";

export type SelectedClaim = {
  /** Local to this draft, so step 3 and step 4 can refer to it. */
  id: string;
  claimType: ClaimType;
  /** FactRecord ids from the context. Checked for existence, tenancy and licence in step 2. */
  factIds: string[];
  /** Why this claim belongs in this piece — shown to the owner, never to the customer. */
  intent: string;
  /**
   * The product or service this claim is about, or null for the
   * business generally.
   *
   * A FIELD RATHER THAN A PROMPT LINE, because the scope rule has to be
   * checkable in code. It was prose in three prompts and nowhere in
   * code, so it held wherever a model applied it and failed wherever one
   * did not — see src/lib/facts/scope.ts.
   */
  aboutProduct?: string | null;
  /**
   * Copied from the cited record when the claim carries a figure.
   *
   * BOOLEAN IS A REAL FACT VALUE, not a stray. material.paraffin is
   * `false` and that is the fact: this business does not use it. The
   * first version of this type allowed only number and string, so a
   * boolean was stringified to "false" on the way in — and on
   * 2026-10-16 the judge was shown "no ammonia-based products (false)"
   * and read the parenthetical as marking the claim untrue. It then
   * refused a TRUE sentence on the ground that the record contradicted
   * it. A type that cannot say what a fact is will be made to lie about
   * it somewhere else.
   */
  value?: number | string | boolean | null;
  unit?: string | null;
};

export type Conflict = {
  /** What the owner asked for, in their words. */
  askedFor: string;
  /** What the records say instead. */
  recordSays: string;
  factIds: string[];
};

export type Selection = {
  claims: SelectedClaim[];
  conflicts: Conflict[];
  /** The owner asked about something no record covers. One question, never a guess. */
  unknowns: string[];
};

const TOOL = {
  name: "select_claims",
  description:
    "Choose the claims this piece of copy will make, citing the records that support each one. Do not write the copy. Do not invent a figure.",
  input_schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "A short local id, e.g. c1, c2." },
            claimType: { type: "string", enum: CLAIM_TYPES },
            factIds: {
              type: "array",
              items: { type: "string" },
              description: "Ids of the records that support this claim, copied exactly from the list given to you.",
            },
            intent: { type: "string", description: "One short line on why this claim belongs in this piece. For the owner." },
            aboutProduct: {
              type: "string",
              description:
                "The exact name of the ONE product or service this claim is about, copied from the records — ONLY when the claim is about that particular item. OMIT it when the claim is about the range as a whole or about the business generally. A claim about what the business makes in general is not a claim about one item.",
            },
            value: { description: "The figure, copied EXACTLY from the cited record. Omit when the claim carries no figure." },
            unit: { type: "string", description: "The unit, copied from the cited record." },
          },
          required: ["id", "claimType", "factIds", "intent"],
        },
      },
      conflicts: {
        type: "array",
        description: "Anything the request asks for that the records contradict. Not a claim; the owner decides.",
        items: {
          type: "object",
          properties: {
            askedFor: { type: "string" },
            recordSays: { type: "string" },
            factIds: { type: "array", items: { type: "string" } },
          },
          required: ["askedFor", "recordSays"],
        },
      },
      unknowns: {
        type: "array",
        description: "Anything the request asks for that no record covers at all. One question for the owner, never a guess.",
        items: { type: "string" },
      },
    },
    required: ["claims", "conflicts", "unknowns"],
  },
} as const;

const SYSTEM = `You choose which facts a piece of marketing copy will state. You do not write the copy.

You are given the records a business actually has, each with an id. Every factual sentence that gets written must trace back to one of them.

RULES
1. Cite by id, exactly as given. A claim with no citable record is not a claim you may select — put it in unknowns instead.
2. NEVER write a figure of your own. If a claim carries a number, copy it from the cited record, with the record's unit. Do not convert, round, add, average or infer.
3. If the request asks for something the records CONTRADICT, report it in conflicts with both sides named, and do not select the thing they asked for. BUT DO SELECT WHAT THE RECORD ACTUALLY SAYS about that topic, so the copy can state the truth instead of saying nothing. The fault to avoid is a QUIET substitution — a number swapped without telling anyone. Reporting the conflict and selecting the real figure together is not quiet: the owner is told, and the reader is told something true. Selecting neither leaves a recorded fact unsayable, and the writer will then state it anyway with nothing behind it.
4. If the request asks for something no record covers, put it in unknowns. One clear thing the owner could write down, phrased as a fact to record rather than a question about their business.
5. Select FEWER claims rather than weaker ones. A short piece built on three solid records is the goal; padding it with a fourth that nothing supports is the failure this whole step exists to prevent.
6. Choose nothing about a competitor, nothing about what the product will do to the reader's body, mood or health, nothing about safety, and nothing about what the business will do automatically for them. No record can support those, so selecting one only wastes the attempt.
7. A record whose value is null means WE LOOKED AND THERE IS NO ANSWER. That is not permission to assume the opposite; it is a thing to leave out, or to raise as an unknown.
8. Say nothing about the reader's own orders, bookings or account status. You have no record of who is reading this.
9. SCOPE: A CLAIM ABOUT ONE SPECIFICALLY NAMED PRODUCT OR SERVICE NEEDS A RECORD ABOUT THAT PRODUCT OR SERVICE. A claim about the range as a whole, or about how the business works, is NOT such a claim — a business-level record is the right evidence for it, and you should select it. A record whose key begins with "product." is about that one item. Records about materials, processes, policies and the business's own statements are about HOW THE BUSINESS WORKS, and they do not support a claim about one item's composition or performance — however true they are. If the request wants a claim about one item and only a business-level record exists, that is an UNKNOWN: ask the owner to record it against the item. Do not stretch the general fact to cover the particular one.`;

/** The records, in the shape the model cites from. Only what it needs to choose. */
export function recordsForPrompt(records: FactRecord[]): string {
  return records
    .map((r) => {
      const value = r.value === null ? "NO ANSWER ON RECORD" : String(r.value);
      const unit = r.unit ? ` ${r.unit}` : "";
      return `${r.id} | ${r.key} = ${value}${unit} | from ${r.source} (${r.confidence}) | may support: ${r.licenses.join(", ")} | recorded as: "${r.recordedText}"`;
    })
    .join("\n");
}

export type SelectResult =
  | { ok: true; selection: Selection; costInr: number }
  /**
   * `kind` TRAVELS OUT, and 2026-10-20 is why it has to.
   *
   * The API credit balance ran out mid-run. claude.ts classified it
   * correctly as `credits` and has the right words for it - "AI
   * features are temporarily unavailable on our side, the Hawlai team
   * has been alerted" - and the door then threw the kind away and
   * substituted "overloaded", so the owner was told "The AI service is
   * busy, try again in a minute".
   *
   * An owner told to try again in a minute tries again in a minute, and
   * keeps trying, and it never works. classifyClaudeError's own header
   * says the reason was thrown away 48 times before it existed; this
   * was the 49th place.
   */
  | { ok: false; reason: string; kind?: AiFailureKind; costInr: number };

/**
 * Choose the claims, or fail closed.
 *
 * A FAILURE IS NOT AN EMPTY SELECTION. Both would produce a piece of
 * copy with no factual sentences in it, and they mean opposite things:
 * "this business has nothing to say" versus "nobody chose". F-01 was
 * this confusion one layer down.
 */
export async function selectClaims(
  ctx: Context,
  opts: { logContext?: { supabase: any; dealershipId: string } | null; model?: string } = {}
): Promise<SelectResult> {
  if (!ctx.facts || !ctx.records.length) {
    return { ok: false, reason: "no records could be read for this business", costInr: 0 };
  }

  const unknownsNote = ctx.unknowns.length ? `\n\nAlready known to be missing (do not guess at these):\n- ${ctx.unknowns.join("\n- ")}` : "";

  const result = await callClaude(
    {
      // Sonnet: this step reads the whole record set and chooses. A
      // cheap miss here DELETES a true claim, which is the expensive
      // error — 0 of 72 true sentences are wrongly removed today and
      // that is the number this work has to protect.
      model: opts.model ?? CLAUDE_MODELS.standard,
      // Choosing is not composing.
      temperature: 0,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `The business wants: ${ctx.task.topic}\nThe piece is a ${ctx.task.kind.replace(/_/g, " ")}.\n\nRecords:\n${recordsForPrompt(ctx.records)}${unknownsNote}`,
        },
      ],
    },
    { operation: "claim_selection", logContext: opts.logContext ?? null, attempts: 2, timeoutMs: 60_000 }
  );

  if (!result.ok) return { ok: false, reason: result.failure.message, kind: result.failure.kind, costInr: 0 };

  const block = (result.data?.content ?? []).find((c: any) => c?.type === "tool_use" && c?.name === TOOL.name);
  if (!block) return { ok: false, reason: "the model did not use the tool", costInr: result.costInr };
  if (!Array.isArray(block.input?.claims)) return { ok: false, reason: "the tool call carried no claims array", costInr: result.costInr };

  return {
    ok: true,
    costInr: result.costInr,
    selection: {
      claims: block.input.claims.map((c: unknown, i: number) => normalise(c, i)).filter((c: SelectedClaim | null): c is SelectedClaim => c !== null),
      conflicts: (Array.isArray(block.input.conflicts) ? block.input.conflicts : [])
        .map((c: any) => ({
          askedFor: String(c?.askedFor ?? "").trim(),
          recordSays: String(c?.recordSays ?? "").trim(),
          factIds: Array.isArray(c?.factIds) ? c.factIds.map(String) : [],
        }))
        .filter((c: Conflict) => c.askedFor && c.recordSays),
      unknowns: (Array.isArray(block.input.unknowns) ? block.input.unknowns : []).map((u: unknown) => String(u ?? "").trim()).filter(Boolean),
    },
  };
}

/** One selected claim, or null. An unknown claimType is DROPPED, never coerced. */
function normalise(c: any, index: number): SelectedClaim | null {
  const claimType = CLAIM_TYPES.find((t) => t === c?.claimType);
  if (!claimType) return null;
  const factIds = Array.isArray(c?.factIds) ? c.factIds.map((f: unknown) => String(f ?? "").trim()).filter(Boolean) : [];
  const intent = String(c?.intent ?? "").trim();
  return {
    id: String(c?.id ?? `c${index + 1}`).trim() || `c${index + 1}`,
    claimType,
    factIds,
    intent,
    aboutProduct: c?.aboutProduct ? String(c.aboutProduct).trim() : null,
    value:
      c?.value === undefined || c?.value === null
        ? null
        : typeof c.value === "number" || typeof c.value === "boolean"
          ? c.value
          : // "true"/"false" as a string is the same fact, and arrives
            // either way depending on the model. Normalised here so one
            // shape reaches the checks.
            /^(?:true|false)$/i.test(String(c.value).trim())
            ? String(c.value).trim().toLowerCase() === "true"
            : String(c.value),
    unit: c?.unit ? String(c.unit).trim() : null,
  };
}
