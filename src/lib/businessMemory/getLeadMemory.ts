// P1 4a — business_memory has carried related_entity_type/id since
// migration 102 (outcomeInsights.ts writes "lead"/lead.id on every
// insight), but nothing has ever queried by it — every reader so far
// (masterBrainV2's getContext) pulls the flat, unfiltered, dealership-
// wide feed. This is the first per-entity read, scoped to what a live
// call actually needs: what do we already know about THIS lead.

export async function getLeadMemory(supabase: any, dealershipId: string, leadId: string, limit = 5): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("business_memory")
      .select("insight")
      .eq("dealership_id", dealershipId)
      .eq("related_entity_type", "lead")
      .eq("related_entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((row: any) => row.insight);
  } catch {
    return [];
  }
}
