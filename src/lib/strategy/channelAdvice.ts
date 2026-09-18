// Channel advice tied to the measured diagnosis (./diagnosis.ts).
//
// The model interprets; it doesn't measure. It's handed the diagnosis and
// must tie every recommendation to a number in it. Afterwards, every figure
// it quotes (a percentage, a rupee amount, a count of leads, visits, orders
// or customers) is checked against the diagnosis — a recommendation quoting
// a number that isn't there is dropped, and the owner is told. Where the
// diagnosis says the data is too thin, the advice must say so rather than
// advise.

import { callClaude, aiFailureMessage, isPlatformOutage, type AiFailure } from "@/lib/ai/claude";
import { getModel } from "@/lib/models";
import { formatFactsForCopy, type BusinessFacts } from "@/lib/claims/businessFacts";
import { diagnosisNumbers, formatDiagnosisForPrompt, type Diagnosis } from "./diagnosis";

export type Recommendation = { title: string; action: string; evidence: string };

export type ChannelAdvice = {
  summary: string;
  recommendations: Recommendation[];
  dataGaps: string[];
  /** Recommendations or sentences removed for quoting a number the diagnosis doesn't hold. */
  removed: string[];
};

// A number used as a measurement: a percentage, a rupee amount, or a count
// of something the diagnosis counts. Plain numbers in words like "Step 2"
// or "90-day plan" aren't claims about the data.
const MEASURE = /(₹\s?\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*%|(\d[\d,]*(?:\.\d+)?)\s+(?:leads?|visits?|visitors?|orders?|customers?|people|clients?|sales|enquir(?:y|ies)|bookings?|conversions?)\b/gi;

function normaliseNumber(raw: string): string {
  const n = Number(raw.replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 10) / 10);
}

/** The figures in `text` that the diagnosis doesn't contain. */
export function unverifiedNumbers(text: string, allowed: Set<string>): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(MEASURE)) {
    const raw = m[1] ?? m[2] ?? m[3];
    // Compared as quoted. The diagnosis already holds each figure both
    // exactly and rounded, so "7%" for a measured 6.5% passes — but an
    // invented "3.5%" never passes just because 4 happens to be a count.
    if (!allowed.has(normaliseNumber(raw))) out.push(m[0].trim());
  }
  return out;
}

/** Keeps only what the diagnosis backs. Pure, so the rule is tested directly. */
export function verifyAdvice(raw: { summary?: unknown; recommendations?: unknown; dataGaps?: unknown }, d: Diagnosis): ChannelAdvice {
  const allowed = diagnosisNumbers(d);
  const removed: string[] = [];

  const summary = String(raw.summary ?? "")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const bad = unverifiedNumbers(sentence, allowed);
      if (bad.length) removed.push(`"${sentence.trim()}" — ${bad.join(", ")} isn't in your data`);
      return !bad.length;
    })
    .join(" ")
    .trim();

  const recommendations: Recommendation[] = [];
  for (const r of Array.isArray(raw.recommendations) ? raw.recommendations : []) {
    const rec = { title: String((r as any)?.title ?? "").trim(), action: String((r as any)?.action ?? "").trim(), evidence: String((r as any)?.evidence ?? "").trim() };
    if (!rec.title || !rec.action) continue;
    const bad = unverifiedNumbers(`${rec.title} ${rec.action} ${rec.evidence}`, allowed);
    if (bad.length) {
      removed.push(`"${rec.title}" — quoted ${bad.join(", ")}, which isn't in your data`);
      continue;
    }
    recommendations.push(rec);
  }

  const dataGaps = (Array.isArray(raw.dataGaps) ? raw.dataGaps : [])
    .map((g) => String(g ?? "").trim())
    .filter((g) => g && !unverifiedNumbers(g, allowed).length);

  // What the code already decided is too thin always reaches the owner,
  // whether or not the model repeated it.
  for (const gap of d.gaps) if (!dataGaps.some((g) => g.includes(gap.slice(0, 30)))) dataGaps.push(gap);

  return { summary, recommendations, dataGaps, removed };
}

const PROMPT_RULES = `RULES — this goes to a small business owner who will act on it:
- Every recommendation must rest on a number in the MEASURED DIAGNOSIS, and its "evidence" must quote that number exactly as written there.
- Never state, estimate or round a figure that isn't in the diagnosis — no industry benchmarks, no projected results, no "could double". A recommendation with an invented number is thrown away.
- Rank what to fix by where the diagnosis says people are lost, not by what is generally popular.
- Where the diagnosis says there isn't enough data, say so in dataGaps and say how to get it (e.g. "tag every lead's source", "run the site for more visits") — don't advise as if you knew.
- Channels the business doesn't use yet can be suggested only as a test, with how to measure it.
- 2-4 recommendations. Plain language. No marketing jargon.`;

/** Why advice couldn't be written — said to the owner in plain words, never a silent blank. */
export type AdviceFailure = "busy" | "cut_off" | "unreadable" | "unavailable" | "error";

