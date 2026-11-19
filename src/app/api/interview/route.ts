import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

import { nextQuestion, progressFor, questionByKey } from "@/lib/onboarding/interview";
import { findMissingFact } from "@/lib/onboarding/factGaps";
import { attemptFor, contextFrom, readProgress } from "@/lib/onboarding/interviewProgress";
import { judgeAnswer } from "@/lib/onboarding/answerCheck";
import { cleanBusinessModels } from "@/lib/business/businessModel";
import { pendingSuggestions, rejectSuggestion, storeSuggestion } from "@/lib/onboarding/suggestions";
import { saveInterviewAnswer } from "@/lib/onboarding/saveAnswer";
import { discoverFromSite } from "@/lib/onboarding/discoverFromSite";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";

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
    supabase.from("interview_answers").select("question_key, status, attempts, weak, source, suggested_value, evidence").eq("dealership_id", dealershipId),
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
  // WHETHER ANYTHING HAS EVER BEEN DISCOVERED FOR THIS BUSINESS.
  //
  // THE DISCOVERY ITSELF IS A POST, and this is only the flag that
  // tells the screen to ask for one. An existing test holds that this
  // handler reads through RLS and never reaches for the service client
  // — "the handler that only reads" — and it caught the first version
  // of D3, which ran discovery here and wrote rows from a GET.
  //
  // The test was right and the design was wrong: a refusal from this
  // handler should mean "not yours" because RLS said so, and a GET
  // that writes is a GET a browser may repeat for its own reasons.
  const needsDiscovery = !(rows ?? []).length;

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

  // THE DRAFT FOR THE QUESTION BEING ASKED, if there is one.
  //
  // ONE QUESTION, ONE DRAFT. The screen is not handed the whole list:
  // the interview asks one thing at a time, and a card showing six
  // drafts at once is the form this feature exists to replace.
  //
  const draft = next
    ? pendingSuggestions(rows).find((s) => s.questionKey === next!.key) ?? null
    : null;

  return NextResponse.json({
    // The whole question, so the screen writes no prompt of its own.
    next: next ? { ...next, when: undefined } : null,
    // WHAT WE THINK THE ANSWER IS, AND WHERE WE GOT IT. Null for a
    // question nothing was found for, which is most of them — the
    // screen must not imply a draft that does not exist.
    suggestion: draft,
    // THE SCREEN ASKS FOR DISCOVERY, this handler never performs it.
    // True exactly once per business: the first time anybody opens
    // this card, before a single question has any state.
    needsDiscovery,
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
  const reject = (body as any)?.reject === true;
  const discover = (body as any)?.discover === true;

  // READ WHAT HIS OWN SITE ALREADY SAYS, AND STORE IT AS DRAFTS — D3.
  //
  // IN THE POST, where this file's writes live. It carries no question
  // key, so it runs before the key is resolved; everything after this
  // point is about one question and this is about all of them.
  //
  // ONLY WHEN NOTHING HAS BEEN DECIDED YET. storeSuggestion refuses an
  // answered, skipped or rejected row on its own, so a second run
  // cannot overwrite a decision — this is the cheaper guard that stops
  // the writes happening at all.
  if (discover) {
    const service = createServiceClient();
    const { data: existing } = await service
      .from("interview_answers")
      .select("question_key, status")
      .eq("dealership_id", dealershipId);
    if ((existing ?? []).length) return NextResponse.json({ ok: true, discovered: 0, already: true });

    try {
      const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
      let stored = 0;
      for (const suggestion of discoverFromSite(facts)) {
        if (await storeSuggestion(service, dealershipId, suggestion, null)) stored += 1;
      }
      return NextResponse.json({ ok: true, discovered: stored });
    } catch (err: any) {
      // A SITE THAT CANNOT BE READ IS NOT A REASON TO LOSE THE
      // INTERVIEW. The questions are asked blank, which is exactly
      // what happened before discovery existed.
      console.error(`[interview] could not read the site for suggestions: ${err?.message ?? err}`);
      return NextResponse.json({ ok: true, discovered: 0 });
    }
  }

  const question = questionByKey(key);
  // A KEY NOBODY DECLARED IS REFUSED, not guessed at. questionByKey
  // returns null rather than the first question for exactly this.
  if (!question) return NextResponse.json({ error: "Unknown question" }, { status: 400 });

  const service = createServiceClient();
  const { data: rows } = await service
    .from("interview_answers")
    .select("question_key, status, attempts, weak, source, suggested_value")
    .eq("dealership_id", dealershipId);

  // THE OWNER SAYS OUR DRAFT IS WRONG — D3.
  //
  // NOT A SKIP, and the difference is next time: skipping means "don't
  // ask me this", rejecting means "that answer is wrong", so the
  // question stays in the interview and is asked properly. The value
  // goes; `source` stays, because that we guessed is a fact about this
  // business's record even when the guess was bad.
  if (reject) {
    const done = await rejectSuggestion(service, dealershipId, key);
    return NextResponse.json({ ok: done, rejected: done });
  }

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

  // STORED IN ONE PLACE, CALLED FROM TWO. Moved to
  // lib/onboarding/saveAnswer so WhatsApp can confirm a suggestion
  // through exactly this path — see its header.
  const outcome = await saveInterviewAnswer(service, dealershipId, question, text, rows);
  if (!outcome.ok) {
    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: 500 });
    return NextResponse.json({ ok: false, followUp: outcome.followUp, reason: outcome.reason });
  }

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
    weak: outcome.weak,
    stored: outcome.stored,
    next: next ? { ...next, when: undefined } : null,
    progress: progressFor(2, ctx),
  });
}
