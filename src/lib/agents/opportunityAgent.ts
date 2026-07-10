// ------------------------------------------------------------------
// Opportunity Agent — "push, not pull"
// ------------------------------------------------------------------
// Detects real issues from actual data (stuck leads, pending
// approvals, no active campaigns, missing brand voice, Optimization
// Agent recommendations) and syncs them into the `opportunities`
// table as a todo-style feed. Rule-based and deterministic on
// purpose — no Claude call needed here, so it's fast and always
// available even if the AI API has issues, unlike the agents that
// generate content.
//
// Call syncOpportunities() before reading the feed (e.g. on
// Dashboard load) so it reflects current data — it upserts new
// issues and auto-resolves ones that no longer apply.
// ------------------------------------------------------------------

import { analyzeCampaigns } from "./optimizationAgent";

interface Candidate {
  type: string;
  reference_id?: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  action_href?: string;
}

async function detectCandidates(supabase: any, dealershipId: string): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  const [{ data: leads }, { data: approvals }, { data: campaigns }, { data: brandProfile }] = await Promise.all([
    supabase.from("leads").select("id, name, status, created_at").eq("dealership_id", dealershipId),
    supabase.from("pending_approvals").select("id").eq("dealership_id", dealershipId).eq("status", "pending"),
    supabase.from("ad_creatives").select("id").eq("dealership_id", dealershipId).eq("status", "launched"),
    supabase.from("brand_profiles").select("id").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  // 1. Leads sitting untouched for 2+ days
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const stuckLeads = (leads ?? []).filter(
    (l: any) => ["new", "ready_to_call"].includes(l.status) && new Date(l.created_at) < twoDaysAgo
  );
  if (stuckLeads.length > 0) {
    candidates.push({
      type: "stuck_leads",
      title: `${stuckLeads.length} lead${stuckLeads.length > 1 ? "s" : ""} waiting 2+ days with no follow-up`,
      description: stuckLeads.slice(0, 3).map((l: any) => l.name).join(", ") + (stuckLeads.length > 3 ? "..." : ""),
      priority: "high",
      action_href: "/dashboard/queue",
    });
  }

  // 2. Pending approvals
  if ((approvals?.length ?? 0) > 0) {
    candidates.push({
      type: "pending_approvals",
      title: `${approvals!.length} action${approvals!.length > 1 ? "s" : ""} waiting for your approval`,
      priority: "high",
      action_href: "/dashboard/approvals",
    });
  }

  // 3. No campaigns launched yet
  if ((campaigns?.length ?? 0) === 0) {
    candidates.push({
      type: "no_campaigns",
      title: "No campaigns launched yet — launch your first ad to start getting leads",
      priority: "medium",
      action_href: "/dashboard/ads/full-launch",
    });
  }

  // 4. No brand voice set
  if (!brandProfile) {
    candidates.push({
      type: "no_brand_voice",
      title: "Set your Brand Voice so every generated ad and message matches your brand",
      priority: "low",
      action_href: "/dashboard/settings/brand",
    });
  }

  // 5. Optimization Agent recommendations (scale/pause), if there's real data
  try {
    const optimization = await analyzeCampaigns(supabase, dealershipId);
    for (const rec of optimization.recommendations) {
      if (rec.action === "scale" || rec.action === "pause") {
        candidates.push({
          type: `optimization_${rec.action}`,
          reference_id: rec.campaign_id,
          title: `${rec.action === "scale" ? "Scale up" : "Consider pausing"}: ${rec.headline}`,
          description: rec.reason,
          priority: rec.action === "pause" ? "high" : "medium",
          action_href: "/dashboard/optimization",
        });
      }
    }
  } catch {
    // Optimization data not ready yet — not fatal, just skip this batch.
  }

  return candidates;
}

export async function syncOpportunities(supabase: any, dealershipId: string): Promise<void> {
  const candidates = await detectCandidates(supabase, dealershipId);

  const { data: openOpportunities } = await supabase
    .from("opportunities")
    .select("id, type, reference_id")
    .eq("dealership_id", dealershipId)
    .eq("status", "open");

  const openKeys = new Set((openOpportunities ?? []).map((o: any) => `${o.type}:${o.reference_id}`));
  const candidateKeys = new Set(candidates.map((c) => `${c.type}:${c.reference_id ?? "singleton"}`));

  // Insert anything newly detected that isn't already open.
  const toInsert = candidates.filter((c) => !openKeys.has(`${c.type}:${c.reference_id ?? "singleton"}`));
  if (toInsert.length > 0) {
    await supabase.from("opportunities").insert(
      toInsert.map((c) => ({
        dealership_id: dealershipId,
        type: c.type,
        reference_id: c.reference_id ?? "singleton",
        title: c.title,
        description: c.description ?? null,
        priority: c.priority,
        action_href: c.action_href ?? null,
      }))
    );
  }

  // Auto-resolve open opportunities whose underlying issue no longer applies.
  const toResolve = (openOpportunities ?? []).filter(
    (o: any) => !candidateKeys.has(`${o.type}:${o.reference_id}`)
  );
  if (toResolve.length > 0) {
    await supabase
      .from("opportunities")
      .update({ status: "completed", resolved_at: new Date().toISOString() })
      .in("id", toResolve.map((o: any) => o.id));
  }
}

export async function getOpenOpportunities(supabase: any, dealershipId: string) {
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("status", "open")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return (data ?? []).sort((a: any, b: any) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
