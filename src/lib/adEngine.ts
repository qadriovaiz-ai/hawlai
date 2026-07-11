// ------------------------------------------------------------------
// Shared Ad Engine — extracted from the original adlaunch route so
// the new preview (plan+creative, no Meta calls) and launch (Meta
// calls only) routes can share identical logic instead of the plan
// or image differing slightly between what's previewed and what
// actually launches. Nothing here changes behavior — this is a
// verbatim relocation of what previously lived inside
// /api/ads/adlaunch/route.ts.
// ------------------------------------------------------------------

import sharp from "sharp";

export const GRAPH_VERSION = "v23.0";

// ------------------------------------------------------------------
// Step 1: Claude reads the dealer's one-line prompt and extracts
// everything needed — copy, budget, city, and an image scene idea.
// ------------------------------------------------------------------
export async function generateAdPlan(prompt: string, brandProfile?: any, businessCategory: string = "car dealership") {
  try {
    const brandContext = brandProfile
      ? `\n\nThis dealer's brand profile — match this tone and, where relevant, reference these points:\n- Tone of voice: ${brandProfile.tone_of_voice ?? "not set"}\n- Target customer: ${JSON.stringify(brandProfile.target_persona ?? {})}\n- Key messaging points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none set"}\n- Preferred ad language: ${brandProfile.preferred_language ?? "hinglish"}`
      : "";

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
            content: `You are an expert Facebook Lead Ad strategist for Indian ${businessCategory} businesses.
Based on this dealer's requirement: "${prompt}"${brandContext}
Return JSON only (no markdown, no explanation):
{"headline":"short punchy headline under 40 chars in Hinglish","body":"ad body text under 125 chars, mention offer/urgency","daily_budget":500,"car_type":"the main product/service/item extracted from the request, or null","targeting_city":"city extracted or null, else Lucknow","background_style":"one of: studio_white, showroom, road, sunset — pick the best fit","image_scene_prompt":"a short English phrase describing an ideal background scene for this ad, e.g. 'sunset highway with dramatic lighting'","confidence_score":"integer 0-100, your honest prediction of how well THIS SPECIFIC headline+body will convert for an Indian customer audience — judge on clarity, urgency, specificity, and whether it gives a real reason to act now. Be genuinely critical, not always high.","score_reasoning":"one short sentence explaining the score — what's working or what would make it stronger","estimated_leads_low":"integer, honest low-end estimate of monthly leads at this budget","estimated_leads_high":"integer, honest high-end estimate of monthly leads at this budget"}`,
          },
        ],
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err: any) {
    console.error("[ad-engine] generateAdPlan error:", err.message);
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
      confidence_score: 50,
      score_reasoning: "Generated via fallback template — not AI-scored.",
      estimated_leads_low: 10,
      estimated_leads_high: 25,
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

export async function applyTemplateBackground(inputBuffer: Buffer, style: string): Promise<Buffer> {
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

export async function generateAIImage(scenePrompt: string, base64Data: string, mimeType: string, businessCategory: string = "car dealership"): Promise<Buffer> {
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
            { text: `Facebook ad for an Indian ${businessCategory} business. Keep the product in the photo unchanged and realistic. Only change the background to: "${scenePrompt}". Photorealistic, professional advertisement lighting.` },
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

export function buildTextOverlaySvg(width: number, height: number, headline: string, bodyCopy: string) {
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
// Step 3: Meta Graph API helpers — token/ad-account come from the
// calling dealership's own connection, not a shared env var.
// ------------------------------------------------------------------
export async function metaPost(path: string, params: Record<string, any>, token: string) {
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

export async function resolveCityKey(cityName: string, token: string): Promise<string | null> {
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

// ------------------------------------------------------------------
// Composites a finished, ready-to-upload ad image: background
// (template or AI) + text overlay, resized to Meta's expected 1080x1080.
// ------------------------------------------------------------------
export async function buildFinalCreativeImage(
  imageMode: string,
  inputBuffer: Buffer,
  rawBase64: string,
  mimeType: string,
  plan: any,
  businessCategory: string
): Promise<Buffer> {
  const processedBuffer = imageMode === "ai_generate"
    ? await generateAIImage(plan.image_scene_prompt, rawBase64, mimeType, businessCategory)
    : await applyTemplateBackground(inputBuffer, plan.background_style ?? "studio_white");

  return sharp(processedBuffer)
    .resize(1080, 1080, { fit: "cover" })
    .composite([{ input: Buffer.from(buildTextOverlaySvg(1080, 1080, plan.headline, plan.body)), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
