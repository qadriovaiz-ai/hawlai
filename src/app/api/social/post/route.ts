import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { postPhotoToPage, postTextToPage, getConnectedInstagramAccountId, postPhotoToInstagram } from "@/lib/agents/socialMediaAgent";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  // Three ways in, one posting path: an uploaded photo (the Social
  // page), an image already in storage (chat, which generated it a
  // moment ago and has its URL), or words alone.
  const { photo_base64, image_url, caption, scheduled_time, post_to_instagram } = await request.json();
  if (!caption || caption.trim().length < 1) return NextResponse.json({ error: "Caption is required" }, { status: 400 });

  const { data: dealership } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_access_token, fb_page_access_token_encrypted")
    .eq("id", dealershipId)
    .single();

  const pageId = dealership?.fb_page_id;
  const pageAccessToken = readMetaPageToken(dealership) ?? process.env.META_PAGE_ACCESS_TOKEN;

  if (!pageId || !pageAccessToken) {
    return NextResponse.json(
      { error: "Facebook Page isn't connected. Connect it from Settings first." },
      { status: 400 }
    );
  }

  let imageUrl: string | null = typeof image_url === "string" && image_url.trim() ? image_url.trim() : null;
  if (photo_base64) {
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
    imageUrl = publicUrlData.publicUrl;
  }

  try {
    const scheduledPublishTime = scheduled_time ? Math.floor(new Date(scheduled_time).getTime() / 1000) : undefined;
    // Words alone go to /feed; a picture goes to /photos. Instagram has
    // no text-only post at all, so it is refused below rather than
    // silently skipped.
    const result = imageUrl
      ? await postPhotoToPage(pageId, pageAccessToken, imageUrl, caption, scheduledPublishTime)
      : await postTextToPage(pageId, pageAccessToken, caption, scheduledPublishTime);

    let instagramResult: { posted: boolean; id?: string; error?: string } = { posted: false };
    if (post_to_instagram && !imageUrl) {
      instagramResult.error = "Instagram needs an image — this went to Facebook only.";
    } else if (post_to_instagram) {
      // Instagram Graph API has no native "publish later" option the
      // way Facebook's /photos endpoint does — only attempt this for
      // immediate (non-scheduled) posts, and treat any failure as
      // best-effort, not a reason to report the whole request as failed
      // (the Facebook post above already succeeded by this point).
      if (scheduledPublishTime) {
        instagramResult.error = "Instagram doesn't support scheduled posts — post immediately instead, or post to Instagram separately when it's time.";
      } else {
        try {
          const igUserId = await getConnectedInstagramAccountId(pageId, pageAccessToken);
          if (!igUserId) throw new Error("No Instagram Business account connected to this Facebook Page");
          const igRes = await postPhotoToInstagram(igUserId, pageAccessToken, imageUrl!, caption);
          instagramResult = { posted: true, id: igRes.id };
        } catch (igErr: any) {
          instagramResult.error = igErr.message;
        }
      }
    }

    return NextResponse.json({ success: true, post_id: result.id, scheduled: !!scheduledPublishTime, hadImage: Boolean(imageUrl), instagram: instagramResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
