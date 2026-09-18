// Channel advice tied to the measured diagnosis (./diagnosis.ts).
//
// The model interprets; it doesn't measure. It's handed the diagnosis and
// must tie every recommendation to a number in it. Afterwards, every figure
// it quotes (a percentage, a rupee amount, a count of leads, visits, orders
// or customers) is checked against the diagnosis — a recommendation quoting
// a number that isn't there is dropped, and the owner is told. Where the
// diagnosis says the data is too thin, the advice must say so rather than
// advise.

import { logClaudeUsage } from "@/lib/usage/logUsage";
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

export async function generateChannelAdvice(
  d: Diagnosis,
  facts: BusinessFacts | null,
  logContext?: { supabase: any; dealershipId: string }
): Promise<ChannelAdvice | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: getModel("standard"),
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `You are a marketing strategist advising where this business should put its effort next.

${formatDiagnosisForPrompt(d)}
${facts ? `\n${formatFactsForCopy(facts)}\n` : ""}
${PROMPT_RULES}

Return JSON only:
{"summary":"2-3 sentences: where this business is losing people, in plain words","recommendations":[{"title":"short","action":"what to do this month","evidence":"the exact number(s) from the diagnosis this rests on"}],"dataGaps":["what can't be judged yet, and how to fix that"]}`,
        }],
      }),
    });
    if (!response.ok) return null;
    const bodyText = await response.text();
    if (!bodyText.trim()) return null;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "strategy_channel_advice", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return verifyAdvice(JSON.parse(match[0]), d);
  } catch (err: any) {
    console.error("[channel-advice] failed:", err?.message);
    return null;
  }
}
