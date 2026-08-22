// Post-call lead scoring — the authoritative score. The blind,
// pre-call heuristic in ai-engine.ts (vehicle age/budget) still runs
// the moment a lead comes in, purely so something reasonable shows up
// immediately (e.g. for a "hot lead" notification before anyone's
// talked to them) — but once a real conversation has happened, what
// was actually said is a far better signal than guessed demographics,
// so this overwrites that guess.

import { logClaudeUsage } from "../usage/logUsage";
import { CLAUDE_MODELS } from "../models";
import { modelForTask } from "../aiTaskRouter";

export type CallIntent = "interested" | "not_interested" | "requesting_info" | "ready_to_book" | "complaint" | "no_real_conversation" | "other";
export type CallSentiment = "positive" | "neutral" | "negative";
export type CallUrgency = "high" | "medium" | "low";

const INTENTS: CallIntent[] = ["interested", "not_interested", "requesting_info", "ready_to_book", "complaint", "no_real_conversation", "other"];
const SENTIMENTS: CallSentiment[] = ["positive", "neutral", "negative"];
const URGENCIES: CallUrgency[] = ["high", "medium", "low"];

export interface CallScoreResult {
  score: number; // 0-100
  temperature: "hot" | "warm" | "cold";
  reason: string;
  intent: CallIntent;
  sentiment: CallSentiment;
  urgency: CallUrgency;
}

const FALLBACK: CallScoreResult = {
  score: 30,
  temperature: "cold",
  reason: "Couldn't analyze the call transcript automatically — review manually.",
  intent: "other",
  sentiment: "neutral",
  urgency: "low",
};

export async function scoreLeadFromCall(transcript: string, leadName: string, logContext?: { supabase: any; dealershipId: string }): Promise<CallScoreResult> {
  if (!transcript || transcript.trim().length < 10) {
    return {
      score: 10,
      temperature: "cold",
      reason: "Call had no meaningful conversation (no answer, hang-up, or voicemail).",
      intent: "no_real_conversation",
      sentiment: "neutral",
      urgency: "low",
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
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
      }),
    });

    const data = await response.json();
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "call_scoring", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0, CLAUDE_MODELS.fast);
    const text = data?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const score = Math.max(0, Math.min(100, Number(parsed.score)));
    const temperature = ["hot", "warm", "cold"].includes(parsed.temperature) ? parsed.temperature : "cold";
    const intent = INTENTS.includes(parsed.intent) ? parsed.intent : "other";
    const sentiment = SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : "neutral";
    const urgency = URGENCIES.includes(parsed.urgency) ? parsed.urgency : "low";
    return { score, temperature, reason: String(parsed.reason ?? FALLBACK.reason), intent, sentiment, urgency };
  } catch {
    return FALLBACK;
  }
}
