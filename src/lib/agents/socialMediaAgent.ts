// ------------------------------------------------------------------
// Social Media Agent — Phase 2 basic version
// ------------------------------------------------------------------
// Organic (non-paid) Facebook posting — completely separate from the
// Paid Ads Agent. Costs nothing to run since organic posts aren't
// billed, so unlike ad launches this isn't blocked by the payment
// method issue. Uses the dealer's own Page token (same one saved
// during Facebook Connect).
// ------------------------------------------------------------------

const GRAPH_VERSION = "v23.0";

export async function generateSocialCaption(
  prompt: string,
  brandProfile?: { tone_of_voice?: string | null; messaging_pillars?: string[] | null; preferred_language?: string | null } | null
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
            content: `Write a short, engaging Facebook post caption for an Indian car dealership's organic (non-ad) post.
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
