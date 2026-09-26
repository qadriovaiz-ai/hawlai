import { generateGraphic } from "@/lib/agents/graphicDesignAgent";
import { generateContent } from "@/lib/agents/contentMarketingAgent";
import { postPhotoToPage, getConnectedInstagramAccountId, postPhotoToInstagram, readPostMessage } from "@/lib/agents/socialMediaAgent";
import { captionFrom } from "@/lib/chat/publishActions";
import { createServiceClient } from "@/lib/supabase/service";
import { readMetaPageToken, hasMetaPageToken } from "@/lib/crypto/oauthSecrets";
import { gatherBusinessFactsSafely } from "@/lib/claims/businessFacts";
import { recentCopy } from "@/lib/content/recentCopy";
import { aiFailureLabel } from "@/lib/ai/claude";
import { markTrackedLinks } from "@/lib/attribution/contentLink";
import { registerPiece } from "@/lib/attribution/pieces";

/**
 * The words to post, from whatever shape the model returned.
 *
 * THE BUG THIS REPLACES: the caption was
 *   output.text ?? Object.values(output)[0]
 * — whatever value the model happened to put FIRST, cast to a string.
 * For { hashtags: [...], caption: "..." } that was an ARRAY; for
 * { post: { caption } } an OBJECT. Both are truthy, so "No caption text
 * generated" never fired, and the image went to Facebook with a caption
 * it could not use. A post on the business's Page showed an image and
 * "No text content".
 *
 * Now the caption is a real string or nothing, and nothing means nothing
 * is posted.
 */
export function captionForPost(output: any): string {
  const caption = captionFrom(output);
  if (!caption) return "";
  const tags: string[] = Array.isArray(output?.hashtags)
    ? output.hashtags
        .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t: string) => (t.trim().startsWith("#") ? t.trim() : `#${t.trim()}`))
    : [];
  if (tags.length === 0 || tags.every((t) => caption.includes(t))) return caption;
  return `${caption}\n\n${tags.join(" ")}`;
}

