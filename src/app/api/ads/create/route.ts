import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function generateAdCopy(prompt: string) {
  try {
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
        messages: [{
          role: "user",
          content: `You are an expert Facebook Lead Ad copywriter for Indian automobile dealerships.
Based on this dealer's requirement: "${prompt}"
Generate a compelling Facebook Lead Ad in JSON format only (no markdown, no explanation, no code blocks):
{"headline":"short punchy headline under 40 chars in Hinglish","body":"ad body text under 125 chars mention offer urgency","budget_per_day":500,"car_type":"car model extracted or null","targeting_city":"city extracted or null"}`,
        }],
      }),
    });

    const data = await response.json();
    console.log("[ads/create] Anthropic raw response:", JSON.stringify(data));

    const text = data.content?.[0]?.text ?? "";
    console.log("[ads/create] AI text:", text);

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log("[ads/create] Parsed adCopy:", parsed);
    return parsed;
  } catch (err: any) {
    console.error("[ads/create] generateAdCopy error:", err.message);
    // Fallback with prompt-based copy
    const city = prompt.match(/(lucknow|delhi|mumbai|kanpur|agra|varanasi|jaipur|hyderabad|bangalore|pune)/i)?.[1] ?? "aapke shahar";
    const car = prompt.match(/(swift|nexon|city|creta|seltos|brezza|alto|baleno|innova|fortuner)/i)?.[1] ?? "car";
    return {
      headline: `${car.charAt(0).toUpperCase() + car.slice(1)} Chahiye? Ab Milegi!`,
      body: `${city.charAt(0).toUpperCase() + city.slice(1)} mein best ${car} deals. Abhi form bharo, FREE test drive pao!`,
      budget_per_day: 500,
      car_type: car,
      targeting_city: city,
    };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const body = await request.json();
  const { prompt } = body;
  if (!prompt || prompt.trim().length < 10) return NextResponse.json({ error: "Prompt too short" }, { status: 400 });

  const adCopy = await generateAdCopy(prompt);

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  try {
    const campaignRes = await fetch(`https://graph.facebook.com/v23.0/${adAccountId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `AutoPilot - ${adCopy.car_type ?? "Cars"} - ${new Date().toLocaleDateString("en-IN")}`,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: ["NONE"],
        access_token: token,
      }),
    });
    const campaign = await campaignRes.json();

    return NextResponse.json({
      success: true,
      ad: {
        campaign_id: campaign.error ? null : campaign.id,
        headline: adCopy.headline,
        body: adCopy.body,
        budget_per_day: adCopy.budget_per_day,
        targeting_city: adCopy.targeting_city,
        car_type: adCopy.car_type,
        status: campaign.error ? "DRAFT" : "PAUSED",
      },
      message: campaign.error
        ? "AI copy ready! Meta mein manually campaign banao."
        : "Campaign created! Meta Ads Manager mein Ad Set add karo.",
    });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      ad: {
        campaign_id: null,
        headline: adCopy.headline,
        body: adCopy.body,
        budget_per_day: adCopy.budget_per_day,
        targeting_city: adCopy.targeting_city,
        status: "DRAFT",
      },
      message: "AI copy ready!",
    });
  }
}
