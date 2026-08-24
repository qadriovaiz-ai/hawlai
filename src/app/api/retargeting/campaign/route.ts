import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { generateAdPlan } from "@/lib/adEngine";

// One-click retargeting campaign — piece 6/7.
//
// Deliberately produces a DRAFT, not a live campaign. It reuses the
// existing two-phase ad flow (preview -> /api/ads/adlaunch) rather
// than launching directly, which means every safety property already
// built stays intact: the campaign is created PAUSED, activation is
// separately approval-gated (P0 10b), and spend still needs authority.
//
// A genuinely one-click LIVE ad spending real money would have quietly
// bypassed all of that, so "one click" here means one click to a
// ready-to-review draft.

const OFFER_ANGLES: Record<string, { label: string; brief: (offer: string) => string }> = {
  abandoned_cart: {
    label: "Left something in their cart",
    brief: (offer) =>
      `A retargeting ad for people who added something to their cart but didn't complete the order. Acknowledge they were interested, remove hesitation, and give a clear reason to come back now. ${offer}`,
  },
  viewed_no_purchase: {
    label: "Looked but didn't buy",
    brief: (offer) =>
      `A retargeting ad for people who browsed products but didn't buy. Re-introduce the value, address the most likely doubt, and invite them back. ${offer}`,
  },
  buyers: {
    label: "Existing customers",
    brief: (offer) =>
      `An ad for people who have already bought once. Thank them implicitly, and give a reason to buy again — not a first-time-buyer pitch. ${offer}`,
  },
  buyers_lookalike: {
    label: "People similar to your customers",
    brief: (offer) =>
      `An ad for new people who behave like existing customers but have never bought. They don't know the business yet, so lead with what makes it worth trying. ${offer}`,
  },
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { audienceKey, discountPercent, customOffer } = await request.json();
  const angle = OFFER_ANGLES[audienceKey];
  if (!angle) return NextResponse.json({ error: "Unknown audience" }, { status: 400 });

  const service = createServiceClient();

  // The audience must already exist in Meta — otherwise the draft
  // couldn't be launched against it, and offering the flow would be
  // setting the dealer up to fail at the last step.
  const { data: audience } = await service
    .from("meta_custom_audiences")
    .select("meta_audience_id, sync_status")
    .eq("dealership_id", dealershipId)
    .eq("audience_key", audienceKey)
    .maybeSingle();

  if (!audience?.meta_audience_id || audience.sync_status !== "synced") {
    return NextResponse.json(
      { error: "Create this audience in Meta first — the panel above does it in one click." },
      { status: 400 }
    );
  }

  const [{ data: dealership }, { data: brandProfile }] = await Promise.all([
    supabase.from("dealerships").select("business_category").eq("id", dealershipId).single(),
    supabase.from("brand_profiles").select("tone_of_voice, target_persona, messaging_pillars, preferred_language").eq("dealership_id", dealershipId).maybeSingle(),
  ]);

  // The offer is stated as a real instruction rather than left to the
  // model to invent — an ad promising a discount the business never
  // agreed to is a genuine commercial problem, not just bad copy.
  const pct = Number(discountPercent);
  const offerText =
    typeof customOffer === "string" && customOffer.trim()
      ? `The offer to feature is exactly: "${customOffer.trim()}". Do not invent any other discount or promise.`
      : Number.isFinite(pct) && pct > 0 && pct <= 90
      ? `Feature exactly a ${Math.round(pct)}% discount. Do not invent any other discount, free shipping, or promise beyond that.`
      : `Do NOT promise any discount, free shipping, or offer — none has been authorised. Persuade on value alone.`;

  const plan = await generateAdPlan(
    angle.brief(offerText),
    brandProfile,
    dealership?.business_category ?? "business",
    { supabase, dealershipId }
  );

  // Saved as a draft in the same table the normal ad flow uses, so it
  // flows through preview -> launch -> approval identically. No
  // creative image yet: the dealer picks that in the launch screen,
  // same as any other ad.
  const { data: draft, error } = await service
    .from("ad_creatives")
    .insert({
      dealership_id: dealershipId,
      mode: "template",
      prompt: angle.brief(offerText),
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

  if (error || !draft) return NextResponse.json({ error: error?.message ?? "Couldn't create the draft" }, { status: 500 });

  return NextResponse.json({
    success: true,
    draft,
    plan,
    audienceKey,
    // The caller passes this to /api/ads/adlaunch so the campaign
    // targets the audience rather than a cold demographic.
    retargetAudienceKey: audienceKey,
    note: "Draft created. Review it, add a photo, then launch — the campaign is created paused and activation still needs approval.",
  });
}
