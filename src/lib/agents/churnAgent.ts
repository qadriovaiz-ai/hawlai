// ------------------------------------------------------------------
// Churn/at-risk detection — master audit Part B.
// ------------------------------------------------------------------
// This logic used to live only inline inside retention/page.tsx,
// computed purely on-demand when a dealer happened to open that page.
// Extracted here so the page and the daily cron's proactive-push step
// call the exact same computation instead of two copies drifting.
//
// Risk is derived from real recency (no AI call, no new schema): a
// customer's last interaction is the latest of their conversion date,
// their most recent call, and their most recent PAST appointment (a
// booking three weeks out isn't contact that has happened yet).
// ------------------------------------------------------------------

import { emitNotification } from "@/lib/notifications/emit";

export const AT_RISK_DAYS = 90;
export const WATCH_DAYS = 45;

export function riskTier(daysSince: number): { label: string; tone: string } {
  if (daysSince >= AT_RISK_DAYS) return { label: "At risk", tone: "bg-red-500/10 text-red-500 border-red-400/30" };
  if (daysSince >= WATCH_DAYS) return { label: "Watch", tone: "bg-amber-500/10 text-amber-600 border-amber-400/30" };
  return { label: "Recent", tone: "bg-emerald-500/10 text-emerald-600 border-emerald-400/30" };
}

export interface CustomerRisk {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  touchedAt: string;
  daysSince: number;
  risk: { label: string; tone: string };
}

export async function getCustomerRiskList(supabase: any, dealershipId: string): Promise<CustomerRisk[]> {
  const { data: convertedLeads } = await supabase
    .from("leads")
    .select("id, name, phone, vehicle, created_at")
    .eq("dealership_id", dealershipId)
    .eq("status", "converted")
    .order("created_at", { ascending: false });

  const leadIds = (convertedLeads ?? []).map((c: any) => c.id);
  const [{ data: calls }, { data: appointments }] = leadIds.length
    ? await Promise.all([
        supabase.from("calls").select("lead_id, created_at").in("lead_id", leadIds),
        supabase.from("appointments").select("lead_id, appointment_date").in("lead_id", leadIds),
      ])
    : [{ data: [] }, { data: [] }];

  const lastTouch = new Map<string, string>();
  const bump = (leadId: string, when: string | null) => {
    if (!when) return;
    const current = lastTouch.get(leadId);
    if (!current || when > current) lastTouch.set(leadId, when);
  };
  for (const c of convertedLeads ?? []) bump(c.id, c.created_at);
  for (const c of calls ?? []) bump(c.lead_id, c.created_at);
  const nowIso = new Date().toISOString();
  for (const a of appointments ?? []) if (a.appointment_date <= nowIso) bump(a.lead_id, a.appointment_date);

  return (convertedLeads ?? [])
    .map((c: any) => {
      const touchedAt = lastTouch.get(c.id) ?? c.created_at;
      const daysSince = Math.floor((Date.now() - new Date(touchedAt).getTime()) / 86400000);
      return { id: c.id, name: c.name, phone: c.phone, vehicle: c.vehicle, touchedAt, daysSince, risk: riskTier(daysSince) };
    })
    .sort((a: CustomerRisk, b: CustomerRisk) => b.daysSince - a.daysSince);
}

// Cron step — proactive push for customers who just crossed into
// At Risk. dedupe_key has no date component: a lead is notified only
// the first time it ever crosses the threshold, never again, even if
// it later re-engages and lapses a second time. Avoids daily re-spam
// at the cost of staying silent on a genuine second lapse — the
// accepted tradeoff for this first pass.
export async function notifyAtRiskCustomers(supabase: any, dealershipId: string): Promise<number> {
  const customers = await getCustomerRiskList(supabase, dealershipId);
  let attempted = 0;
  for (const c of customers) {
    if (c.daysSince < AT_RISK_DAYS) continue;
    await emitNotification(supabase, {
      dealershipId,
      kind: "customer_at_risk",
      title: `${c.name} hasn't been contacted in ${c.daysSince} days`,
      body: "Crossed the at-risk threshold — consider a service reminder, referral ask, or upsell message.",
      href: "/dashboard/retention",
      dedupeKey: `at_risk:${c.id}`,
    });
    attempted++;
  }
  return attempted;
}
