import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

import { nextQuestion, progressFor, questionByKey } from "@/lib/onboarding/interview";
import { findMissingFact } from "@/lib/onboarding/factGaps";
import { attemptFor, contextFrom, readProgress } from "@/lib/onboarding/interviewProgress";
import { judgeAnswer } from "@/lib/onboarding/answerCheck";
import { cleanBusinessModels } from "@/lib/business/businessModel";

// The resumable interview (I5 of docs/PLAN-AUTO-INTERVIEW.md).
//
// FIRST PLACE judgeAnswer IS ACTUALLY CALLED. I3 built the verdict and
// said plainly that nothing called it; this is that caller.
//
// WHAT RESUMABLE MEANS HERE, and it is the point rather than a
// convenience: every question's state is its own row, so leaving the
// interview half-done leaves a KNOWN half. §2.1 of the plan is that a
// half-filled record looks complete to a generator — `knownText` reads
// what is present and cannot know what the owner never reached — so the
// count is what the facts layer then states out loud.
//
// THE SAME AUTHORIZATION AS /api/listing-facts, for the same reason:
// `interview_answers` has no client write policy (migration 222). The
// business is resolved from the caller's own `profiles` row, never from
// the body, and the service client is reached only afterwards.
//
// ONE ANSWER PER REQUEST. The owner answers a question, this judges it,
// writes it where the registry says, and records that it was answered.
// Nothing batches, because a batch that half-fails leaves exactly the
// ambiguity this table exists to remove.

async function resolve(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return { error: NextResponse.json({ error: "No business" }, { status: 400 }) };

  return { supabase, user, dealershipId };
}

/** What this business has answered, and what it is asked next. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No business" }, { status: 400 });

  // Both reads go through RLS — migration 222 grants select to the owner
  // and to an active team member, so a refusal genuinely means "not
  // yours" rather than being worked around.
  const [{ data: rows }, { data: dealership }] = await Promise.all([
    supabase.from("interview_answers").select("question_key, status, attempts, weak").eq("dealership_id", dealershipId),
    supabase.from("dealerships").select("business_models").eq("id", dealershipId).maybeSingle(),
  ]);

  const models = cleanBusinessModels(dealership?.business_models) ?? [];
  const progress = readProgress(rows);
  const ctx = contextFrom(progress, models);

  // A GAP THE PRODUCT HAS ALREADY PAID FOR COMES FIRST — R2c.
  //
  // Tier 3 (I6) asks for a fact because a generator reached for it and
  // the claims guard deleted the sentence instead. Until now its only
  // delivery was the daily email, so making reports on-demand would
  // have taken the question with them. It belongs here anyway: this is
  // the screen where answers are written.
  //
  // IT GOES IN FRONT OF THE REGISTRY'S OWN NEXT QUESTION, because a
  // fact that has already cost the owner a deleted line is worth more
  // than the next one on a list.
  //
  // NOTHING IS RECORDED BY SERVING IT. findMissingFact only reads; the
  // ask is spent when he answers or skips, which the POST below
  // records and nextGapToAsk already treats as dealt with. Marking it
  // "asked" here would burn the one question on a page view.
  let because: string | null = null;
  let next = nextQuestion(ctx);
  try {
    const gap = await findMissingFact(supabase, dealershipId);
    if (gap.asked && gap.line) {
      const gapQuestion = questionByKey(gap.asked.key);
      if (gapQuestion) {
        next = gapQuestion;
        because = gap.line.text;
      }
    }
  } catch (err: any) {
    // Never breaks the interview: a gap that cannot be read just means
    // the registry's next question, which is what used to happen.
    console.error(`[interview] could not look for a missing fact: ${err?.message ?? err}`);
  }

  return NextResponse.json({
    // The whole question, so the screen writes no prompt of its own.
    next: next ? { ...next, when: undefined } : null,
    // WHY THIS ONE, when it is a gap rather than the next on the list.
    // Null for an ordinary question — the screen must not invent a
    // reason for a question that does not have one.
    because,
    // THE COUNT THE FACTS LAYER WILL ALSO STATE. One source, so the
    // screen and the prompt cannot disagree about how far along this is.
    progress: progressFor(2, ctx),
    attempt: next ? attemptFor(rows, next.key) : 1,
  });
}

/** One answer, judged and written. */
export async function POST(request: Request) {
  const resolved = await resolve(request);
  if ("error" in resolved) return resolved.error;
  const { supabase, dealershipId } = resolved;

  const body = await request.json().catch(() => ({}));
  const key = String((body as any)?.key ?? "").trim();
  const text = String((body as any)?.answer ?? "");
  const skip = (body as any)?.skip === true;

  const question = questionByKey(key);
  // A KEY NOBODY DECLARED IS REFUSED, not guessed at. questionByKey
  // returns null rather than the first question for exactly this.
  if (!question) return NextResponse.json({ error: "Unknown question" }, { status: 400 });

  const service = createServiceClient();
  const { data: rows } = await service
    .from("interview_answers")
    .select("question_key, status, attempts, weak")
    .eq("dealership_id", dealershipId);

  // SKIPPING IS AN ANSWER ABOUT THE QUESTION, NOT ABOUT THE BUSINESS.
  // It stops the question being asked again — a product that re-asks is
  // one the owner stops reading — and it is recorded as `skipped` so the
  // facts layer never counts it as a fact that exists.
  if (skip) {
    await service.from("interview_answers").upsert(
      { dealership_id: dealershipId, question_key: key, status: "skipped", answered_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "dealership_id,question_key" }
    );
    return NextResponse.json({ ok: true, skipped: true });
  }

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
    return NextResponse.json({ ok: false, followUp: verdict.followUp, reason: verdict.reason });
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
      return NextResponse.json({ error: "Could not save that just now." }, { status: 500 });
    }
  }

  await service.from("interview_answers").upsert(
    {
      dealership_id: dealershipId,
      question_key: key,
      status: "answered",
      attempts: attempt,
      weak: verdict.weak,
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealership_id,question_key" }
  );

  // WHAT TO ASK NEXT, from the state as it now is rather than from what
  // the screen thinks it is.
  const { data: after } = await service
    .from("interview_answers")
    .select("question_key, status, attempts, weak")
    .eq("dealership_id", dealershipId);
  const { data: dealership } = await supabase.from("dealerships").select("business_models").eq("id", dealershipId).maybeSingle();
  const ctx = contextFrom(readProgress(after), cleanBusinessModels(dealership?.business_models) ?? []);
  const next = nextQuestion(ctx);

  return NextResponse.json({
    ok: true,
    weak: verdict.weak,
    stored: verdict.rows.length,
    next: next ? { ...next, when: undefined } : null,
    progress: progressFor(2, ctx),
  });
}
