// ------------------------------------------------------------------
// Social Media Agent — Phase 2 basic version
// ------------------------------------------------------------------
// Organic (non-paid) Facebook posting — completely separate from the
// Paid Ads Agent. Costs nothing to run since organic posts aren't
// billed, so unlike ad launches this isn't blocked by the payment
// method issue. Uses the dealer's own Page token (same one saved
// during Facebook Connect).
// ------------------------------------------------------------------

import { logClaudeUsage } from "../usage/logUsage";

const GRAPH_VERSION = "v23.0";

export async function generateSocialCaption(
  prompt: string,
  brandProfile?: { tone_of_voice?: string | null; messaging_pillars?: string[] | null; preferred_language?: string | null } | null,
  businessCategory: string = "car dealership",
  logContext?: { supabase: any; dealershipId: string }
): Promise<string> {
  const brandContext = brandProfile
    ? `Brand tone: ${brandProfile.tone_of_voice ?? "friendly and professional"}. Key points to weave in if relevant: ${(brandProfile.messaging_pillars ?? []).join("; ") || "none"}. Preferred language: ${brandProfile.preferred_language ?? "hinglish"}.`
    : "No brand profile set — default to a warm, professional tone in Hinglish.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Write a short, engaging Facebook post caption for an Indian ${businessCategory} business's organic (non-ad) post.
What the post is about: "${prompt}"
${brandContext}
Keep it under 280 characters, conversational, 1-2 emojis max, can include 2-3 relevant hashtags at the end. Return JSON only: {"caption":"the caption text"}`,
          },
        ],
      }),
    });
    if (!response.ok) return prompt;
    const bodyText = await response.text();
    if (!bodyText.trim()) return prompt;
    const data = JSON.parse(bodyText);
    if (logContext && data.usage) await logClaudeUsage(logContext.supabase, logContext.dealershipId, "social_caption", data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const clean = (jsonMatch ? jsonMatch[0] : text).replace(/```json|```/g, "").trim();
    if (!clean) return prompt;
    const parsed = JSON.parse(clean);
    return parsed.caption ?? prompt;
  } catch (err: any) {
    console.error("[social-media-agent] generateSocialCaption error:", err.message);
    return prompt;
  }
}

export async function postPhotoToPage(
  pageId: string,
  pageAccessToken: string,
  imagePublicUrl: string,
  caption: string,
  scheduledPublishTime?: number
): Promise<{ id: string; permalink?: string }> {
  const body: Record<string, any> = {
    caption,
    access_token: pageAccessToken,
    url: imagePublicUrl,
  };

  if (scheduledPublishTime) {
    // Meta requires scheduled posts to be at least 10 minutes and at
    // most 6 months in the future — the API will reject anything
    // outside that window, so we just pass it through and surface
    // whatever error Meta gives back.
    body.published = false;
    body.scheduled_publish_time = scheduledPublishTime;
  } else {
    body.published = true;
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`${e.message ?? "Facebook post failed"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}`);
  }
  return { id: data.post_id ?? data.id };
}

// Finds the Instagram Business Account connected to this Facebook
// Page — Instagram posting always goes through a linked Page's own
// access token, there's no separate Instagram-only auth needed if
// the accounts are already connected (done once, in Meta's own
// Business Suite, outside Hawlai).
export async function getConnectedInstagramAccountId(pageId: string, pageAccessToken: string): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`);
  const data = await res.json();
  return data?.instagram_business_account?.id ?? null;
}

// Instagram Graph API posting is two calls, not one: create a media
// container, then publish it — unlike Facebook's single-call /photos
// endpoint. Both calls use the same Page access token as Facebook
// posting (Instagram Business accounts are authenticated through
// their linked Page, not a separate Instagram login).
export async function postPhotoToInstagram(
  igUserId: string,
  pageAccessToken: string,
  imagePublicUrl: string,
  caption: string
): Promise<{ id: string }> {
  const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imagePublicUrl, caption, access_token: pageAccessToken }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    const e = createData.error ?? {};
    throw new Error(`${e.message ?? "Instagram post creation failed"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}`);
  }

  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: createData.id, access_token: pageAccessToken }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    const e = publishData.error ?? {};
    throw new Error(`${e.message ?? "Instagram publish failed"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}`);
  }
  return { id: publishData.id };
}
