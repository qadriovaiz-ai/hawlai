// Confirming a discovered answer from the phone — D4.
//
// D1-D3 built the four states (`suggested`, `answered`, `rejected`,
// `skipped`) and the provenance that survives them: `source` records
// where an answer ORIGINATED, so "he confirmed something we found" and
// "he told us" stay different facts forever. D4 adds no state and no
// column. It adds a second place to say yes.
//
// WHY IT MATTERS THAT IT IS WHATSAPP. The owner this is for does not
// open a dashboard. A suggestion waiting for confirmation on a screen
// he never visits is a question that is never answered — and the
// interview will then go on to ask him the same thing properly, which
// is the product asking twice for something it had already worked out.
//
// ─────────────────────────────────────────────────────────────────────
// CONFIRMING GOES THROUGH THE SAME DOOR AS TYPING IT
// ─────────────────────────────────────────────────────────────────────
//
// `saveInterviewAnswer` is what /api/interview calls. A confirmation
// here calls exactly that, with the suggested value as the text — so
// the answer is judged, the notes reach business_knowledge, and the
// row's origin is kept, all identically. A version that only flipped
// the status would leave the fact recorded and unreadable.

import { pendingSuggestions, rejectSuggestion, type PendingSuggestion } from "@/lib/onboarding/suggestions";
import { questionByKey } from "@/lib/onboarding/interview";
import { saveInterviewAnswer } from "@/lib/onboarding/saveAnswer";
import type { Pending } from "@/lib/whatsapp/pendingReply";

/** How much of a suggested value is shown on a phone before it is cut. */
export const SHOWN_CHARS = 90;

/**
 * A suggestion as one line the owner can decide on.
 *
 * THE QUESTION AND THE ANSWER BOTH, because "Taj Road, Lucknow" alone
 * is not something anybody can say yes to — it has to be clear what it
 * is an answer TO.
 */
export function describeSuggestion(s: PendingSuggestion): string {
  const question = questionByKey(s.questionKey);
  const asked = question?.prompt ?? s.questionKey.replace(/_/g, " ");
  const value = s.value.length > SHOWN_CHARS ? `${s.value.slice(0, SHOWN_CHARS).trimEnd()}…` : s.value;
  // WHERE IT CAME FROM IS PART OF THE QUESTION. A transcription and a
  // deduction deserve different amounts of trust, and D1 made that
  // distinction deliberately — hiding it here would throw it away at
  // the one moment it is being acted on.
  const origin = s.source === "discovered" ? "found on your site" : "worked out from your details";
  return `${asked}\n  "${value}" (${origin})`;
}

/**
 * The suggestions waiting, as rows the shared resolver understands.
 *
 * KEYED BY THE ROW'S OWN id, not by question_key. The code the owner
 * types has to come from the same place for both kinds, or an approval
 * code and a suggestion code would mean different things while looking
 * identical.
 */
export function pendingSuggestionRows(rows: any[] | null | undefined): Pending[] {
  const byKey = new Map<string, any>();
  for (const r of rows ?? []) {
    const key = String((r as any)?.question_key ?? "").trim();
    if (key) byKey.set(key, r);
  }
  return pendingSuggestions(rows).map((s) => ({
    id: String(byKey.get(s.questionKey)?.id ?? s.questionKey),
    kind: "suggestion" as const,
    describe: describeSuggestion(s),
  }));
}

export type SuggestionOutcome = { ok: true; said: string } | { ok: false; said: string };

/**
 * Carry out the owner's decision about one suggestion.
 *
 * A REJECTION IS NOT A SKIP, and D3 already drew that line: rejecting
 * says "that answer is wrong", so the question stays in the interview
 * to be asked properly. This only has to call the function that
 * already knows.
 */
export async function applySuggestionDecision(
  service: any,
  dealershipId: string,
  suggestion: PendingSuggestion,
  decision: "approved" | "rejected",
  rows: any[] | null | undefined
): Promise<SuggestionOutcome> {
  const question = questionByKey(suggestion.questionKey);
  // A SUGGESTION FOR A QUESTION NOBODY DECLARED IS REFUSED, not
  // guessed at — the same rule the interview route applies.
  if (!question) return { ok: false, said: "I couldn't find that question any more." };

  if (decision === "rejected") {
    const done = await rejectSuggestion(service, dealershipId, suggestion.questionKey);
    return done
      ? { ok: true, said: `Thanks — I won't use that. I'll ask you properly instead.` }
      : { ok: false, said: "I couldn't record that just now." };
  }

  const outcome = await saveInterviewAnswer(service, dealershipId, question, suggestion.value, rows);
  if (!outcome.ok) {
    // THE SAME ANSWER-CHECK THE WEB FORM RUNS. A suggestion thin
    // enough to be sent back is worth sending back here too, rather
    // than storing on a phone what a browser would have refused.
    const why = "error" in outcome ? outcome.error : outcome.followUp ?? "I couldn't save that one.";
    return { ok: false, said: why };
  }
  return { ok: true, said: `Saved. I'll use that from now on.` };
}
