import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import sharp from "sharp";

const GRAPH_VERSION = "v23.0";

// ------------------------------------------------------------------
// Step 1: Claude reads the dealer's one-line prompt and extracts
// everything needed — copy, budget, city, and an image scene idea.
// ------------------------------------------------------------------
async function generateAdPlan(prompt: string) {
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
        messages: [
          {
            role: "user",
            content: `You are an expert Facebook Lead Ad strategist for Indian car dealerships.
Based on this dealer's requirement: "${prompt}"
Return JSON only (no markdown, no explanation):
{"headline":"short punchy headline under 40 chars in Hinglish","body":"ad body text under 125 chars, mention offer/urgency","daily_budget":500,"car_type":"car model extracted or null","targeting_city":"city extracted or null, else Lucknow","background_style":"one of: studio_white, showroom, road, sunset — pick the best fit","image_scene_prompt":"a short English phrase describing an ideal background scene for this ad, e.g. 'sunset highway with dramatic lighting'"}`,
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[launch-full] generateAdPlan error:", err.message);
    const city = prompt.match(/(lucknow|delhi|mumbai|kanpur|agra|varanasi|jaipur|hyderabad|bangalore|pune)/i)?.[1] ?? "Lucknow";
    const car = prompt.match(/(swift|nexon|city|creta|seltos|brezza|alto|baleno|innova|fortuner)/i)?.[1] ?? "car";
    return {
      headline: `${car.charAt(0).toUpperCase() + car.slice(1)} Chahiye? Ab Milegi!`,
      body: `${city.charAt(0).toUpperCase() + city.slice(1)} mein best ${car} deals. Free test drive book karo!`,
      daily_budget: 500,
      car_type: car,
      targeting_city: city,
      background_style: "studio_white",
      image_scene_prompt: "clean professional studio background",
    };
  }
}

// ------------------------------------------------------------------
// Step 2: Build the creative image (template or AI background)
// ------------------------------------------------------------------
const TEMPLATE_COLORS: Record<string, [string, string]> = {
  studio_white: ["#f8fafc", "#cbd5e1"],
  showroom: ["#1e293b", "#0f172a"],
  road: ["#334155", "#0f172a"],
  sunset: ["#fb923c", "#7c2d12"],
};

async function applyTemplateBackground(inputBuffer: Buffer, style: string): Promise<Buffer> {
  const width = 1080;
  const height = 1080;
  const [c1, c2] = TEMPLATE_COLORS[style] ?? TEMPLATE_COLORS.studio_white;
  const bgSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c1}" /><stop offset="100%" stop-color="${c2}" />
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)" />
  </svg>`;
  const carImage = await sharp(inputBuffer).resize(880, 660, { fit: "inside" }).toBuffer();
  const carMeta = await sharp(carImage).metadata();
  const carW = carMeta.width ?? 880;
  const carH = carMeta.height ?? 660;
  return sharp(Buffer.from(bgSvg))
    .composite([{ input: carImage, top: Math.max(0, Math.round((height - carH) / 2) - 60), left: Math.max(0, Math.round((width - carW) / 2)) }])
    .png()
    .toBuffer();
}

async function generateAIImage(scenePrompt: string, base64Data: string, mimeType: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Facebook ad for an Indian car dealership. Keep the car unchanged and realistic. Only change the background to: "${scenePrompt}". Photorealistic, professional automotive advertisement lighting.` },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        }],
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Gemini request failed");
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
  const inline = imagePart?.inlineData ?? imagePart?.inline_data;
  if (!inline?.data) throw new Error("Gemini did not return an image");
  return Buffer.from(inline.data, "base64");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTextOverlaySvg(width: number, height: number, headline: string, bodyCopy: string) {
  const bannerHeight = 240;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0" /><stop offset="100%" stop-color="black" stop-opacity="0.78" />
    </linearGradient></defs>
    <rect x="0" y="${height - bannerHeight}" width="${width}" height="${bannerHeight}" fill="url(#fade)" />
    <text x="40" y="${height - 150}" font-family="Arial, sans-serif" font-size="50" font-weight="bold" fill="white">${escapeXml(headline)}</text>
    <text x="40" y="${height - 95}" font-family="Arial, sans-serif" font-size="28" fill="#e2e8f0">${escapeXml(bodyCopy)}</text>
  </svg>`;
}

// ------------------------------------------------------------------
// Step 3: Meta Graph API helpers — token/ad-account now come from the
// calling dealership's own connection, not a shared env var.
// ------------------------------------------------------------------
async function metaPost(path: string, params: Record<string, any>, token: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`[${path}] ${e.message ?? "Meta API error"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}${e.error_subcode ? ` (subcode ${e.error_subcode})` : ""}`);
  }
  return data;
}

async function resolveCityKey(cityName: string, token: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/search?type=adgeolocation&location_types=["city"]&q=${encodeURIComponent(cityName)}&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const match = data?.data?.find((d: any) => d.country_code === "IN") ?? data?.data?.[0];
    return match?.key ?? null;
  } catch {
    return null;
  }
}

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
    .select("fb_page_access_token, fb_ad_account_id, fb_page_id, fb_lead_form_id")
    .eq("id", dealershipId)
    .single();

  const pageAccessToken: string | undefined = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;
  const rawAdAccountId: string = dealership?.fb_ad_account_id ?? process.env.META_AD_ACCOUNT_ID ?? "";
  const adAccount = rawAdAccountId.startsWith("act_") ? rawAdAccountId : `act_${rawAdAccountId}`;
  const pageId: string | undefined = dealership?.fb_page_id ?? process.env.META_PAGE_ID;
  const leadFormId: string | undefined = dealership?.fb_lead_form_id ?? process.env.META_LEAD_FORM_ID;

  if (!pageAccessToken || !rawAdAccountId || !pageId || !leadFormId) {
    return NextResponse.json(
      { error: "Facebook Page connect nahi hai. Pehle Settings mein jaake apna Facebook Page connect karo, phir ad launch karo." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { photo_base64, prompt, image_mode, scheduled_start } = body;

  if (!photo_base64) return NextResponse.json({ error: "photo_base64 required" }, { status: 400 });
  if (!prompt || prompt.trim().length < 10) return NextResponse.json({ error: "Prompt bahut chota hai, thoda detail likho" }, { status: 400 });

  const match = String(photo_base64).match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64;
  const inputBuffer = Buffer.from(rawBase64, "base64");

  const serviceClient = createServiceClient();

  // Step 1: plan the ad (copy + targeting + scene)
  const plan = await generateAdPlan(prompt);

  const { data: draft } = await serviceClient
    .from("ad_creatives")
    .insert({
      dealership_id: dealershipId,
      mode: image_mode === "ai_generate" ? "ai_generate" : "template",
      prompt,
      background_style: plan.background_style,
      headline: plan.headline,
      body_copy: plan.body,
      status: "draft",
    })
    .select()
    .single();

  try {
    // Step 2: build the image
    const processedBuffer = image_mode === "ai_generate"
      ? await generateAIImage(plan.image_scene_prompt, rawBase64, mimeType)
      : await applyTemplateBackground(inputBuffer, plan.background_style ?? "studio_white");

    const finalBuffer = await sharp(processedBuffer)
      .resize(1080, 1080, { fit: "cover" })
      .composite([{ input: Buffer.from(buildTextOverlaySvg(1080, 1080, plan.headline, plan.body)), top: 0, left: 0 }])
      .png()
      .toBuffer();

    // Save a copy in our own storage for preview/records
    const filePath = `${dealershipId}/${draft.id}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, finalBuffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    // Step 3: upload the image to Meta and get an image_hash
    const uploadRes = await metaPost(`${adAccount}/adimages`, {
      bytes: finalBuffer.toString("base64"),
    }, pageAccessToken);
    const imageHash = Object.values(uploadRes.images ?? {})[0] && (Object.values(uploadRes.images ?? {})[0] as any).hash;
    if (!imageHash) throw new Error("Meta ne image hash return nahi kiya");

    // Step 4: create the ad creative (linked to the Instant Form)
    const creativeRes = await metaPost(`${adAccount}/adcreatives`, {
      name: `${plan.headline} - Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash,
          message: plan.body,
          name: plan.headline,
          link: `https://fb.me/${pageId}`,
          call_to_action: { type: "LEARN_MORE", value: { lead_gen_form_id: leadFormId } },
        },
      },
    }, pageAccessToken);

    // Step 5: campaign
    const campaignRes = await metaPost(`${adAccount}/campaigns`, {
      name: `AutoPilot - ${plan.car_type ?? "Cars"} - ${new Date().toLocaleDateString("en-IN")}`,
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