// Runs daily as part of the autopilot cron. Fully automatic — no
// human touches the generated content before it's posted. This is
// deliberately scoped to organic social posting only; anything that
// spends money (ads/budget) is never part of this, per the
// always-approval-required rule for financial actions.
export async function runContentAutopilot(supabase: any, dealershipId: string) {
  const { data: dealership } = await supabase
    .from("dealerships")
    .select("dealership_name, business_category, fb_page_id, fb_page_access_token, fb_page_access_token_encrypted, content_autopilot_enabled, content_autopilot_frequency_days, content_autopilot_last_posted_at")
    .eq("id", dealershipId)
    .single();

  if (!dealership?.content_autopilot_enabled) return { skipped: "disabled" };
  if (!dealership.fb_page_id || !hasMetaPageToken(dealership)) return { skipped: "facebook not connected" };

  // Decrypted ONCE for the whole run. Six call sites below used the
  // raw column; resolving per use would decrypt six times and give six
  // places for a future edit to miss one.
  const pageToken = readMetaPageToken(dealership)!;

  // A pre-approved queued post takes priority over fresh generation —
  // this is what lets a business say "here's my week, post exactly
  // this" instead of autopilot always improvising new content each
  // cycle. Falls through to the existing fresh-generation behavior
  // below when nothing's queued for today, so this never changes
  // behavior for a business that's never used the queue feature.
  const today = new Date().toISOString().slice(0, 10);
  const { data: queuedPost } = await supabase
    .from("social_post_queue")
    .select("*")
    .eq("dealership_id", dealershipId)
    .eq("scheduled_for", today)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (queuedPost) {
    return postQueuedItem(supabase, dealershipId, dealership, pageToken, queuedPost);
  }

  const frequencyDays = dealership.content_autopilot_frequency_days ?? 3;
  if (dealership.content_autopilot_last_posted_at) {
    const daysSince = (Date.now() - new Date(dealership.content_autopilot_last_posted_at).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince < frequencyDays) return { skipped: "not due yet" };
  }

  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("tone_of_voice, messaging_pillars")
    .eq("dealership_id", dealershipId)
    .maybeSingle();

  const pillars = brandProfile?.messaging_pillars ?? [];
  const topic = pillars.length > 0 ? pillars[Math.floor(Math.random() * pillars.length)] : "";

  // Posted publicly with nobody reading it first, so the caption is
  // written from, and checked against, the business's real facts. No
  // facts, no post: unverifiable copy is exactly what must not go out
  // under the owner's name unreviewed.
  const facts = await gatherBusinessFactsSafely(supabase, dealershipId);
  if (!facts) return { skipped: "business facts unreadable" };
  const name = dealership.dealership_name ?? "the business";
  const category = dealership.business_category ?? "business";

  let imageUrl: string | null = null;
  let caption: string | null = null;
  let postId: string | null = null;
  let success = true;
  let error: string | null = null;
  let instagramPostId: string | null = null;
  let instagramError: string | null = null;

  try {
    // Single-shot by design: no revision pass on the path that publishes
    // with nobody reading first.
    const recent = await recentCopy(supabase, dealershipId);
    const [imageBuffer, firstAttempt] = await Promise.all([
      generateGraphic("social_graphic", name, category, topic, brandProfile),
      // Posted to Facebook AND Instagram from one caption: links kept here,
      // and swapped for "link in bio" only on the way to Instagram.
      generateContent("instagram_post", name, category, topic, brandProfile, undefined, undefined, facts, "publish", { recent, keepLinks: true }),
    ]);

    // A caption goes out only if it needed NO claims removed — a
    // stripped caption can read oddly, and nobody is checking it. One
    // fresh attempt, then the run is skipped: a post a day late beats a
    // false claim published under the owner's name.
    let contentResult = firstAttempt;
    if (!contentResult._fallback && contentResult.claimsRemoved?.length) {
      contentResult = await generateContent("instagram_post", name, category, topic, brandProfile, undefined, undefined, facts, "publish", { recent, keepLinks: true });
    }

    if (contentResult._aiFailure) throw new Error(`${aiFailureLabel(contentResult._aiFailure.kind)} — nothing was posted`);
    if (contentResult._fallback) throw new Error("Content generation fell back to placeholder — skipping this run rather than posting generic text");
    if (contentResult.claimsRemoved?.length) {
      throw new Error(`Skipped: the caption made claims Hawlai couldn't verify (${contentResult.claimsRemoved.slice(0, 2).join("; ")}) — nothing was posted`);
    }
    caption = captionForPost(contentResult.output);
    if (!caption) {
      caption = null;
      throw new Error("The generated post had no usable caption text — nothing was posted rather than publishing an image with no words.");
    }

    // An autopilot post is a real published piece, so it gets a real
    // piece row — which is also what makes it show on the Content
    // Marketing page beside everything else, instead of existing only in
    // content_autopilot_log where the owner never sees it.
    //
    // Saved BEFORE posting, because the Facebook caption can only carry
    // the mark once the piece has an identity. If the post then fails,
    // the row stays as a generated caption the owner can reuse, and the
    // failure itself is on the Automation Health card as always.
    const { data: savedPiece } = await supabase
      .from("content_pieces")
      .insert({ dealership_id: dealershipId, content_type: "instagram_post", topic: topic || "Autopilot post", output: contentResult.output })
      .select("id")
      .single();
    const pieceId = savedPiece?.id
      ? await registerPiece(supabase, { dealershipId, kind: "autopilot", sourceId: savedPiece.id, label: topic || "Autopilot post" })
      : null;

    const serviceClient = createServiceClient();
    const filePath = `content-autopilot/${dealershipId}/${Date.now()}.png`;
    await serviceClient.storage.from("ad-creatives").upload(filePath, imageBuffer, { contentType: "image/png", upsert: true });
    const { data: publicUrlData } = serviceClient.storage.from("ad-creatives").getPublicUrl(filePath);
    imageUrl = publicUrlData.publicUrl;

    // Facebook keeps real links, so its copy carries the mark; the
    // Instagram call below is given the unmarked caption, since its links
    // become "link in bio" anyway and Instagram organic stays
    // unattributed by decision.
    const result = await postPhotoToPage(dealership.fb_page_id, pageToken, imageUrl, markTrackedLinks(caption, pieceId).text);
    postId = result.id;
    // It IS live from here, so the cadence clock moves regardless of
    // what the read-back finds — otherwise tomorrow's run would publish
    // a second post on top of this one.
    await supabase.from("dealerships").update({ content_autopilot_last_posted_at: new Date().toISOString() }).eq("id", dealershipId);

    // Facebook returns an id whether or not the words made it. Ask for
    // them back: "" means the post is live with no caption, which is a
    // failure the owner needs to see. undefined means we couldn't read
    // it, which is NOT evidence of anything and is not reported as one.
    const landed = await readPostMessage(result.id, pageToken);
    if (landed === "") {
      throw new Error("Facebook published the image but shows no caption on it — the post is live without its text. Check it on your Page.");
    }

    // Instagram is best-effort and independent of Facebook's outcome
    // above — Facebook already succeeded by this point, so a failure
    // here (no IG account connected, expired permission, etc.)
    // shouldn't be reported as if the whole autopilot run failed.
    try {
      const igUserId = await getConnectedInstagramAccountId(dealership.fb_page_id, pageToken);
      if (igUserId) {
        const igResult = await postPhotoToInstagram(igUserId, pageToken, imageUrl, caption);
        instagramPostId = igResult.id;
      } else {
        instagramError = "No Instagram Business account connected to this Facebook Page";
      }
    } catch (igErr: any) {
      instagramError = igErr.message;
    }

  } catch (err: any) {
    success = false;
    error = err.message;
  }

  await supabase.from("content_autopilot_log").insert({
    dealership_id: dealershipId, caption, image_url: imageUrl, post_id: postId, success, error,
    instagram_post_id: instagramPostId, instagram_error: instagramError,
  });

  // A failure is RETURNED as { error } so the cron's run log records it
  // as one (runAndLog.ts). Returning { posted: false } alone let every
  // failed post count toward a "100% success" health line.
  return success
    ? { posted: true, postedToInstagram: Boolean(instagramPostId), ...(instagramError ? { instagramError } : {}) }
    : { posted: false, error };
}

