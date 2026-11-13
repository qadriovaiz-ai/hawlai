// What a customer asked that the records could not answer — V4c.
//
// THE MOST VALUABLE ROW IN THE ENGINE, and until now it did not exist.
// Every other gap this product finds is one it went looking for: a
// generator reached for a price, the guard removed it, Tier 3 asks
// about it. This is a real customer wanting to know something, at the
// moment they wanted it, and the business having nothing to tell them.
//
// ─────────────────────────────────────────────────────────────────────
// THE AGENT REPORTS THE GAP; IT IS NOT GUESSED FROM THE REPLY
// ─────────────────────────────────────────────────────────────────────
//
// The alternative was to read the agent's own reply and decide from its
// wording whether it had deferred — matching "I'll check", "let me find
// out" and so on. That is a keyword list in English, it would be wrong
// in both directions on the same sentence, and it would be a second
// classifier for something the model already knows. So the model says
// so, in a declared field, and `questionKeyFrom` refuses anything that
// is not a question the interview can actually ask about.
//
// WHY THE INTERVIEW'S OWN KEYS. A gap is only worth recording if the
// owner can be asked to close it, and the interview is the thing that
// asks. Using its keys means a gap maps to a real question with no
// fuzzy mapper in between — and rule 3 comes free, because those
// questions are already written for any trade.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT STORED
// ─────────────────────────────────────────────────────────────────────
//
// The visitor's words. A customer's sentence routinely carries their
// name, number, address or situation, and keeping it would put personal
// data in a table the owner reads over a dashboard — for a visitor who
// may never have consented to anything, to answer a question that does
// not need it. "Four customers asked which areas you serve and you have
// not said" is the entire finding.
//
// No visitor id either: the gap belongs to the business, not to the
// person who happened to find it.

import { INTERVIEW_QUESTIONS } from "@/lib/onboarding/interview";

/** Where the question was asked. */
export type GapSource = "website_chat";

/**
 * Every question key the interview can ask about.
 *
 * READ FROM THE REGISTRY, NEVER COPIED. A second list here would drift
 * from the questions the owner is actually asked, and a gap pointing at
 * a question that no longer exists is a finding nobody can close.
 */
export function interviewKeys(): string[] {
  return INTERVIEW_QUESTIONS.map((q) => q.key);
}

/** The key stored when the agent could not place the question. */
export const OTHER_KEY = "other";

/**
 * The question key to store, from whatever the model returned.
 *
 * ANYTHING UNRECOGNISED BECOMES `other` RATHER THAN BEING TRUSTED OR
 * DROPPED. Trusting it would let a model invent a question key that
 * Tier 3 then cannot ask; dropping it would lose the one fact that is
 * certainly true — that a customer asked something and got no answer.
 * `other` keeps the count honest and asks nothing.
 */
export function questionKeyFrom(value: unknown): string {
  const key = String(value ?? "").trim();
  if (!key) return OTHER_KEY;
  return interviewKeys().includes(key) ? key : OTHER_KEY;
}

/**
 * The line in the agent's prompt that asks it to report the gap.
 *
 * Built from the registry so the model is offered exactly the questions
 * that exist. The instruction is explicit that this is about the
 * BUSINESS's records, not about the agent's own uncertainty: a model
 * that reported every hesitation would bury the real gaps.
 */
export function gapReportRule(): string {
  return [
    "",
    "WHEN YOUR RECORDS DIDN'T HAVE THE ANSWER, SAY WHICH QUESTION IT WAS:",
    `- Set \`unanswered\` to one of: ${interviewKeys().join(", ")} — or "${OTHER_KEY}" if it was something else. Set it to null when you were able to answer.`,
    "- This is about the BUSINESS's records being silent, not about you being unsure. If the verified facts answered it, `unanswered` is null even if you phrased the answer carefully.",
    "- Never put the customer's own words, name, number or address in it. It is a category, not a quote.",
  ].join("\n");
}

/**
 * Record that a customer asked something the records did not answer.
 *
 * NEVER THROWS, AND NEVER BLOCKS THE REPLY. A visitor is waiting on the
 * other end of this request; a logging table being unavailable is not a
 * reason to fail their question. The gap is lost and the console says
 * so, which is the same trade `recordDelivery` makes.
 */
export async function recordAnswerGap(
  supabase: any,
  dealershipId: string,
  questionKey: unknown,
  source: GapSource = "website_chat"
): Promise<boolean> {
  if (!supabase || !dealershipId) return false;
  try {
    const { error } = await supabase.from("answer_gaps").insert({
      dealership_id: dealershipId,
      question_key: questionKeyFrom(questionKey),
      source,
    });
    if (error) {
      console.error(`[answer-gaps] could not record a gap: ${error.message}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error(`[answer-gaps] could not record a gap: ${e?.message ?? e}`);
    return false;
  }
}
