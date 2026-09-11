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

import { logClaudeUsage } from "../usage/logUsage";
import { getModel } from "../models";
import { gatherBusinessNumbers, type BusinessNumbers } from "@/lib/reports/businessNumbers";
import { allowedNumbers, narrativeProblems, keepConsistent, describeNumbersForPrompt, NARRATIVE_RULES } from "@/lib/reports/narrativeCheck";

export interface GrowthReport {
  healthScore: number; // 0-100
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

  // Ad data UNREADABLE — not connected, or the load failed. Scored on
  // leads alone and never presented as a measurement of ad performance.
  // "no_data" (no campaigns launched) falls through: that genuinely
  // means zero spend.
  if (n.adDataState === "not_connected" || n.adDataState === "error") {
    const notConnected = n.adDataState === "not_connected";
    return {
      healthScore: n.totalLeads === 0 ? 10 : 50,
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
    healthScore: n.totalLeads === 0 ? 10 : n.liveCampaigns === 0 ? 30 : 60,
    headline: n.totalLeads === 0 ? "Just getting started — no leads yet." : "Building momentum.",
    strengths: [],
    risks: n.totalLeads === 0 ? ["No leads yet — launch your first campaign"] : [],
    nextActions: n.totalLeads === 0 ? ["Launch your first ad in Marketing → Launch Ad"] : ["Check Optimization for campaign recommendations"],
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
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
{"healthScore":integer 0-100 (honest — a business with 0 leads or 0 live campaigns should score low),"headline":"one honest sentence summarizing where they stand","strengths":["1-2 honest positives, or empty array if none yet"],"risks":["1-3 real risks/gaps, most urgent first"],"nextActions":["1-3 concrete next actions, most impactful first, specific enough to act on today"]}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (data.usage) await logClaudeUsage(supabase, dealershipId, "growth_report", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);

    // The check: anything that disagrees with the page's own numbers is
    // dropped, not shown.
    const allowed = allowedNumbers(n);
    const headlineOk = typeof parsed.headline === "string" && narrativeProblems(parsed.headline, allowed).length === 0;
    const strengths = keepConsistent(parsed.strengths, allowed);
    const risks = keepConsistent(parsed.risks, allowed);
    const nextActions = keepConsistent(parsed.nextActions, allowed);
    const dropped = [...(headlineOk || !parsed.headline ? [] : [`headline: ${parsed.headline}`]), ...strengths.dropped, ...risks.dropped, ...nextActions.dropped];
    if (dropped.length) console.warn("[growth-advisor-agent] dropped narrative that disagreed with the numbers:", dropped.join(" | "));

    return {
      healthScore: typeof parsed.healthScore === "number" ? parsed.healthScore : fallback.healthScore,
      headline: headlineOk ? parsed.headline : fallback.headline,
      strengths: strengths.kept,
      risks: risks.kept,
      nextActions: nextActions.kept.length ? nextActions.kept : fallback.nextActions,
    };
  } catch (err: any) {
    console.error("[growth-advisor-agent] error:", err.message);
    return fallback;
  }
}
