import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { photo_base64 } = await request.json();
  if (!photo_base64) return NextResponse.json({ error: "photo_base64 required" }, { status: 400 });

  const match = String(photo_base64).match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64;
  const buffer = Buffer.from(rawBase64, "base64");

  const serviceClient = createServiceClient();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const filePath = `landing/${dealershipId}/hero.${ext}`;

  const { error: uploadError } = await serviceClient.storage
    .from("ad-creatives")
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
  return NextResponse.json({ url: publicUrlData.publicUrl });
}
