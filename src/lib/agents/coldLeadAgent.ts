// ------------------------------------------------------------------
// Cold-lead detection — master audit Part B.
// ------------------------------------------------------------------
// The definition (non-converted lead, created more than COLD_LEAD_DAYS
// ago) previously lived only inline inside
// /api/retargeting/segments/route.ts, computed purely on-demand.
// Extracted here so that route and the daily cron's proactive-push
// step call the exact same query instead of two copies drifting.
// ------------------------------------------------------------------

import { emitNotification } from "@/lib/notifications/emit";

export const COLD_LEAD_DAYS = 14;

export interface ColdLead {
  id: string;
  name: string;
  created_at: string;
}

export async function getColdLeads(supabase: any, dealershipId: string): Promise<ColdLead[]> {
  const coldCutoff = new Date(Date.now() - COLD_LEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id, name, created_at")
    .eq("dealership_id", dealershipId)
    .neq("status", "converted")
    .lt("created_at", coldCutoff);
  return data ?? [];
}

// Cron step — proactive push for leads that just crossed into "cold".
// Same dedupe philosophy as notifyAtRiskCustomers: dedupe_key has no
// date component, so a lead is notified only the first time it goes
// cold, never repeatedly while it stays cold.
export async function notifyColdLeads(supabase: any, dealershipId: string): Promise<number> {
  const coldLeads = await getColdLeads(supabase, dealershipId);
  let attempted = 0;
  for (const lead of coldLeads) {
    await emitNotification(supabase, {
      dealershipId,
      kind: "lead_going_cold",
      title: `${lead.name} has gone cold`,
      body: `No status change in ${COLD_LEAD_DAYS}+ days — worth a follow-up before it's forgotten.`,
      href: "/dashboard/retargeting",
      dedupeKey: `cold_lead:${lead.id}`,
    });
    attempted++;
  }
  return attempted;
}
