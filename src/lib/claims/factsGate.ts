// FACTS_AVAILABLE or FACTS_UNAVAILABLE — and never a third, silent state.
//
// F-01 (audit, 8 Oct 2026). Every generator was written the same way:
//
//     ${facts ? `${formatFactsForCopy(facts)}\n\n${COPY_TRUTH_RULES}` : ""}
//     ...
//     if (!facts) return { output: parsed };          // guard skipped
//
// So when gatherBusinessFactsSafely hit a transient error and returned
// null, three things happened at once: the verified facts left the
// prompt (correct — there were none), the TRUTH RULES left the prompt
// (wrong — they are a static string that depends on nothing), and the
// claims guard was skipped entirely while the output came back looking
// exactly like a checked draft. No `_claimsNote`, no marker, nothing in
// the reply. The owner could not tell.
//
// This module is the one place that decides what happens in each state,
// so no generator has to remember. It adds no new checking of its own:
// FACTS_AVAILABLE delegates to guardGenerated, FACTS_UNAVAILABLE
// delegates to stripUnverifiable (claimCheck.ts), which is the subset of
// the same rules that needs no records.
//
// It deliberately does NOT invent substitute facts. An empty facts
// object would make the guard report "the business has 0 paid orders on
// record", which is a statement about the business when the truth is a
// statement about Hawlai: we could not read it.

import {
  COPY_TRUTH_RULES,
  formatFactsForCopy,
  type BusinessFacts,
  type FactsAudience,
} from "./businessFacts";
import {
  guardGenerated,
  stripUnverifiable,
  type ClaimsMode,
} from "./claimCheck";
import { guardNarrative, narrativeNote, type NarrativeFinding } from "./narrativeProvenance";

export type FactsState = "FACTS_AVAILABLE" | "FACTS_UNAVAILABLE";

export function factsState(facts: BusinessFacts | null | undefined): FactsState {
  return facts ? "FACTS_AVAILABLE" : "FACTS_UNAVAILABLE";
}

/**
 * What the model is told, in either state.
 *
 * The truth rules are ALWAYS present. They forbid inventing counts,
 * offers, superlatives, health claims, links and contact details — none
 * of which becomes acceptable because a database read failed. Previously
 * they were interpolated behind `facts ?`, so the one moment the model
 * knew least about the business was the moment it was told least about
 * what it must not say.
 */
export function truthBlock(
  facts: BusinessFacts | null | undefined,
  audience: FactsAudience = "owner"
): string {
  if (facts) return `\n\n${formatFactsForCopy(facts, audience)}\n\n${COPY_TRUTH_RULES}\n`;
  return `\n\n${FACTS_UNAVAILABLE_BRIEF}\n\n${COPY_TRUTH_RULES}\n`;
}

/**
 * Said to the model when the records are unreadable.
 *
 * Not "there are no products" — that would be a claim about the
 * business. "Nothing could be read" is the truth, and the instruction
 * that follows from it is to write about the product without asserting
 * anything countable.
 */
export const FACTS_UNAVAILABLE_BRIEF = `VERIFIED FACTS: NONE AVAILABLE RIGHT NOW. This business's own records (products, prices, offers, shipping, order counts) could not be read for this request. That does NOT mean the business has none — it means nothing here can be checked.
- Write about the product, the craft and the feeling in your own words. Those need no record.
- State NO number, price, offer, discount, shipping term, count, rating, years-in-business or ranking — not even a plausible one. There is nothing to check it against.
- Do not say or imply that anything has been verified, confirmed or checked.`;

export type GateResult<T> = {
  output: T & { _claimsNote?: string; _factsState?: FactsState; _unverified?: string[] };
  removed: string[];
  /** Claims that may be true and could not be checked. Only ever set when facts are unavailable. */
  unverifiable: string[];
  priceWarnings: string[];
  linksFixed: string[];
  /** Backstory with no record behind it (src/lib/claims/narrativeProvenance.ts). */
  narrative: NarrativeFinding[];
  state: FactsState;
};

/**
 * The guard, in whichever form this state allows.
 *
 * FACTS_AVAILABLE — unchanged: guardGenerated, exactly as before.
 * FACTS_UNAVAILABLE — the fact-independent rules strip what is wrong
 *   whatever the records say, prices and offers are reported as
 *   unverifiable rather than deleted, and the result carries
 *   `_factsState` so no caller can mistake it for a checked draft.
 */
