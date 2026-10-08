// ------------------------------------------------------------------
// CEO Growth Advisor Agent
// ------------------------------------------------------------------
// Synthesizes what every other agent already knows (leads, campaign
// performance, revenue) into one high-level "how is my business doing
// and what should I do next" view.
//
// Its numbers come from gatherBusinessNumbers — the same object the
// Reports page's cards and executive summary use — and its narrative is
// checked against them (narrativeCheck.ts). It used to read its own
// revenue figure and told a business to "trace where the ₹550 revenue
// came from" beside a Revenue card showing ₹0.
// ------------------------------------------------------------------

import { getModel } from "../models";
import { gatherBusinessNumbers, type BusinessNumbers } from "@/lib/reports/businessNumbers";
import { allowedNumbers, narrativeProblems, keepConsistent, describeNumbersForPrompt, droppedNote, NARRATIVE_RULES } from "@/lib/reports/narrativeCheck";
import { callClaude, withAiFailure } from "@/lib/ai/claude";
import { parseModelJson } from "@/lib/ai/modelJson";
import { computeHealthScore, type ScoreLine } from "@/lib/reports/healthScore";

export interface GrowthReport {
  /**
   * 0-100, COUNTED (src/lib/reports/healthScore.ts), or null when too
   * little has happened for a score out of 100 to mean anything.
   *
   * It used to come from the model: the prompt asked for
   * `healthScore: integer 0-100 (honest — …)` and the answer was
   * printed. On candle_by_qaaf it read 60/100 on 28 September and
   * 18/100 on 1 October with nothing underneath it changing. Neither
   * number was wrong, because neither meant anything.
   */
  healthScore: number | null;
  /** The arithmetic, so an owner can see which line they disagree with. */
  healthLines: ScoreLine[];
  /** Said when there is no score, or when part of it could not be read. */
  healthNote: string | null;
  /** Said when the number guard removed a sentence. Null when it didn't. */
  droppedNote?: string | null;
  headline: string;
  strengths: string[];
  risks: string[];
  nextActions: string[];
}

export async function generateGrowthReport(
  supabase: any,
  dealershipId: string,
  businessCategory: string = "business",
  /** Pass the report's own numbers so the narrative and the cards can't diverge (reportBundle.ts). */
  numbers?: BusinessNumbers
): Promise<GrowthReport> {
  const n = numbers ?? (await gatherBusinessNumbers(supabase, dealershipId));

  // COUNTED ONCE, here, and the same object on every path below —
  // including the fallbacks, which used to carry their own invented
  // numbers (10, 50, 30, 60).
  const health = computeHealthScore(n);
  const healthFields = {
    healthScore: health.scored ? health.score : null,
    healthLines: health.lines,
    healthNote: health.scored ? (health.unreadable.length ? health.unreadable.join(" ") : null) : health.reason,
  };

  // Ad data UNREADABLE — not connected, or the load failed. Scored on
  // leads alone and never presented as a measurement of ad performance.
  // "no_data" (no campaigns launched) falls through: that genuinely
  // means zero spend.
  if (n.adDataState === "not_connected" || n.adDataState === "error") {
    const notConnected = n.adDataState === "not_connected";
    return {
      ...healthFields,
      headline: notConnected
        ? "Your Meta ad account isn't connected, so ad performance is missing from this."
        : "Ad performance couldn't be loaded, so this is based on leads only.",
      strengths: [],
      risks: ["Ad spend and campaign results can't be read right now — this score reflects leads only."],
      nextActions: notConnected
        ? ["Reconnect Meta in Settings → Integrations to include campaign performance here"]
        : ["Refresh in a few minutes — if it keeps failing, check Settings → Integrations"],
    };
  }

  const fallback: GrowthReport = {
    ...healthFields,
    headline: n.totalLeads === 0 ? "Just getting started — no leads yet." : "Building momentum.",
    strengths: [],
    risks: n.totalLeads === 0 ? ["No leads yet — launch your first campaign"] : [],
    nextActions: n.totalLeads === 0 ? ["Launch your first ad in Marketing → Launch Ad"] : ["Check Optimization for campaign recommendations"],
  };

  try {
    const r = await callClaude({
      model: getModel("standard"),
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You are an experienced growth advisor reviewing this Indian ${businessCategory} business's marketing health. The real numbers:
${describeNumbersForPrompt(n)}
Onboarding complete: ${n.onboardingCompleted ? "yes" : "no"}

${NARRATIVE_RULES}

Return JSON only:
{"headline":"one honest sentence summarizing where they stand","strengths":["1-2 honest positives, or empty array if none yet"],"risks":["1-3 real risks/gaps, most urgent first"],"nextActions":["1-3 concrete next actions, most impactful first, specific enough to act on today"]}`,
        },
      ],
    }, { operation: "growth_report", logContext: { supabase, dealershipId } });
    if (!r.ok) return withAiFailure(fallback, r.failure);
    const text = r.text;
    // Tolerant read (src/lib/ai/modelJson.ts). The pattern this replaces
    // ran a greedy /\{[\s\S]*\}/ from the first "{" in the reply to the
    // last "}", then JSON.parse inside a catch that returns the fallback
    // below — so a spliced, cut-off or malformed reply discarded a call
    // that had already been paid for, behind a message naming nothing.
    // Now the complete items survive and an unreadable reply says why.
    const parsedReply = parseModelJson(text);
    if (!parsedReply.ok) {
      console.error(`[growthAdvisorAgent] ${parsedReply.cause}: ${parsedReply.detail}`);
      return fallback;
    }
    const parsed = parsedReply.value;

    // The check: anything that disagrees with the page's own numbers is
    // dropped, not shown.
    const allowed = allowedNumbers(n);
    // HOW MUCH DATA THERE IS, so a verdict can be judged against it. A
    // confident "healthy" on 5 leads is a guess wearing a measurement's
    // clothes (src/lib/reports/narrativeCheck.ts).
    const sample = { leads: n.totalLeads, orders: n.paidOrders };
    const headlineOk = typeof parsed.headline === "string" && narrativeProblems(parsed.headline, allowed, sample).length === 0;
    const strengths = keepConsistent(parsed.strengths, allowed, sample);
    const risks = keepConsistent(parsed.risks, allowed, sample);
    const nextActions = keepConsistent(parsed.nextActions, allowed, sample);
    const dropped = [...(headlineOk || !parsed.headline ? [] : [`headline: ${parsed.headline}`]), ...strengths.dropped, ...risks.dropped, ...nextActions.dropped];
    if (dropped.length) console.warn("[growth-advisor-agent] dropped narrative that disagreed with the numbers:", dropped.join(" | "));

    return {
      // NOT from the model. Counted above, whatever it replied.
      ...healthFields,
      headline: headlineOk ? parsed.headline : fallback.headline,
      strengths: strengths.kept,
      risks: risks.kept,
      nextActions: nextActions.kept.length ? nextActions.kept : fallback.nextActions,
      // Shown, not only logged: a report with a suggestion missing and
      // no reason reads as the product having nothing to say.
      droppedNote: droppedNote(dropped),
    };
  } catch (err: any) {
    console.error("[growth-advisor-agent] error:", err.message);
    return fallback;
  }
}
