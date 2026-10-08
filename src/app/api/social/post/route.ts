import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { postPhotoToPage, postTextToPage, getConnectedInstagramAccountId, postPhotoToInstagram, readPostMessage } from "@/lib/agents/socialMediaAgent";
import { samePostText } from "@/lib/chat/socialPost";
import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { isPieceId, markTrackedLinks } from "@/lib/attribution/contentLink";
import { registerPiece } from "@/lib/attribution/pieces";

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
  const { photo_base64, image_url, caption, scheduled_time, post_to_instagram, content_piece_id, destination, expect_text } =
    await request.json();
  if (!caption || caption.trim().length < 1) return NextResponse.json({ error: "Caption is required" }, { status: 400 });

  // The text the card showed and the text being posted must be the same
  // text. On 8 Oct 2026 they were not: the card appended the hashtags
  // and the payload was recomposed by a second function that never read
  // them, so the owner approved one post and Facebook received another.
  // Both now come from composePost, and this refuses the request if they
  // ever diverge again rather than posting the one nobody approved.
  if (typeof expect_text === "string" && !samePostText(expect_text, caption)) {
    return NextResponse.json(
      { error: "The text being posted isn't the text that was approved, so nothing was posted." },
      { status: 400 }
    );
  }

  // Which piece of content this post is, so a visit arriving from it can
  // be counted against it (Hawlai Brain, Phase 0). Confirmed to belong to
  // this business before it is used — the id arrives in a request body.
  let pieceId: string | null = null;
  if (isPieceId(content_piece_id)) {
    const { data: draft } = await supabase
      .from("content_pieces")
      .select("id, topic")
      .eq("id", content_piece_id)
      .eq("dealership_id", dealershipId)
      .maybeSingle();
    // Registered on publish, not on generation: a draft that is never
    // posted is not a published piece and gets no identity.
    if (draft?.id) pieceId = await registerPiece(supabase, { dealershipId, kind: "content", sourceId: draft.id, label: draft.topic });
  }

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

  // AN INSTAGRAM POST IS NOT A FACEBOOK POST.
  //
  // The incident in one line: a card titled "Instagram Post" called this
  // endpoint, and this endpoint posts to the Facebook Page first and
  // treats Instagram as an extra. When the caller names Instagram as THE
  // destination, Facebook is not touched at all — and whether Instagram
  // can receive it is settled before anything is published, not from
  // inside the catch block after a public Facebook post.
  //
  // `destination` is absent from the Social department page and the
  // scheduler, which genuinely mean "Facebook, and Instagram too if it
  // has an image"; their behaviour below is unchanged.
  if (destination === "instagram") {
    if (!imageUrl) {
      return NextResponse.json({ error: "Instagram needs an image — nothing was posted." }, { status: 400 });
    }
    try {
      const igUserId = await getConnectedInstagramAccountId(pageId, pageAccessToken);
      if (!igUserId) {
        return NextResponse.json(
          { error: "No Instagram professional account is linked to your Facebook Page, so nothing was posted." },
          { status: 400 }
        );
      }
      const igRes = await postPhotoToInstagram(igUserId, pageAccessToken, imageUrl, caption);
      return NextResponse.json({
        success: true,
        destination: "instagram",
        post_id: igRes.id,
        hadImage: true,
        // Instagram's published caption is not re-read here: the Graph
        // field for it is on the media object and this path has never
        // been exercised against a live account, so claiming a verified
        // read-back would be the same kind of unearned certainty the
        // incident was made of.
        verified: "unchecked",
      });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? "Instagram refused the post." }, { status: 500 });
    }
  }

  try {
    const scheduledPublishTime = scheduled_time ? Math.floor(new Date(scheduled_time).getTime() / 1000) : undefined;
    // Words alone go to /feed; a picture goes to /photos. Instagram has
    // no text-only post at all, so it is refused below rather than
    // silently skipped.
    // Facebook keeps real, clickable links, so its copy carries the mark.
    // Instagram's caption is deliberately left alone: postPhotoToInstagram
    // replaces every link with "link in bio", so there is nothing there to
    // mark and Instagram organic stays unattributed by decision.
    const fbCaption = markTrackedLinks(caption, pieceId).text;
    const result = imageUrl
      ? await postPhotoToPage(pageId, pageAccessToken, imageUrl, fbCaption, scheduledPublishTime)
      : await postTextToPage(pageId, pageAccessToken, fbCaption, scheduledPublishTime);

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

    // WHAT FACEBOOK ACTUALLY SHOWS.
    //
    // A post publishes successfully without its caption — Graph returns
    // an id either way — and on 8 Oct 2026 the post that went out was
    // missing the hashtag block the card had shown. Nothing noticed,
    // because nothing looked. The autopilot already reads its posts back
    // (contentAutopilot.ts:183); the chat-triggered path did not.
    //
    // Compared against what was SENT (fbCaption), which carries the
    // attribution mark on the link, not against the approved text —
    // those differ by design and a false alarm every time would make
    // this check worthless.
    let verified: "match" | "differs" | "unreadable" | "scheduled" = "scheduled";
    let landedText: string | undefined;
    if (!scheduledPublishTime) {
      landedText = await readPostMessage(result.id, pageAccessToken);
      verified = landedText === undefined ? "unreadable" : samePostText(fbCaption, landedText) ? "match" : "differs";
    }

    return NextResponse.json({
      success: true,
      destination: "facebook",
      post_id: result.id,
      scheduled: !!scheduledPublishTime,
      hadImage: Boolean(imageUrl),
      instagram: instagramResult,
      verified,
      // Only when it differs: the owner is owed the actual words, not a
      // reassuring summary of them.
      ...(verified === "differs" ? { landed_text: landedText ?? "" } : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
