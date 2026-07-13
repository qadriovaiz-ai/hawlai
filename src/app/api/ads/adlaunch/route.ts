import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  generateAdPlan,
  buildFinalCreativeImage,
  metaPost,
  resolveCityKey,
  GRAPH_VERSION,
} from "@/lib/adEngine";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Pull this dealer's own Facebook connection. Falls back to the legacy
  // shared env vars only if the dealer hasn't connected their own Page yet
  // (keeps this working during the transition, but every dealer should
  // eventually go through Settings -> Connect Facebook).
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_access_token, fb_ad_account_id, fb_page_id, fb_lead_form_id, business_category")
    .eq("id", dealershipId)
    .single();

  const pageAccessToken: string | undefined = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  const rawAdAccountId: string = dealership?.fb_ad_account_id ?? process.env.META_AD_ACCOUNT_ID ?? "";
  const adAccount = rawAdAccountId.startsWith("act_") ? rawAdAccountId : `act_${rawAdAccountId}`;
  const pageId: string | undefined = dealership?.fb_page_id ?? process.env.META_PAGE_ID;
  const leadFormId: string | undefined = dealership?.fb_lead_form_id ?? process.env.META_LEAD_FORM_ID;

  if (!pageAccessToken || !rawAdAccountId || !pageId) {
    return NextResponse.json(
      { error: "Facebook Page isn't connected. Go to Settings and connect your Facebook Page first, then launch the ad." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { photo_base64, prompt, image_mode, scheduled_start, destination, draft_id, product_destination_url } = body;
  const adDestination: "instant_form" | "website" = destination === "website" ? "website" : "instant_form";

  if (adDestination === "instant_form" && !leadFormId) {
    return NextResponse.json(
      { error: "No Instant Form connected for this Page. Connect one in Settings, or choose 'Website' as the destination instead." },
      { status: 400 }
    );
  }

  let destinationUrl: string | null = null;
  if (adDestination === "website") {
    // A specific product page (picked via Shopify/WooCommerce in
    // Launch Ad) always wins — that's a more precise destination than
    // a generic homepage/landing page.
    if (product_destination_url) {
      destinationUrl = product_destination_url;
    } else {
      const { data: dealershipUrls } = await supabase
        .from("dealerships")
        .select("external_website_url")
        .eq("id", dealershipId)
        .single();
      if (dealershipUrls?.external_website_url) {
        destinationUrl = dealershipUrls.external_website_url;
      } else {
        const { data: landingPage } = await supabase
          .from("landing_pages")
          .select("slug, published")
          .eq("dealership_id", dealershipId)
          .maybeSingle();
        if (landingPage?.published) {
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hawlai.vercel.app";
          destinationUrl = `${baseUrl}/p/${landingPage.slug}`;
        }
      }
    }
    if (!destinationUrl) {
      return NextResponse.json(
        { error: "No website set up yet. Either add your website URL or publish your landing page in the Website tab first." },
        { status: 400 }
      );
    }
  }

  if (!draft_id) {
    if (!photo_base64) return NextResponse.json({ error: "photo_base64 required" }, { status: 400 });
    if (!prompt || prompt.trim().length < 10) return NextResponse.json({ error: "Prompt is too short, add a bit more detail" }, { status: 400 });
  }

  const match = String(photo_base64 ?? "").match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64 ?? "";
  const inputBuffer = rawBase64 ? Buffer.from(rawBase64, "base64") : Buffer.alloc(0);

  const serviceClient = createServiceClient();

  // Brand Agent — pull the dealer's saved tone/persona/messaging so the
  // ad copy stays consistent with how they want to sound, if they've set one up.
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, target_persona, messaging_pillars, preferred_language")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  // Step 1: plan the ad (copy + targeting + scene) — unless we're
  // launching an already-previewed draft, in which case reuse its
  // saved plan exactly as shown to the dealer, rather than risking
  // Claude generating something slightly different a second time.
  let plan: any;
  let draft: any;

  if (draft_id) {
    const { data: existingDraft, error: draftFetchError } = await serviceClient
      .from("ad_creatives")
      .select("*")
      .eq("id", draft_id)
      .eq("dealership_id", dealershipId)
      .eq("status", "draft")
      .single();

    if (draftFetchError || !existingDraft) {
      return NextResponse.json({ error: "That preview has expired or was already launched — generate a new one." }, { status: 404 });
    }
    if (!existingDraft.plan_json || !existingDraft.generated_image_url) {
      return NextResponse.json({ error: "That preview is incomplete — generate a new one." }, { status: 400 });
    }

    plan = existingDraft.plan_json;
    draft = existingDraft;
  } else {
    plan = await generateAdPlan(prompt, brandProfile, dealership?.business_category ?? "car dealership");

    const { data: newDraft } = await serviceClient
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
    draft = newDraft;
  }

  try {
    // Step 2: build the image — unless launching from an already-
    // previewed draft, in which case reuse that exact image (fetched
    // back from our storage) instead of regenerating it.
    let finalBuffer: Buffer;
    let publicUrlData: { publicUrl: string };

    if (draft_id) {
      const imageRes = await fetch(draft.generated_image_url);
      if (!imageRes.ok) throw new Error("Couldn't retrieve the previewed image — generate a new preview.");
      finalBuffer = Buffer.from(await imageRes.arrayBuffer());
      publicUrlData = { publicUrl: draft.generated_image_url };
    } else {
      finalBuffer = await buildFinalCreativeImage(
        image_mode, inputBuffer, rawBase64, mimeType, plan, dealership?.business_category ?? "car dealership"
      );

      // Save a copy in our own storage for preview/records
      const filePath = `${dealershipId}/${draft.id}.png`;
      await serviceClient.storage.from("ad-creatives").upload(filePath, finalBuffer, { contentType: "image/png", upsert: true });
      const { data } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
      publicUrlData = data;
    }

    // Step 3: upload the image to Meta and get an image_hash
    const uploadRes = await metaPost(`${adAccount}/adimages`, {
      bytes: finalBuffer.toString("base64"),
    }, pageAccessToken);
    const imageHash = Object.values(uploadRes.images ?? {})[0] && (Object.values(uploadRes.images ?? {})[0] as any).hash;
    if (!imageHash) throw new Error("Meta didn't return an image hash");

    // Step 4: create the ad creative — links to either the Instant Form
    // (stays inside Facebook) or an external website/landing page.
    const creativeRes = await metaPost(`${adAccount}/adcreatives`, {
      name: `${plan.headline} - Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash,
          message: plan.body,
          name: plan.headline,
          link: adDestination === "website" ? destinationUrl! : `https://fb.me/${pageId}`,
          call_to_action:
            adDestination === "website"
              ? { type: "LEARN_MORE", value: { link: destinationUrl } }
              : { type: "LEARN_MORE", value: { lead_gen_form_id: leadFormId } },
        },
      },
    }, pageAccessToken);

    // Step 5: campaign
    const campaignRes = await metaPost(`${adAccount}/campaigns`, {
      name: `Hawlai - ${plan.car_type ?? "Cars"} - ${new Date().toLocaleDateString("en-IN")}`,
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: ["NONE"],
      is_adset_budget_sharing_enabled: false,
    }, pageAccessToken);

    // Step 6: ad set (targeting + budget)
    const cityKey = plan.targeting_city ? await resolveCityKey(plan.targeting_city, pageAccessToken) : null;
    const targeting = cityKey
      ? { geo_locations: { cities: [{ key: cityKey, radius: 25, distance_unit: "kilometer" }] }, age_min: 21, targeting_automation: { advantage_audience: 1 } }
      : { geo_locations: { countries: ["IN"] }, age_min: 21, targeting_automation: { advantage_audience: 1 } };

    const adsetRes = await metaPost(`${adAccount}/adsets`, {
      name: `${plan.headline} - AdSet`,
      campaign_id: campaignRes.id,
      daily_budget: Math.round((plan.daily_budget ?? 500) * 100),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LEAD_GENERATION",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting,
      status: "PAUSED",
      promoted_object: { page_id: pageId },
      ...(scheduled_start ? { start_time: new Date(scheduled_start).toISOString() } : {}),
    }, pageAccessToken);

    // Step 7: the ad itself
    const adRes = await metaPost(`${adAccount}/ads`, {
      name: plan.headline,
      adset_id: adsetRes.id,
      creative: { creative_id: creativeRes.id },
      status: "PAUSED",
    }, pageAccessToken);

    const { data: updated } = await serviceClient
      .from("ad_creatives")
      .update({
        generated_image_url: publicUrlData.publicUrl,
        status: "launched",
        meta_ad_id: adRes.id,
        meta_campaign_id: campaignRes.id,
        meta_adset_id: adsetRes.id,
        meta_status: "PAUSED",
        daily_budget: plan.daily_budget ?? 500,
        targeting_city: plan.targeting_city ?? null,
        scheduled_start: scheduled_start ? new Date(scheduled_start).toISOString() : null,
      })
      .eq("id", draft.id)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      creative: updated,
      plan,
      meta: { campaign_id: campaignRes.id, adset_id: adsetRes.id, ad_id: adRes.id, creative_id: creativeRes.id },
    });
  } catch (err: any) {
    await serviceClient.from("ad_creatives").update({ status: "failed", error_message: err.message }).eq("id", draft.id);
    return NextResponse.json({ error: err.message, plan }, { status: 500 });
  }
}
