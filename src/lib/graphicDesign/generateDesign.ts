// Generating one paid graphic, callable from more than the route.
//
// G-3 STEP 1a. This is a straight extraction out of
// src/app/api/graphic-design/generate/route.ts with NO behaviour change
// — same order, same checks, same messages, same return shape. It exists
// so the approvals route can run the work server-side without calling
// the app over HTTP, which gets a Vercel 508 after about four hops and
// is the pattern this codebase already rebuilt away from once.
//
// WHY AN EXTRACTION AND NOT A SHARED HELPER THE ROUTE DID NOT HAVE
// BEFORE: every check here must keep running on the money path. The
// plan cap, the feature hold and the claims strip were all placed in the
// route deliberately, because "the chat's button calls this endpoint, so
// checking it only in the chat tool would leave the spending path open".
// Moving them out of the route and leaving the route to re-implement
// them is how that comment stops being true.

import { createServiceClient } from "@/lib/supabase/service";
import { generateGraphic } from "@/lib/agents/graphicDesignAgent";
import { checkAndRecordGenerationUsage, generationLimitMessage } from "@/lib/usage/generationLimits";
import { isFeatureEnabled, unavailableMessage } from "@/lib/featureFlags";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { stripUnsupported } from "@/lib/claims/claimCheck";

export type DesignResult =
  | { ok: true; url: string; id: string | null; leftOut?: string[] }
  | { ok: false; status: number; error: string; unavailable?: true; limitReached?: true };

/**
 * The whole job, in the order the route always did it.
 *
 * The feature hold comes first, then the plan cap — which RECORDS usage,
 * so it must not run for a request the hold would have refused anyway.
 */
export async function generateDesign(
  supabase: any,
  dealershipId: string,
  input: { designType: string; prompt?: string | null }
): Promise<DesignResult> {
  // The hold, enforced where the money is actually spent. The chat's
  // button reaches this code, so checking it only in the chat tool would
  // leave the spending path open.
  if (!isFeatureEnabled("graphicDesign")) {
    return { ok: false, status: 403, error: unavailableMessage("graphicDesign"), unavailable: true };
  }
  if (!input.designType) return { ok: false, status: 400, error: "designType required" };

  const usage = await checkAndRecordGenerationUsage(dealershipId, "image");
  if (!usage.allowed) return { ok: false, status: 429, error: generationLimitMessage(usage), limitReached: true };

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("dealership_name, business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  try {
    // THE FACTS WERE MISSING ON THIS PATH once.
    //
    // Without them buildImageBrief has nothing to anchor to and
    // productDepictionFor returns "not_applicable", so the guard that
    // stops an invented product being drawn (src/lib/claims/imageBrief)
    // did not apply here at all — only in chat. Both paths reach the
    // same generator; both hand it the same facts.
    const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
    // The image model paints the brief's words onto the picture, so an
    // unbacked claim in the brief becomes an unbacked claim on a
    // graphic. Chat already strips them before quoting; this runs again
    // because the prompt arrives in a request body, and this is the call
    // that spends the money.
    const brief = facts
      ? stripUnsupported(input.prompt ?? "", facts)
      : { text: input.prompt ?? "", removed: [] as string[] };
    const buffer = await generateGraphic(
      input.designType,
      dealership?.dealership_name ?? "the business",
      dealership?.business_category ?? "business",
      brief.text,
      brandProfile,
      { supabase, dealershipId },
      null,
      null,
      facts
    );
    const serviceClient = createServiceClient();
    const filePath = `graphic-designs/${dealershipId}/${input.designType}-${Date.now()}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, buffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    const { data: saved } = await supabase
      .from("graphic_designs")
      .insert({ dealership_id: dealershipId, design_type: input.designType, prompt: brief.text, image_url: publicUrlData.publicUrl })
      .select()
      .single();

    return {
      ok: true,
      url: publicUrlData.publicUrl,
      id: saved?.id ?? null,
      ...(brief.removed.length ? { leftOut: brief.removed } : {}),
    };
  } catch (err: any) {
    return { ok: false, status: 500, error: err.message };
  }
}
