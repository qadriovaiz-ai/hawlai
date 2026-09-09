import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateAdPlan, buildFinalCreativeImage } from "@/lib/adEngine";
import { previewPersonaSummary } from "@/lib/ads/metaTargeting";
import { getAdAccountLimits, clampBudgetToMinimum, describeMinimum, isAccountUsable } from "@/lib/ads/adAccountLimits";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";

// Phase 1 of the two-phase launch flow (Block 2 — Plan Card): generates
// the ad copy + finished creative image and saves it as a draft, WITHOUT
// touching Meta at all. The dealer reviews this before anything is
// spent or published. Phase 2 (/api/ads/adlaunch with draft_id) takes
// over from here and only does the actual Meta API calls.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { photo_base64, prompt, image_mode } = await request.json();
  if (!photo_base64) return NextResponse.json({ error: "Upload a photo first" }, { status: 400 });
  if (!prompt || prompt.trim().length < 10) return NextResponse.json({ error: "Add a bit more detail to the requirement" }, { status: 400 });

  const match = String(photo_base64).match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64;
  const inputBuffer = Buffer.from(rawBase64, "base64");

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("business_category, city, fb_ad_account_id, fb_page_access_token, fb_page_access_token_encrypted, fb_min_daily_budget, fb_currency, fb_account_status, fb_limits_checked_at")
    .eq("id", dealershipId)
    .single();

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, target_persona, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const businessCategory = dealership?.business_category ?? "small business";
  const plan = await generateAdPlan(prompt, brandProfile, businessCategory, { supabase, dealershipId }, dealership?.city ?? null);

  const serviceClient = createServiceClient();

  const { data: draft, error: insertError } = await serviceClient
    .from("ad_creatives")
    .insert({
      dealership_id: dealershipId,
      mode: image_mode === "ai_generate" ? "ai_generate" : "template",
      prompt,
      background_style: plan.background_style,
      headline: plan.headline,
      body_copy: plan.body,
      creative_score: plan.confidence_score ?? null,
      score_reasoning: plan.score_reasoning ?? null,
      plan_json: plan,
      status: "draft",
    })
    .select()
    .single();

  if (insertError || !draft) return NextResponse.json({ error: insertError?.message ?? "Couldn't save draft" }, { status: 500 });

  try {
    const finalBuffer = await buildFinalCreativeImage(image_mode, inputBuffer, rawBase64, mimeType, plan, businessCategory);

    const filePath = `${dealershipId}/${draft.id}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, finalBuffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    const { data: updated } = await serviceClient
      .from("ad_creatives")
      .update({ generated_image_url: publicUrlData.publicUrl })
      .eq("id", draft.id)
      .select()
      .single();

    // Pure/no-network preview of what targeting will be attempted at
    // launch (real-persona-targeting piece) — kept out of this route's
    // Meta-free design (see this file's own header) by never calling
    // Meta's search API here; the fully resolved version with real
    // interest names comes back from /api/ads/adlaunch instead.
    const targetingPreview = previewPersonaSummary(brandProfile?.target_persona ?? null, businessCategory);

    // LAYER 3c — the merchant sees the account's real floor HERE, on
    // the card they approve, not as a rejected ad set later and never
    // by going to look it up on Meta.
    //
    // getAdAccountLimits refreshes only when the cached reading is
    // stale, and returns the cached one if Meta cannot be reached —
    // this route's Meta-free design (see the header) is preserved in
    // the common case, and a lookup failure never blocks a preview.
    const limits = await getAdAccountLimits(supabase, dealershipId, {
      row: dealership ?? undefined,
      token: readMetaPageToken(dealership),
    });
    const requestedMinor = Math.round((plan.daily_budget ?? 500) * 100);
    const budget = clampBudgetToMinimum(requestedMinor, limits.minDailyBudget);
    const account = isAccountUsable(limits.accountStatus);

    return NextResponse.json({
      draft: updated,
      plan,
      targetingPreview,
      // Everything the approver needs to judge the spend, stated before
      // they approve rather than discovered after.
      budget: {
        proposed_minor: requestedMinor,
        will_apply_minor: budget.minor,
        raised_to_minimum: budget.raised,
        account_minimum: describeMinimum(limits),
        currency: limits.currency,
      },
      account: { usable: account.usable, reason: account.reason },
    });
  } catch (err: any) {
    await serviceClient.from("ad_creatives").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
