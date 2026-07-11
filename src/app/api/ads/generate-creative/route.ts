import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import sharp from "sharp";

// ------------------------------------------------------------------
// Template mode: no external AI call. Puts the car photo onto a
// pre-designed gradient background. Free, fast, no API key needed.
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
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
  </svg>`;

  const carImage = await sharp(inputBuffer).resize(880, 660, { fit: "inside" }).toBuffer();
  const carMeta = await sharp(carImage).metadata();
  const carW = carMeta.width ?? 880;
  const carH = carMeta.height ?? 660;

  return sharp(Buffer.from(bgSvg))
    .composite([
      {
        input: carImage,
        top: Math.max(0, Math.round((height - carH) / 2) - 60),
        left: Math.max(0, Math.round((width - carW) / 2)),
      },
    ])
    .png()
    .toBuffer();
}

// ------------------------------------------------------------------
// AI mode: sends the car photo + prompt to Gemini 2.5 Flash Image
// to regenerate the background/scene around the (unchanged) car.
// ------------------------------------------------------------------
async function generateAIImage(prompt: string, base64Data: string, mimeType: string, businessCategory: string = "car dealership"): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment variables");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `This is a product photo for a Facebook/Instagram ad for an Indian ${businessCategory} business. Keep the product itself completely realistic and unchanged. Only change the background/scene to match this request: "${prompt}". Make it look like a professional advertisement, photorealistic, high quality lighting.`,
              },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
      }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Gemini API request failed");
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
  const inline = imagePart?.inlineData ?? imagePart?.inline_data;

  if (!inline?.data) {
    throw new Error("Gemini did not return an image — try a different prompt");
  }

  return Buffer.from(inline.data, "base64");
}

// ------------------------------------------------------------------
// Shared: headline + body + price overlay, applied on top of
// whichever background (template or AI) was produced above.
// ------------------------------------------------------------------
function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTextOverlaySvg(width: number, height: number, headline: string, bodyCopy: string, priceText?: string) {
  const bannerHeight = 240;
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0" />
        <stop offset="100%" stop-color="black" stop-opacity="0.78" />
      </linearGradient>
    </defs>
    <rect x="0" y="${height - bannerHeight}" width="${width}" height="${bannerHeight}" fill="url(#fade)" />
    <text x="40" y="${height - 150}" font-family="Arial, sans-serif" font-size="50" font-weight="bold" fill="white">${escapeXml(headline)}</text>
    <text x="40" y="${height - 95}" font-family="Arial, sans-serif" font-size="28" fill="#e2e8f0">${escapeXml(bodyCopy)}</text>
    ${priceText ? `<text x="${width - 40}" y="${height - 40}" text-anchor="end" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="#fbbf24">${escapeXml(priceText)}</text>` : ""}
  </svg>`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships").select("business_category").eq("id", dealershipId).single();
  const businessCategory = dealership?.business_category ?? "car dealership";

  const body = await request.json();
  const { photo_base64, mode, prompt, background_style, headline, body_copy, price_text } = body;

  if (!photo_base64) return NextResponse.json({ error: "photo_base64 required" }, { status: 400 });
  if (!headline || !body_copy) return NextResponse.json({ error: "headline and body_copy required" }, { status: 400 });
  if (mode !== "template" && mode !== "ai_generate") {
    return NextResponse.json({ error: "mode must be 'template' or 'ai_generate'" }, { status: 400 });
  }
  if (mode === "ai_generate" && (!prompt || prompt.trim().length < 5)) {
    return NextResponse.json({ error: "prompt required for AI mode" }, { status: 400 });
  }

  const match = String(photo_base64).match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64;
  const inputBuffer = Buffer.from(rawBase64, "base64");

  const serviceClient = createServiceClient();

  const { data: draft, error: draftError } = await serviceClient
    .from("ad_creatives")
    .insert({
      dealership_id: dealershipId,
      mode,
      prompt: prompt ?? null,
      background_style: background_style ?? null,
      headline,
      body_copy,
      status: "draft",
    })
    .select()
    .single();

  if (draftError || !draft) {
    return NextResponse.json({ error: draftError?.message ?? "Failed to create draft" }, { status: 500 });
  }

  try {
    const processedBuffer = mode === "ai_generate"
      ? await generateAIImage(prompt, rawBase64, mimeType, businessCategory)
      : await applyTemplateBackground(inputBuffer, background_style ?? "studio_white");

    const finalBuffer = await sharp(processedBuffer)
      .resize(1080, 1080, { fit: "cover" })
      .composite([{ input: Buffer.from(buildTextOverlaySvg(1080, 1080, headline, body_copy, price_text)), top: 0, left: 0 }])
      .png()
      .toBuffer();

    const filePath = `${dealershipId}/${draft.id}.png`;
    const { error: uploadError } = await serviceClient.storage
      .from("ad-creatives")
      .upload(filePath, finalBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

    const { data: updated, error: updateError } = await serviceClient
      .from("ad_creatives")
      .update({ generated_image_url: publicUrlData.publicUrl, status: "ready" })
      .eq("id", draft.id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, creative: updated });
  } catch (err: any) {
    await serviceClient
      .from("ad_creatives")
      .update({ status: "failed", error_message: err.message })
      .eq("id", draft.id);

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