// pageToken is PASSED, not re-derived from the row. This function
// receives `dealership` and could call readMetaPageToken itself, but
// that would decrypt a second time and, more importantly, create a
// second place that has to know the read rule.
async function postQueuedItem(supabase: any, dealershipId: string, dealership: any, pageToken: string, queuedPost: any) {
  let facebookPostId: string | null = null;
  let instagramPostId: string | null = null;
  let instagramError: string | null = null;
  let success = true;
  let error: string | null = null;

  try {
    const result = await postPhotoToPage(dealership.fb_page_id, pageToken, queuedPost.image_url, queuedPost.caption);
    facebookPostId = result.id;

    try {
      const igUserId = await getConnectedInstagramAccountId(dealership.fb_page_id, pageToken);
      if (igUserId) {
        const igResult = await postPhotoToInstagram(igUserId, pageToken, queuedPost.image_url, queuedPost.caption);
        instagramPostId = igResult.id;
      } else {
        instagramError = "No Instagram Business account connected to this Facebook Page";
      }
    } catch (igErr: any) {
      instagramError = igErr.message;
    }
  } catch (err: any) {
    success = false;
    error = err.message;
  }

  await supabase.from("social_post_queue").update({
    status: success ? "posted" : "failed",
    facebook_post_id: facebookPostId,
    instagram_post_id: instagramPostId,
    error,
    posted_at: new Date().toISOString(),
  }).eq("id", queuedPost.id);

  // Also logged into the same content_autopilot_log the fresh-
  // generation path uses, so "Recent" activity and the posting
  // success/fail stats card (built earlier tonight) show both kinds
  // of posts together, not as two separate untracked systems.
  await supabase.from("content_autopilot_log").insert({
    dealership_id: dealershipId, caption: queuedPost.caption, image_url: queuedPost.image_url, post_id: facebookPostId, success, error,
    instagram_post_id: instagramPostId, instagram_error: instagramError,
  });

  return { posted: success, postedToInstagram: Boolean(instagramPostId), fromQueue: true };
}
