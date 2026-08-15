// ------------------------------------------------------------------
// Reporting Agent — Phase 1 basic version
// ------------------------------------------------------------------
// Pulls together what every other agent has produced (leads, pipeline
// stages, campaigns, approvals, spend) and asks Claude to turn it into
// a short, plain-language summary — the kind of update a human CMO
// would give a founder who doesn't have time to read every dashboard.
// ------------------------------------------------------------------

import { getCampaignPerformance } from "./analyticsAgent";
import { logClaudeUsage } from "../usage/logUsage";

export interface ReportStats {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  leadsByStage: Record<string, number>;
  pendingApprovals: number;
  campaignsLaunched: number;
  totalSpend: number;
  costPerLead: number | null;
  totalRevenue: number;
  roas: number | null;
  appointmentsScheduled: number;
  appointmentsCompleted: number;
  callsMade: number;
}

export interface ExecutiveReport {
  stats: ReportStats;
  summary: string;
  priorities: string[];
}

async function gatherStats(supabase: any, dealershipId: string): Promise<ReportStats> {
  const [
    { data: leads },
    { data: approvals },
    { data: campaigns },
    { data: appointments },
    { data: calls },
    performance,
  ] = await Promise.all([
    supabase.from("leads").select("lead_temperature, status, deal_value").eq("dealership_id", dealershipId),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
    supabase.from("ad_creatives").select("id").eq("dealership_id", dealershipId).eq("status", "launched"),
    supabase.from("appointments").select("status").eq("dealership_id", dealershipId),
    supabase.from("calls").select("id").eq("dealership_id", dealershipId),
    getCampaignPerformance(supabase, dealershipId),
  ]);

  const leadsByStage: Record<string, number> = {};
  for (const lead of leads ?? []) {
    leadsByStage[lead.status] = (leadsByStage[lead.status] ?? 0) + 1;
  }

  const totalRevenue = (leads ?? []).reduce((sum: number, l: any) => sum + (Number(l.deal_value) || 0), 0);

  return {
    totalLeads: leads?.length ?? 0,
    hotLeads: leads?.filter((l: any) => l.lead_temperature === "hot").length ?? 0,
    warmLeads: leads?.filter((l: any) => l.lead_temperature === "warm").length ?? 0,
    coldLeads: leads?.filter((l: any) => l.lead_temperature === "cold").length ?? 0,
    leadsByStage,
    pendingApprovals: approvals?.length ?? 0,
    campaignsLaunched: campaigns?.length ?? 0,
    totalSpend: performance.totals.spend,
    costPerLead: performance.totals.cost_per_lead,
    totalRevenue,
    roas: performance.totals.spend > 0 ? totalRevenue / performance.totals.spend : null,
    appointmentsScheduled: appointments?.filter((a: any) => a.status === "scheduled").length ?? 0,
    appointmentsCompleted: appointments?.filter((a: any) => a.status === "completed").length ?? 0,
    callsMade: calls?.length ?? 0,
  };
}

