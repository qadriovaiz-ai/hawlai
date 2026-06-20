import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function generateAdCopy(prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are an expert Facebook Lead Ad copywriter for Indian automobile dealerships.

Based on this dealer's requirement: "${prompt}"

Generate a compelling Facebook Lead Ad in JSON format only (no markdown, no explanation):
{
  "headline": "short punchy headline under 40 chars in Hinglish or Hindi",
  "body": "ad body text under 125 chars, mention offer/urgency",
  "cta": "one of: LEARN_MORE, GET_QUOTE, CONTACT_US, SIGN_UP",
  "targeting_city": "city name extracted from prompt or null",
  "budget_per_day": number in INR (suggest 500 if not mentioned),
  "car_type": "car model/type extracted from prompt or null"
}`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return {
      headline: "Best Car Deals Near You",
      body: "Limited time offer! Get your dream car today. Fill the form now.",
      cta: "GET_QUOTE",
      targeting_city: null,
      budget_per_day: 500,
      car_type: null,
    };
  }
}

async function createMetaLeadAd(adCopy: any, dealershipId: string) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;

  if (!token || !adAccountId || !pageId) {
    throw new Error("Missing META_PAGE_ACCESS_TOKEN, META_AD_ACCOUNT_ID, or META_PAGE_ID");
  }

  const baseUrl = "https://graph.facebook.com/v23.0";

  const campaignRes = await fetch(`${baseUrl}/${adAccountId}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `AutoPilot Lead Campaign - ${dealershipId.slice(0, 8)} - ${Date.now()}`,
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: ["NONE"],
      access_token: token,
    }),
  });
  const campaign = await campaignRes.json();
  if (campaign.error) throw new Error(JSON.stringify(campaign.error));

  const targeting: any = {
    age_min: 25,
    age_max: 55,
    geo_locations: adCopy.targeting_city
      ? { cities: [{ key: adCopy.targeting_city, radius: 25, distance_unit: "kilometer" }] }
      : { countries: ["IN"] },
    publisher_platforms: ["facebook", "instagram"],
  };

  const adSetRes = await fetch(`${baseUrl}/${adAccountId}/adsets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `AutoPilot Ad Set - ${adCopy.car_type ?? "Cars"}`,
      campaign_id: campaign.id,
      daily_budget: adCopy.budget_per_day * 100,
      billing_event: "IMPRESSIONS",
      optimization_goal: "QUALITY_LEAD",
      is_adset_budget_sharing_enabled: false,
      targeting,
      status: "PAUSED",
      access_token: token,
    }),
  });
  const adSet = await adSetRes.json();
  if (adSet.error) throw new Error(`Ad Set error: ${adSet.error.message}`);

  return {
    campaign_id: campaign.id,
    ad_set_id: adSet.id,
    headline: adCopy.headline,
    body: adCopy.body,
    status: "PAUSED",
    daily_budget: adCopy.budget_per_day,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealership_id")
    .eq("id", user.id)
    .single();

  if (!profile?.dealership_id) {
    return NextResponse.json({ error: "No dealership found" }, { status: 400 });
  }

  const body = await request.json();
  const { prompt } = body;

  if (!prompt || prompt.trim().length < 10) {
    return NextResponse.json({ error: "Please provide a detailed prompt" }, { status: 400 });
  }

  try {
    const adCopy = await generateAdCopy(prompt);
    const result = await createMetaLeadAd(adCopy, profile.dealership_id);

    return NextResponse.json({
      success: true,
      ad: result,
      message: "Ad created successfully! It's paused — review and activate from Meta Ads Manager.",
    });
  } catch (err: any) {
    console.error("[ads/create] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
