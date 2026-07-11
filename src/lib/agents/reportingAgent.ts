// ------------------------------------------------------------------
// Reporting Agent — Phase 1 basic version
// ------------------------------------------------------------------
// Pulls together what every other agent has produced (leads, pipeline
// stages, campaigns, approvals, spend) and asks Claude to turn it into
// a short, plain-language summary — the kind of update a human CMO
// would give a founder who doesn't have time to read every dashboard.
// ------------------------------------------------------------------

import { getCampaignPerformance } from "./analyticsAgent";

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

async function summarizeWithClaude(stats: ReportStats, businessCategory: string): Promise<{ summary: string; priorities: string[] }> {
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
  const { summary, priorities } = await summarizeWithClaude(stats, businessCategory);
  return { stats, summary, priorities };
}
