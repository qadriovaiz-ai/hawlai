import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { postPhotoToPage } from "@/lib/agents/socialMediaAgent";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { photo_base64, caption, scheduled_time } = await request.json();
  if (!photo_base64) return NextResponse.json({ error: "photo_base64 required" }, { status: 400 });
  if (!caption || caption.trim().length < 1) return NextResponse.json({ error: "Caption is required" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_access_token")
    .eq("id", dealershipId)
    .single();

  const pageId = dealership?.fb_page_id;
  const pageAccessToken = dealership?.fb_page_access_token ?? process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !pageAccessToken) {
    return NextResponse.json(
      { error: "Facebook Page isn't connected. Connect it from Settings first." },
      { status: 400 }
    );
  }

  const match = String(photo_base64).match(/^data:(image\/\w+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const rawBase64 = match?.[2] ?? photo_base64;
  const buffer = Buffer.from(rawBase64, "base64");

  const serviceClient = createServiceClient();
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const filePath = `social/${dealershipId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await serviceClient.storage
    .from("ad-creatives")
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);

  try {
    const scheduledPublishTime = scheduled_time ? Math.floor(new Date(scheduled_time).getTime() / 1000) : undefined;
    const result = await postPhotoToPage(pageId, pageAccessToken, publicUrlData.publicUrl, caption, scheduledPublishTime);
    return NextResponse.json({ success: true, post_id: result.id, scheduled: !!scheduledPublishTime });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
