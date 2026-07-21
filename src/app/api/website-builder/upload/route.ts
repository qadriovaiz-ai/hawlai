import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Shared upload endpoint for the Website Builder — logo, product
// photos, section images. Reuses the same "ad-creatives" storage
// bucket already used elsewhere in the app (src/app/api/website/
// upload-hero/route.ts), just under a website-assets/ prefix, so no
// new bucket/migration is needed.
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id as string | undefined;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { imageBase64, kind } = await request.json();
  if (!imageBase64) return NextResponse.json({ error: "No image provided" }, { status: 400 });

  const match = String(imageBase64).match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  const mimeType = match[1];
  const rawBase64 = match[2];
  const buffer = Buffer.from(rawBase64, "base64");

  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    return NextResponse.json({ error: "Only JPG, PNG, WEBP, or GIF images are supported" }, { status: 400 });
  }

  const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
  const safeKind = String(kind ?? "image").replace(/[^a-zA-Z0-9_-]/g, "") || "image";
  const filePath = `website-assets/${dealershipId}/${safeKind}-${Date.now()}.${ext}`;

  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from("ad-creatives")
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
  return NextResponse.json({ url: publicUrlData.publicUrl });
}
