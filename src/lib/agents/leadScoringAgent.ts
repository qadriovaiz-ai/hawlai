// ------------------------------------------------------------------
// AI-Intelligence Pillar 3 — predicted lead conversion score.
// ------------------------------------------------------------------
// Separate from leads.ai_score, which is a static, one-time intake
// estimate (vehicle age/budget/phone, set once at creation via
// qualifyLead()). This is a behavioral score that changes as the
// lead's real activity unfolds — how fast they were contacted, how
// engaged they've been, how the calls actually went, whether an
// appointment got booked, and how stale they've gone.
//
// Rule-based and deterministic, not statistical/ML — with most
// dealerships likely having dozens to low-hundreds of leads, there
// isn't enough labeled outcome data (converted/not_interested) per
// dealership to train a real model without overfitting, and a pooled
// cross-dealership model is a much bigger, separate initiative (data
// sharing, model hosting infra this app doesn't have). Same paradigm
// as qualifyLead() in ai-engine.ts: explainable, zero training data
// needed, works from day one.
// ------------------------------------------------------------------

import { COLD_LEAD_DAYS } from "./coldLeadAgent";

const RESOLVED_STATUSES = ["converted", "not_interested"];

export interface LeadScoringSignals {
  status: string;
  createdAt: string;
  leadTemperature: string | null; // reflects the latest call outcome once one exists, not just intake
  firstContactAt: string | null;
  touchpointCount: number;
  hasAppointment: boolean;
}

export function scoreLeadConversionLikelihood(signals: LeadScoringSignals): number {
  let score = 20; // baseline — an uncontacted lead isn't zero-likelihood, just unknown

  if (signals.firstContactAt) {
    const hoursToContact = (new Date(signals.firstContactAt).getTime() - new Date(signals.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursToContact <= 1) score += 25;
    else if (hoursToContact <= 24) score += 15;
    else if (hoursToContact <= 72) score += 5;
    // slower than 3 days: no bonus, but no penalty either — being slow isn't itself disqualifying
  }

  if (signals.leadTemperature === "hot") score += 25;
  else if (signals.leadTemperature === "warm") score += 10;
  else if (signals.leadTemperature === "cold") score -= 10;

  score += Math.min(signals.touchpointCount * 8, 20);

  if (signals.hasAppointment) score += 20;

  const daysSinceCreated = (Date.now() - new Date(signals.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreated > COLD_LEAD_DAYS && ["new", "ready_to_call"].includes(signals.status)) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Cron step — recomputes predicted_conversion_score for every
// unresolved lead. Only ever touches leads still in the funnel;
// once a lead is converted or marked not_interested, the prediction
// is moot and the score is left as whatever it last was.
export async function scoreActiveLeads(supabase: any, dealershipId: string): Promise<number> {
  const { data: leads } = await supabase
    .from("leads")
    .select("id, status, created_at, lead_temperature")
    .eq("dealership_id", dealershipId)
    .not("status", "in", `(${RESOLVED_STATUSES.join(",")})`);

  if (!leads || leads.length === 0) return 0;

  const leadIds = leads.map((l: { id: string }) => l.id);

  const [{ data: calls }, { data: touchpoints }, { data: appointments }] = await Promise.all([
    supabase.from("calls").select("lead_id, created_at").in("lead_id", leadIds),
    supabase.from("lead_touchpoints").select("lead_id").in("lead_id", leadIds),
    supabase.from("appointments").select("lead_id").in("lead_id", leadIds),
  ]);

  const firstContactByLead = new Map<string, string>();
  for (const c of calls ?? []) {
    const existing = firstContactByLead.get(c.lead_id);
    if (!existing || c.created_at < existing) firstContactByLead.set(c.lead_id, c.created_at);
  }
  const touchpointCountByLead = new Map<string, number>();
  for (const t of touchpoints ?? []) {
    touchpointCountByLead.set(t.lead_id, (touchpointCountByLead.get(t.lead_id) ?? 0) + 1);
  }
  const leadsWithAppointment = new Set((appointments ?? []).map((a: { lead_id: string }) => a.lead_id));

  let updated = 0;
  for (const lead of leads) {
    const score = scoreLeadConversionLikelihood({
      status: lead.status,
      createdAt: lead.created_at,
      leadTemperature: lead.lead_temperature,
      firstContactAt: firstContactByLead.get(lead.id) ?? null,
      touchpointCount: touchpointCountByLead.get(lead.id) ?? 0,
      hasAppointment: leadsWithAppointment.has(lead.id),
    });
    const { error } = await supabase.from("leads").update({ predicted_conversion_score: score }).eq("id", lead.id);
    if (!error) updated++;
  }
  return updated;
}
