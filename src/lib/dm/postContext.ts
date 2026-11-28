// "Which post do they mean?" — T1 of docs/PLAN-INSTAGRAM-SELLER-MODE.md,
// 28 November 2026, built on the two shapes RECORDED from the founder's
// live test (messageShape.ts), not on documentation:
//
//   a shared post   attachments[ig_post{payload:ig_post_media_id,url}], no text
//   a story reply   text + reply_to{story:id,url}
//
// Before this, a shared post got NO reply (a DM with no text was skipped)
// and a story reply ("iska price?") was answered as if it pointed at
// nothing.
//
// WHAT IT DOES: reads which post or story the DM points at, asks Instagram
// for that post's caption with the shop's own token, and — when the
// caption carries `#HawlaiTag: <product name>` matching exactly one
// catalog product — names the product. That much of T2 needs no table:
// the caption is read when the customer asks. The reply itself is still
// written by the ordinary path and passes the claims guard; this only
// tells it what the customer is looking at.
//
// UNVERIFIED LIVE: whether a STORY's id can be read for its caption (stories
// expire; Meta may refuse). Every failure here degrades to "they pointed at
// a post we couldn't read" — the customer is still answered.

export type PostRef = { kind: "post" | "story"; mediaId: string | null };

const MEDIA_ID = /^\d{5,30}$/;

/** The post or story a DM points at, by the recorded shapes — or null. */
export function readPostRef(message: unknown): PostRef | null {
  const m = (message ?? {}) as Record<string, any>;
  const story = m?.reply_to?.story;
  if (story && typeof story === "object") {
    const id = String(story.id ?? "");
    return { kind: "story", mediaId: MEDIA_ID.test(id) ? id : null };
  }
  for (const a of Array.isArray(m?.attachments) ? m.attachments : []) {
    if (a?.type === "ig_post" || a?.type === "share") {
      const id = String(a?.payload?.ig_post_media_id ?? "");
      return { kind: "post", mediaId: MEDIA_ID.test(id) ? id : null };
    }
  }
  return null;
}

/**
 * The caption and photo of the shop's own post, or nulls. Never throws: a
 * post that can't be read is a degraded answer, not a missing one. A
 * video's photo is its thumbnail (T3, 28 Nov 2026).
 */
export async function fetchPost(accessToken: string, mediaId: string): Promise<{ caption: string | null; imageUrl: string | null }> {
  const nothing = { caption: null, imageUrl: null };
  try {
    const res = await fetch(`https://graph.instagram.com/v26.0/${mediaId}?fields=caption,media_type,media_url,thumbnail_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return nothing;
    const data = await res.json().catch(() => null);
    const caption = typeof data?.caption === "string" ? data.caption.trim() : "";
    const photo = data?.media_type === "VIDEO" ? data?.thumbnail_url : data?.media_url;
    return { caption: caption || null, imageUrl: typeof photo === "string" && /^https:\/\//.test(photo) ? photo : null };
  } catch {
    return nothing;
  }
}

/**
 * `#HawlaiTag: <product name>` in a caption → that product, when exactly
 * one catalog product has that name (ignoring case). Anything else — no
 * tag, an unknown name, two products sharing it — is null: a guess about
 * what a customer is paying for is never made.
 */
export function productFromCaption(caption: string | null, catalog: { name: string }[]): string | null {
  const m = /#HawlaiTag:\s*([^\n#]+)/i.exec(caption ?? "");
  if (!m) return null;
  const wanted = m[1].trim().replace(/\s+/g, " ").toLowerCase();
  const hits = catalog.filter((p) => p.name.trim().replace(/\s+/g, " ").toLowerCase() === wanted);
  return hits.length === 1 ? hits[0].name : null;
}

/**
 * The customer's message as the reply reads it: what they pointed at,
 * then what they wrote. The caption is the shop's own published words.
 */
export function withPostContext(
  text: string,
  ref: PostRef,
  caption: string | null,
  product: string | null,
  guess: { product: string | null; confidence: "high" | "low" | "none" } | null = null
): string {
  const what = ref.kind === "story" ? "replied to your Instagram story" : "shared your Instagram post";
  const said = text.trim() ? `Their message: "${text.trim()}"` : "They sent no message with it.";
  if (product) return `[The customer ${what} showing the product "${product}".] ${said}`;
  // T3: A PHOTO GUESS IS NEVER A FACT — the reply must ask first.
  if (guess?.product && guess.confidence === "high") {
    return `[The customer ${what}. From its photo it MAY show "${guess.product}" — this is a guess: ask them "is it the ${guess.product}?" before giving any price.] ${said}`;
  }
  if (guess?.confidence === "low") return `[The customer ${what}. It isn't clear from its photo which product it shows — ask which product they mean.] ${said}`;
  if (caption) return `[The customer ${what}. Its caption: "${caption.slice(0, 300).replace(/\s+/g, " ")}"] ${said}`;
  return `[The customer ${what}, which couldn't be read — ask which product they mean.] ${said}`;
}