async function summarizeWithClaude(stats: ReportStats, businessCategory: string, logContext?: { supabase: any; dealershipId: string }): Promise<{ summary: string; priorities: string[] }> {
  const fallback = {
    summary:
      stats.totalLeads === 0
        ? "No activity yet — launch your first ad to start generating leads."
        : `You have ${stats.totalLeads} total leads (${stats.hotLeads} hot), with ${stats.pendingApprovals} action(s) waiting for your approval.`,
    priorities: stats.pendingApprovals > 0 ? ["Review pending approvals"] : [],
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
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are writing a short executive summary for a ${businessCategory} business owner, based on this data from their marketing dashboard:
${JSON.stringify(stats, null, 2)}

Write it like a sharp marketing manager briefing a busy founder — plain language, no jargon, no fluff. Return JSON only (no markdown):
{"summary":"2-3 sentence overview of where things stand, in plain English","priorities":["1-3 short, specific, actionable next steps — only include ones that actually matter given the data. Empty array if genuinely nothing needs attention."]}`,
          },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "executive_report", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary ?? fallback.summary,
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities : fallback.priorities,
    };
  } catch (err: any) {
    console.error("[reporting-agent] summarizeWithClaude error:", err.message);
    return fallback;
  }
}

export async function generateExecutiveReport(supabase: any, dealershipId: string): Promise<ExecutiveReport> {
  const [stats, { data: dealership }] = await Promise.all([
    gatherStats(supabase, dealershipId),
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
  ]);
  const businessCategory = dealership?.business_category ?? "car dealership";
  const { summary, priorities } = await summarizeWithClaude(stats, businessCategory, { supabase, dealershipId });
  return { stats, summary, priorities };
}

// ------------------------------------------------------------------
export interface ComparisonCampaign {
  headline: string;
  mode?: string | null;
  background_style?: string | null;
  targeting_city?: string | null;
  daily_budget?: number | null;
  scheduled_start?: string | null;
  performance: { spend: number; leads: number; cost_per_lead: number | null };
}

// Picks what to compare `current` against: variant-group siblings
// first (an actual A/B pair is the strongest comparison), falling
// back to the dealership's other recently-launched campaigns. Only
// returns campaigns that have real performance data — comparing
// against a campaign with zero spend/leads isn't a real comparison,
// just noise. Takes already-fetched performance data rather than
// fetching it itself, since every caller already has it (Meta's
// Insights API is a live call, not worth hitting twice per request).
export async function getComparisonCampaigns(
  supabase: any,
  dealershipId: string,
  current: { id: string; variant_group_id?: string | null },
  allPerformance: { id: string; spend: number; leads: number; cost_per_lead: number | null }[]
): Promise<ComparisonCampaign[]> {
  let siblings: any[] = [];
  if (current.variant_group_id) {
    const { data } = await supabase
      .from("ad_creatives")
      .select("id, headline, mode, background_style, targeting_city, daily_budget, scheduled_start")
      .eq("variant_group_id", current.variant_group_id)
      .neq("id", current.id);
    siblings = data ?? [];
  }
  if (siblings.length === 0) {
    const { data } = await supabase
      .from("ad_creatives")
      .select("id, headline, mode, background_style, targeting_city, daily_budget, scheduled_start")
      .eq("dealership_id", dealershipId)
      .eq("status", "launched")
      .neq("id", current.id)
      .order("created_at", { ascending: false })
      .limit(3);
    siblings = data ?? [];
  }
  if (siblings.length === 0) return [];

  const perfById = new Map(allPerformance.map((p) => [p.id, p]));

  return siblings
    .map((s): ComparisonCampaign | null => {
      const perf = perfById.get(s.id);
      if (!perf || (perf.spend <= 0 && perf.leads <= 0)) return null;
      return {
        headline: s.headline,
        mode: s.mode,
        background_style: s.background_style,
        targeting_city: s.targeting_city,
        daily_budget: s.daily_budget,
        scheduled_start: s.scheduled_start,
        performance: { spend: perf.spend, leads: perf.leads, cost_per_lead: perf.cost_per_lead },
      };
    })
    .filter((c): c is ComparisonCampaign => c !== null);
}

// Explain This Campaign — Block 5
// ------------------------------------------------------------------
// Turns a campaign's raw stats into a plain-language explanation, on
// demand, per campaign — different from the dashboard-wide executive
// summary above, this is scoped to one specific campaign the dealer
// is looking at right now.
//
// AI-Intelligence Pillar 1 — Causal Reasoning. When `comparisons` is
// given (variant-group siblings, or other launched campaigns with
// real performance data), the explanation becomes comparative: what's
// actually different between this campaign and the other(s), and
// which of those differences plausibly explains the performance gap
// — not just a restatement of this campaign's own numbers. With no
// comparison data available, behavior is byte-identical to before.
export async function explainCampaign(
  campaign: { headline: string; body_copy?: string; daily_budget?: number; targeting_city?: string; creative_score?: number; mode?: string | null; background_style?: string | null; scheduled_start?: string | null },
  performance: { spend: number; leads: number; impressions: number; clicks: number; cost_per_lead: number | null } | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string },
  comparisons?: ComparisonCampaign[]
): Promise<string> {
  const fallback = performance && (performance.spend > 0 || performance.leads > 0)
    ? `This campaign has spent ${performance.spend} and generated ${performance.leads} leads so far. Check back after it's run a bit longer for a fuller picture.`
    : "This campaign hasn't generated spend or lead data yet — check back once it's been running for a day or two.";

  const hasComparisons = comparisons && comparisons.length > 0;

  const promptContent = hasComparisons
    ? `Explain, to a ${businessCategory} business owner who doesn't know marketing jargon, WHY this campaign performed differently from similar ones it can be compared against.

This campaign: "${campaign.headline}" — ${campaign.body_copy ?? ""}
Creative type: ${campaign.mode === "ai_generate" ? "AI-generated image" : "template image"}, background style: ${campaign.background_style ?? "not set"}
Budget: ₹${campaign.daily_budget ?? "?"}/day, targeting ${campaign.targeting_city ?? "no specific city"}, ${campaign.scheduled_start ? `scheduled to start ${campaign.scheduled_start}` : "no specific start time set"}
Performance: ${performance ? `₹${performance.spend} spent, ${performance.leads} leads, cost per lead ${performance.cost_per_lead ?? "not yet calculable"}` : "no data yet"}

Comparison campaign(s):
${comparisons!.map((c, i) => `${i + 1}. "${c.headline}" — creative type: ${c.mode === "ai_generate" ? "AI-generated image" : "template image"}, background: ${c.background_style ?? "not set"}, budget ₹${c.daily_budget ?? "?"}/day, targeting ${c.targeting_city ?? "no specific city"}, ${c.scheduled_start ? `started ${c.scheduled_start}` : "no specific start time"}. Performance: ₹${c.performance.spend} spent, ${c.performance.leads} leads, cost per lead ${c.performance.cost_per_lead ?? "not yet calculable"}.`).join("\n")}

Identify what's actually DIFFERENT between this campaign and the comparison(s) — creative type, background style, budget, targeting, or timing — and which of those differences plausibly explains the performance gap. Be specific and honest: if the numbers don't clearly point to one factor, say that rather than guessing. Write 3-4 plain-language sentences ending in one concrete next step. No jargon like CTR/CPM. Return plain text, no JSON, no markdown.`
    : `Explain this Meta ad campaign to a ${businessCategory} business owner who doesn't know marketing jargon.
Campaign: "${campaign.headline}" — ${campaign.body_copy ?? ""}
Budget: ₹${campaign.daily_budget ?? "?"}/day, targeting ${campaign.targeting_city ?? "no specific city"}
Ad quality score: ${campaign.creative_score ?? "not scored"}/100
Performance so far: ${performance ? `₹${performance.spend} spent, ${performance.leads} leads, ${performance.impressions} impressions, ${performance.clicks} clicks, cost per lead ${performance.cost_per_lead ?? "not yet calculable"}` : "no data yet"}

Write 3-4 plain-language sentences: what's working, what isn't, and one concrete next step. No jargon like CTR/CPM — describe things in terms a non-marketer understands (e.g. "getting plenty of clicks but few are becoming leads" instead of "low conversion rate"). Return plain text, no JSON, no markdown.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: promptContent }],
      }),
    });
    if (!response.ok) return fallback;
    const bodyText = await response.text();
    if (!bodyText.trim()) return fallback;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "explain_campaign", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    return text.trim() || fallback;
  } catch (err: any) {
    console.error("[reporting-agent] explainCampaign error:", err.message);
    return fallback;
  }
}