export const ADVICE_FAILURE_MESSAGE: Record<AdviceFailure, string> = {
  busy: "The AI service was busy — try again in a minute. The numbers above are still accurate.",
  cut_off: "The advice ran too long and was cut off — try again. The numbers above are still accurate.",
  unreadable: "The AI's answer came back in a form Hawlai couldn't read — try again. The numbers above are still accurate.",
  unavailable: `${aiFailureMessage("credits")} The numbers above are still accurate.`,
  error: "Couldn't write the advice right now. The numbers above are still accurate.",
};

export type AdviceResult = { ok: true; advice: ChannelAdvice } | { ok: false; reason: AdviceFailure; detail: string };

/** The JSON object in a reply, if there is one: fences stripped, and the answer may begin mid-object (the call pre-fills "{"). */
export function parseAdviceJson(text: string): Record<string, unknown> | null {
  const body = String(text ?? "").replace(/```json|```/g, "").trim();
  // Two readings: the reply continues the pre-filled "{" (it starts with a
  // key), or it carries its own object somewhere inside some prose.
  for (const candidate of [`{${body}`, body]) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // try the other reading
    }
  }
  return null;
}

/** The AI call itself failed: busy is worth another try; an outage or a bad request isn't. */
function adviceFailure(failure: AiFailure): AdviceResult {
  const reason: AdviceFailure = failure.retryable ? "busy" : isPlatformOutage(failure.kind) ? "unavailable" : "error";
  return { ok: false, reason, detail: `the AI service answered ${failure.status ?? "nothing"} (${failure.kind})` };
}

/**
 * THE BUG (2026-09-18): for Candle by Qaaf — 28 visits, 5 leads, nobody
 * contacted yet — "What should I do about it?" showed only "Couldn't write
 * the advice right now". Four ways to fail (an API error, an empty reply, a
 * reply with no JSON, JSON that didn't parse) all returned the same null,
 * and only one of them logged anything, so the reason was unknowable.
 *
 * The likeliest cause fits the data: with thin data the model is told to
 * explain every gap and how to close it, and the answer ran past its 1,500
 * token limit — cut off mid-JSON, which doesn't parse.
 *
 * Now: a bigger budget with hard length limits in the prompt; the reply
 * is forced to start as JSON; a cut-off, unreadable or busy reply gets ONE
 * retry; and a failure that remains carries its reason to the page and the
 * log.
 */
export async function generateChannelAdvice(
  d: Diagnosis,
  facts: BusinessFacts | null,
  logContext?: { supabase: any; dealershipId: string }
): Promise<AdviceResult> {
  const prompt = `You are a marketing strategist advising where this business should put its effort next.

${formatDiagnosisForPrompt(d)}
${facts ? `\n${formatFactsForCopy(facts)}\n` : ""}
${PROMPT_RULES}
- Keep it short: summary at most 3 sentences; each action at most 2 sentences; at most 4 dataGaps, one sentence each.

Return JSON only:
{"summary":"2-3 sentences: where this business is losing people, in plain words","recommendations":[{"title":"short","action":"what to do this month","evidence":"the exact number(s) from the diagnosis this rests on"}],"dataGaps":["what can't be judged yet, and how to fix that"]}`;

  let last: AdviceResult = { ok: false, reason: "error", detail: "not attempted" };
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await attemptAdvice(prompt, attempt > 0, d, logContext);
    if (last.ok) return last;
    // An error that another try won't fix isn't retried.
    if (last.reason === "error" || last.reason === "unavailable") break;
  }
  if (!last.ok) console.error(`[channel-advice] failed (${last.reason}): ${last.detail}`);
  return last;
}

async function attemptAdvice(
  prompt: string,
  isRetry: boolean,
  d: Diagnosis,
  logContext?: { supabase: any; dealershipId: string }
): Promise<AdviceResult> {
  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 3000,
      messages: [
        { role: "user", content: isRetry ? `${prompt}\n\nYour last answer was cut off or wasn't valid JSON. Answer again, shorter, as one valid JSON object.` : prompt },
        // Pre-filled, so the reply is the JSON object from its first character.
        { role: "assistant", content: "{" },
      ],
      // One attempt here: generateChannelAdvice's own loop is the retry,
      // and it also re-asks when an answer comes back cut off.
    }, { operation: "strategy_channel_advice", logContext, attempts: 1 });
    if (!r.ok) return adviceFailure(r.failure);
    const data = r.data;
    const text = String(data.content?.[0]?.text ?? "");
    if (data.stop_reason === "max_tokens") return { ok: false, reason: "cut_off", detail: `reply cut off after ${data.usage?.output_tokens ?? "?"} tokens` };
    const parsed = parseAdviceJson(text);
    if (!parsed) return { ok: false, reason: "unreadable", detail: `no readable JSON in a ${text.length}-character reply` };
    return { ok: true, advice: verifyAdvice(parsed, d) };
  } catch (err: any) {
    return { ok: false, reason: "busy", detail: err?.message ?? String(err) };
  }
}
