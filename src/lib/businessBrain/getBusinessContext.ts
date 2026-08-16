// Business Brain — Phase 1 piece 2 of the AI Communication Employee
// foundation. A single, channel-agnostic place to assemble "what do we
// actually know about this business" — today consumed by the calling
// path (vapiCallAgent.ts, the inbound assistant-request webhook),
// eventually by chat (masterBrainV2.ts) and WhatsApp too.
//
// Deliberately scoped to only what's truly channel-agnostic (name,
// category, city, tone, knowledge facts) — call-specific config
// (vapi_assistant_id, custom_call_instructions) stays fetched by the
// calling adapter itself, and masterBrainV2.ts's own getContext()
// (team members, business_memory, structured brand voice) is richer
// than any channel needs today and is intentionally NOT folded in here
// yet — this migrates calls first, chat stays on its current
// implementation as a fast-follow, per the approved incremental plan.

export interface KnowledgeFact {
  category: string;
  title: string;
  content: string;
}

export interface BusinessContext {
  id: string;
  name: string;
  category: string;
  city: string | null;
  toneOfVoice: string | null;
  knowledgeFacts: KnowledgeFact[];
}

export async function getKnowledgeFacts(supabase: any, dealershipId: string): Promise<KnowledgeFact[]> {
  const { data } = await supabase
    .from("business_knowledge")
    .select("category, title, content")
    .eq("dealership_id", dealershipId)
    .eq("is_active", true);
  return data ?? [];
}

export async function getBusinessContext(supabase: any, dealershipId: string): Promise<BusinessContext> {
  const [{ data: dealership }, { data: brandProfile }, knowledgeFacts] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
    getKnowledgeFacts(supabase, dealershipId),
  ]);

  return {
    id: dealershipId,
    name: dealership?.dealership_name ?? "the business",
    category: dealership?.business_category ?? "business",
    city: dealership?.city ?? null,
    toneOfVoice: brandProfile?.tone_of_voice ?? null,
    knowledgeFacts,
  };
}
