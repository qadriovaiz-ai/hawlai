// Everything channelFit and the simulator need, read once
// (Brain, Phase 3 surfacing).
//
// Lives in its own file because two callers need it — the chat tool and
// the Strategy page — and two callers assembling their own inputs would
// quietly answer the same question differently. The same mistake the AEO
// question set nearly made.

import { loadDiagnosis } from "./diagnosis";
import { topQueries } from "@/lib/seo/searchQueries";
import type { FitInput } from "./channelFit";

export async function loadFitInput(supabase: any, dealershipId: string, city: string | null): Promise<FitInput> {
  const [diagnosis, queries, { data: products }, { data: dealership }, { count: leads }, { count: customers }] = await Promise.all([
    loadDiagnosis(supabase, dealershipId),
    topQueries(supabase, dealershipId, 50),
    supabase.from("products").select("name, images, price, kind").eq("dealership_id", dealershipId).eq("is_active", true),
    supabase.from("dealerships").select("fb_page_id, search_console_site_url").eq("id", dealershipId).maybeSingle(),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("dealership_id", dealershipId).neq("status", "cancelled"),
  ]);

  return {
    diagnosis,
    queries,
    catalogue: (products ?? []).map((p: any) => ({
      name: p.name,
      images: Array.isArray(p.images) ? p.images : [],
      price: Number(p.price) || 0,
      kind: p.kind ?? null,
    })),
    city,
    connected: {
      meta: Boolean(dealership?.fb_page_id),
      // Hawlai sends marketing email from its own verified domain, so
      // this needs nothing connected per business.
      email: true,
      // Drafts only — there is no WhatsApp send capability anywhere, and
      // channelFit says so in its own words.
      whatsapp: true,
      searchConsole: Boolean(dealership?.search_console_site_url),
    },
    contacts: { leads: Number(leads) || 0, customers: Number(customers) || 0 },
  };
}
