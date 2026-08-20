// Business Brain — Phase 1 piece 2 of the AI Communication Employee
// foundation. A single, channel-agnostic place to assemble "what do we
// actually know about this business" — consumed by the calling path
// (vapiCallAgent.ts, the inbound assistant-request webhook) and, as of
// P1 5a, chat (masterBrainV2.ts) too — this is the "fast-follow"
// migration this file's own comment used to describe as pending.
//
// team/brandVoice/memories were previously duplicated in
// masterBrainV2.ts's own getContext() (a second, separate query
// against the same dealerships/brand_profiles tables plus its own
// team_members/business_memory fetch) — folded in here instead of
// left as two independently-maintained implementations. All three are
// optional-shaped (empty array / null) so the calling path, which
// never needed them, is unaffected by their presence.
//
// memories is dealership-wide by default, matching the pre-5a
// behavior exactly — pass leadId to scope it to one lead's history via
// getLeadMemory (P1 4a) instead, which the outbound call path uses.

import type { BrandVoiceProfile } from "../agents/brandVoice";
import { getLeadMemory } from "../businessMemory/getLeadMemory";

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
  brandVoice: BrandVoiceProfile | null;
  team: { id: string; role: string; email: string }[];
  memories: string[];
}

export async function getKnowledgeFacts(supabase: any, dealershipId: string): Promise<KnowledgeFact[]> {
  const { data } = await supabase
    .from("business_knowledge")
    .select("category, title, content")
    .eq("dealership_id", dealershipId)
    .eq("is_active", true);
  return data ?? [];
}

export async function getBusinessContext(supabase: any, dealershipId: string, leadId?: string): Promise<BusinessContext> {
  const [{ data: dealership }, { data: brandProfile }, knowledgeFacts, { data: team }, memories] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, brand_voice").eq("dealership_id", dealershipId).maybeSingle(),
    getKnowledgeFacts(supabase, dealershipId),
    supabase.from("team_members").select("id, role, email").eq("dealership_id", dealershipId).eq("status", "active"),
    leadId
      ? getLeadMemory(supabase, dealershipId, leadId)
      // Most recent 20 — an old, stale memory naturally falls out of
      // context rather than the list growing unbounded forever.
      : supabase.from("business_memory").select("insight").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20).then((r: any) => (r.data ?? []).map((row: any) => row.insight)),
  ]);

  return {
    id: dealershipId,
    name: dealership?.dealership_name ?? "the business",
    category: dealership?.business_category ?? "business",
    city: dealership?.city ?? null,
    toneOfVoice: brandProfile?.tone_of_voice ?? null,
    knowledgeFacts,
    brandVoice: brandProfile?.brand_voice ?? null,
    team: team ?? [],
    memories,
  };
}