export function guardOrMark<T extends object>(
  output: T,
  facts: BusinessFacts | null | undefined,
  mode: ClaimsMode = "publish"
): GateResult<T> {
  if (facts) {
    const r = guardGenerated(output, facts, mode);
    // AND THE STORY, not only the facts. Every check inside
    // guardGenerated asks whether a FACT is on record; none asked
    // whether a STORY is, so a sentence carrying no checkable fact
    // could be wholly invented and pass all of them. Run here rather
    // than in each generator for F-16's reason: a protection that lives
    // in a generator leaves the next generator unguarded.
    const n = guardNarrative(r.output, facts, mode);
    const note = narrativeNote(n.findings, mode);
    return {
      output: {
        ...n.output,
        _factsState: "FACTS_AVAILABLE" as FactsState,
        ...(note ? { _claimsNote: joinNotes((n.output as any)._claimsNote, note) } : {}),
      },
      removed: r.removed,
      unverifiable: [],
      priceWarnings: r.priceWarnings,
      linksFixed: r.linksFixed,
      narrative: n.findings,
      state: "FACTS_AVAILABLE",
    };
  }

  const removed: string[] = [];
  const unverifiable: string[] = [];
  const emptied = (before: any, after: any) =>
    typeof before === "string" && before.trim() !== "" && String(after ?? "").trim() === "";

  // The same walk guardOutput uses: every string, "_" keys left alone,
  // an array item whose text was emptied dropped with it.
  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = stripUnverifiable(v);
      removed.push(...r.removed);
      unverifiable.push(...r.unverifiable);
      return r.text;
    }
    if (Array.isArray(v)) {
      const out: any[] = [];
      for (const item of v) {
        const next = walk(item);
        if (emptied(item, next)) continue;
        if (
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          Object.keys(item).some((k) => !k.startsWith("_") && emptied(item[k], next[k]))
        )
          continue;
        out.push(next);
      }
      return out;
    }
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = k.startsWith("_") ? x : walk(x);
      return o;
    }
    return v;
  };

  // With no records at all, a story is unsupported BY DEFINITION — the
  // records are what could have excused it. Same reasoning as
  // stripUnverifiable above, and the same fail-closed direction a
  // transient read error has to take.
  const narrativeChecked = guardNarrative(walk(output) as T, null, mode);
  const walked = narrativeChecked.output;
  const uniqueRemoved = Array.from(new Set(removed));
  const uniqueUnverifiable = Array.from(new Set(unverifiable));
  const note = [unverifiedNote(uniqueRemoved, uniqueUnverifiable), narrativeNote(narrativeChecked.findings, mode)]
    .filter(Boolean)
    .join(" ") || null;

  return {
    output: {
      ...walked,
      _factsState: "FACTS_UNAVAILABLE" as FactsState,
      ...(uniqueUnverifiable.length ? { _unverified: uniqueUnverifiable } : {}),
      ...(note ? { _claimsNote: joinNotes((walked as any)._claimsNote, note) } : {}),
    },
    removed: uniqueRemoved,
    unverifiable: uniqueUnverifiable,
    priceWarnings: [],
    linksFixed: [],
    narrative: narrativeChecked.findings,
    state: "FACTS_UNAVAILABLE",
  };
}

function joinNotes(existing: unknown, added: string): string {
  return [typeof existing === "string" ? existing : null, added].filter(Boolean).join(" ");
}

/**
 * What the owner is told. Says which of the two things happened, and
 * never implies the remainder was verified — because nothing was.
 */
export function unverifiedNote(removed: string[], unverifiable: string[]): string | null {
  const parts: string[] = [
    "Hawlai couldn't read your store records for this one, so nothing in it has been checked against them.",
  ];
  if (removed.length) {
    parts.push(
      `${removed.length === 1 ? "A line was" : `${removed.length} lines were`} taken out because ${
        removed.length === 1 ? "it makes a claim" : "they make claims"
      } nothing could support (${removed.slice(0, 2).join("; ")}${removed.length > 2 ? "; …" : ""}).`
    );
  }
  if (unverifiable.length) {
    parts.push(`Check ${unverifiable.join(" and ")} yourself before this goes out — it was left as written because deleting a correct one would be worse.`);
  }
  parts.push("Try again in a moment and it will be checked properly.");
  return parts.join(" ");
}

/** Whether this output is safe to put in front of a customer without the owner reading it first. */
export function safeToAutoPublish(output: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  return (output as any)._factsState === "FACTS_AVAILABLE";
}
