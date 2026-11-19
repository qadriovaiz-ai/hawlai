// Storing one interview answer — the whole of it, in one place.
//
// MOVED OUT OF /api/interview's POST, unchanged (19 November 2026).
// Same reason H1 moved applyApprovalDecision out of the approvals
// route: a second door was about to open onto the same decision, and
// two copies of "what happens when an answer is stored" would have
// drifted the moment either was touched.
//
// THE SECOND DOOR IS WHATSAPP. D4 lets the owner confirm a discovered
// suggestion by replying to a message, and a confirmation has to do
// everything the web form does — judge the text, write the notes to
// business_knowledge, and mark the row answered while keeping its
// origin. A WhatsApp accept that only flipped the status would leave
// the fact in interview_answers and never in the place that is read,
// which is a half-accept and worse than no feature.
//
// NOTHING HERE IS NEW. It is the same code, called from two places.

import { judgeAnswer } from "@/lib/onboarding/answerCheck";
import { attemptFor } from "@/lib/onboarding/interviewProgress";
import type { InterviewQuestion } from "@/lib/onboarding/interview";

export type SaveAnswerResult =
  | { ok: false; followUp: string | null; reason: string | null }
  | { ok: false; error: string }
  | { ok: true; weak: boolean; stored: number };

/**
 * Judge an answer, store what it says, and record that it was answered.
 *
 * `rows` is the business's existing interview_answers, needed for the
 * attempt count and for the origin that survives being answered.
 */
export async function saveInterviewAnswer(
  service: any,
  dealershipId: string,
  question: InterviewQuestion,
  text: string,
  rows: any[] | null | undefined
): Promise<SaveAnswerResult> {
  const key = question.key;
  const attempt = attemptFor(rows, key);
  const verdict = judgeAnswer(question, text, { attempt });

  // NOT STORED AND ASKED BACK. The attempt is still counted, or the
  // follow-up would be asked forever — the founder's rule is that it is
  // asked once.
  if (!verdict.store) {
    if (verdict.followUp) {
      await service.from("interview_answers").upsert(
        { dealership_id: dealershipId, question_key: key, status: "asked", attempts: attempt, asked_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "dealership_id,question_key" }
      );
    }
    return { ok: false, followUp: verdict.followUp, reason: verdict.reason };
  }

  // THE NOTES, ONE ROW PER PIECE. splitToNotes never truncates, so a
  // long answer is several whole notes — and the titles are stable, so
  // answering again must UPDATE rather than add a third copy.
  //
  // READ-THEN-WRITE, NOT upsert(onConflict), AND THAT IS DELIBERATE.
  // `business_knowledge` has no unique index on (dealership_id, title),
  // so an ON CONFLICT on those columns fails at runtime — Postgres needs
  // the index to exist. The fix is not to add one: that table is the
  // OWNER'S, hand-editable through the Business Knowledge page, where
  // any title can be typed. A unique index on user-entered text could
  // fail to create against rows that already exist, and would later
  // reject a perfectly reasonable edit of the owner's own.
  //
  // Two queries instead of one, for a flow where one person answers one
  // question at a time.
  for (const row of verdict.rows) {
    const { data: existing } = await service
      .from("business_knowledge")
      .select("id")
      .eq("dealership_id", dealershipId)
      .eq("title", row.title)
      .maybeSingle();

    const payload = {
      category: row.category,
      content: row.content,
      is_active: true,
      // THE FLAG TRAVELS WITH THE TEXT. A thin answer stored as an
      // ordinary note is the one outcome storing it was meant to avoid.
      is_weak: verdict.weak,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await service.from("business_knowledge").update(payload).eq("id", existing.id)
      : await service.from("business_knowledge").insert({ dealership_id: dealershipId, title: row.title, ...payload });

    if (error) {
      console.error(`[interview] could not store "${row.title}" for ${dealershipId}: ${error.message}`);
      return { ok: false, error: "Could not save that just now." };
    }
  }

  // WHERE THE ANSWER CAME FROM, AND IT SURVIVES BEING ANSWERED — D3.
  //
  // An upsert writes the whole row, so saying nothing about `source`
  // would blank it: a confirmed discovery would come back reading as
  // if nobody had ever suggested anything. The origin is read off the
  // existing row and written back untouched.
  //
  // `owner` only when there was no draft. Everything else keeps the
  // origin it had, and that is the point of the column — "he confirmed
  // something we found" and "he told us" must stay different facts
  // forever, which is what lets anyone later count how many of this
  // business's records began as a guess.
  //
  // AN EDIT KEEPS THE ORIGIN TOO. The owner correcting our draft is
  // still an answer this product went looking for; `source` records
  // where the ANSWER ORIGINATED, not how much of it survived.
  const before = (rows ?? []).find((r: any) => r.question_key === key) as any;
  const origin = String(before?.source ?? "").trim() || "owner";

  await service.from("interview_answers").upsert(
    {
      dealership_id: dealershipId,
      question_key: key,
      status: "answered",
      source: origin,
      // THE DRAFT IS CLEARED ON THE WAY THROUGH. Keeping it would let
      // a later reader compare what we guessed against what he stored,
      // which is a real measure of whether discovery is any good — and
      // it is not worth a column holding a stale value nothing reads.
      // Recorded as considered rather than missed.
      suggested_value: null,
      attempts: attempt,
      weak: verdict.weak,
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealership_id,question_key" }
  );


  return { ok: true, weak: verdict.weak, stored: verdict.rows.length };
}
