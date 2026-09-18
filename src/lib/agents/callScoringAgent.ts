// Post-call lead scoring — the authoritative score. The blind,
// pre-call heuristic in leads/leadIntake.ts (scoreNewLead) still runs
// the moment a lead comes in, purely so something reasonable shows up
// immediately (e.g. for a "hot lead" notification before anyone's
// talked to them) — but once a real conversation has happened, what
// was actually said is a far better signal than guessed demographics,
// so this overwrites that guess.


import { modelForTask } from "../aiTaskRouter";
import { callClaude, aiFailureNote, type AiFailureNote } from "@/lib/ai/claude";

export type CallIntent = "interested" | "not_interested" | "requesting_info" | "ready_to_book" | "complaint" | "no_real_conversation" | "other";
export type CallSentiment = "positive" | "neutral" | "negative";
export type CallUrgency = "high" | "medium" | "low";

const INTENTS: CallIntent[] = ["interested", "not_interested", "requesting_info", "ready_to_book", "complaint", "no_real_conversation", "other"];
const SENTIMENTS: CallSentiment[] = ["positive", "neutral", "negative"];
const URGENCIES: CallUrgency[] = ["high", "medium", "low"];

export interface CallScoreResult {
  /**
   * False when the call couldn't be scored (the AI failed, or its answer
   * was unreadable). The other fields are then placeholders and must NOT
   * be written onto the lead — see the Vapi webhook.
   */
  scored: boolean;
  /** Why, when the AI itself failed. */
  aiFailure?: AiFailureNote;
  score: number; // 0-100
  temperature: "hot" | "warm" | "cold";
  reason: string;
  intent: CallIntent;
  sentiment: CallSentiment;
  urgency: CallUrgency;
}

// THE BUG (2026-09-18): when scoring failed this returned score 30,
// "cold" — and the webhook wrote it onto the lead. A caller who had just
// asked for 20 Diwali candles became a cold lead because the AI was down,
// overwriting whatever the lead really was. Now an unscored call says so
// and changes nothing it can't vouch for.
function unscored(failure?: AiFailureNote): CallScoreResult {
  return {
    scored: false,
    ...(failure ? { aiFailure: failure } : {}),
    score: 0,
    temperature: "cold",
    reason: "Couldn't analyze the call transcript automatically — review manually.",
    intent: "other",
    sentiment: "neutral",
    urgency: "low",
  };
}

export async function scoreLeadFromCall(transcript: string, leadName: string, logContext?: { supabase: any; dealershipId: string }): Promise<CallScoreResult> {
  if (!transcript || transcript.trim().length < 10) {
    // A real answer, not a failure: nobody talked, so there's nothing warm to lose.
    return {
      scored: true,
      score: 10,
      temperature: "cold",
      reason: "Call had no meaningful conversation (no answer, hang-up, or voicemail).",
      intent: "no_real_conversation",
      sentiment: "neutral",
      urgency: "low",
    };
  }

  try {
    const r = await callClaude({
      // Haiku, not Sonnet — this runs after every single call, and
      // classifying a transcript into hot/warm/cold + a one-line
      // reason is a simpler task than the department-work this app
      // mostly uses Sonnet for. Frequency is high, complexity isn't.
      // Routed through the AI Task Router (Usage/Pricing spec
      // Section 10) rather than getModel("fast") directly — same
      // model, now via the named "call_scoring" -> simple mapping.
      model: modelForTask("call_scoring"),
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `You just read the transcript of a sales follow-up phone call with a lead named ${leadName}. Score how promising this lead is based ONLY on what was actually said in the call — their interest level, urgency, objections, budget signals, and whether they agreed to a next step.

Respond with ONLY a JSON object, no markdown, no preamble:
{"score": <0-100 integer>, "temperature": "<hot|warm|cold>", "reason": "<one sentence, specific to what was said in this call>", "intent": "<interested|not_interested|requesting_info|ready_to_book|complaint|other>", "sentiment": "<positive|neutral|negative>", "urgency": "<high|medium|low>"}

intent guide: "interested" = engaged and positive but no concrete next step yet; "requesting_info" = asked questions without committing; "ready_to_book" = agreed to or asked for a specific next step (visit, callback, appointment); "not_interested" = declined or disengaged; "complaint" = raised a problem or grievance; "other" = none of these fit.
urgency = how time-sensitive the lead's own need sounds from what they said, not how fast you think the business should follow up.

Transcript:
${transcript.slice(0, 8000)}`,
      }],
    }, { operation: "call_scoring", logContext });
    if (!r.ok) return unscored(aiFailureNote(r.failure));
    const text = r.text;
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.max(0, Math.min(100, Number(parsed.score)));
    const temperature = ["hot", "warm", "cold"].includes(parsed.temperature) ? parsed.temperature : "cold";
    const intent = INTENTS.includes(parsed.intent) ? parsed.intent : "other";
    const sentiment = SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : "neutral";
    const urgency = URGENCIES.includes(parsed.urgency) ? parsed.urgency : "low";
    if (!Number.isFinite(score) || !["hot", "warm", "cold"].includes(parsed.temperature)) return unscored();
    return { scored: true, score, temperature, reason: String(parsed.reason ?? "").trim() || "Scored from the call transcript.", intent, sentiment, urgency };
  } catch {
    return unscored();
  }
}
