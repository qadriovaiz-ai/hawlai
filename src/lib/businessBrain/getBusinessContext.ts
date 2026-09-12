// Business Brain — "what do we actually know about this business",
// assembled once for the calling path (vapiCallAgent.ts, the inbound
// assistant-request webhook), chat (masterBrainV2.ts), the website chat
// widget and DM auto-replies.
//
// The facts themselves now come from the canonical source
// (src/lib/claims/businessFacts.ts) rather than this file's own queries:
// the same products, prices, offers, shipping and Business Knowledge
// that the claims guard checks copy against and that image briefs are
// anchored to. Before that, this file knew the business's name, category
// and knowledge but nothing about what it SELLS, while five other paths
// each fetched the catalogue their own way.
//
// This module still owns what is genuinely its own: the team roster and
// the AI's memory of past conversations.
//
// memories is dealership-wide by default — pass leadId to scope it to
// one lead's history via getLeadMemory (P1 4a), which the outbound call
// path uses.

import type { BrandVoiceProfile } from "../agents/brandVoice";
import { getLeadMemory } from "../businessMemory/getLeadMemory";
import { gatherBusinessFactsSafely, fetchKnowledgeFacts, UNKNOWN_CATEGORY, type BusinessFacts, type KnowledgeFact } from "../claims/businessFacts";

export type { KnowledgeFact };

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
  /**
   * The canonical facts — products with photos and stock, live offers,
   * shipping, counts. Null only when they couldn't be read at all;
   * callers that publish or send unreviewed treat that as "don't".
   */
  facts: BusinessFacts | null;
}

/** The owner's own stated facts. Kept here for existing callers; the query lives in businessFacts. */
export async function getKnowledgeFacts(supabase: any, dealershipId: string): Promise<KnowledgeFact[]> {
  return fetchKnowledgeFacts(supabase, dealershipId);
}

export async function getBusinessContext(supabase: any, dealershipId: string, leadId?: string): Promise<BusinessContext> {
  const [facts, { data: team }, memories] = await Promise.all([
    gatherBusinessFactsSafely(supabase, dealershipId),
    supabase.from("team_members").select("id, role, email").eq("dealership_id", dealershipId).eq("status", "active"),
    leadId
      ? getLeadMemory(supabase, dealershipId, leadId)
      // Most recent 20 — an old, stale memory naturally falls out of
      // context rather than the list growing unbounded forever.
      : supabase.from("business_memory").select("insight").eq("dealership_id", dealershipId).order("created_at", { ascending: false }).limit(20).then((r: any) => (r.data ?? []).map((row: any) => row.insight)),
  ]);

  // The facts read is one query set; if it fails wholesale (never
  // expected — every individual read inside it is already error-checked)
  // the identity fields still come back, so a live call or a DM reply
  // doesn't lose the business's name mid-conversation.
  if (!facts) {
    const [{ data: dealership }, { data: brandProfile }, knowledgeFacts] = await Promise.all([
      supabase.from("dealerships").select("dealership_name, business_category, city").eq("id", dealershipId).single(),
      supabase.from("brand_profiles").select("tone_of_voice, brand_voice").eq("dealership_id", dealershipId).maybeSingle(),
      fetchKnowledgeFacts(supabase, dealershipId),
    ]);
    return {
      id: dealershipId,
      name: dealership?.dealership_name ?? "the business",
      category: dealership?.business_category || UNKNOWN_CATEGORY,
      city: dealership?.city ?? null,
      toneOfVoice: brandProfile?.tone_of_voice ?? null,
      knowledgeFacts,
      brandVoice: brandProfile?.brand_voice ?? null,
      team: team ?? [],
      memories,
      facts: null,
    };
  }

  return {
    id: dealershipId,
    name: facts.businessName,
    category: facts.category,
    city: facts.city,
    toneOfVoice: facts.brand.tone,
    knowledgeFacts: facts.ownerFacts,
    brandVoice: facts.brand.voice,
    team: team ?? [],
    memories,
    facts,
  };
}
