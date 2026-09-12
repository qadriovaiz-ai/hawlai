// Acting on generated work without leaving the chat.
//
// Chat could already generate a website draft or a social caption and
// SAY it had — but the only way to act on it was to navigate to the
// department page. The approval card (price changes, ad launches)
// proved the shape: preview, decide, see what happened, in the message.
// This gives the same treatment to content that goes live.
//
// Deliberately NOT a new publish path: each descriptor points at the
// endpoint that already publishes that thing (/api/website-builder/
// publish, /api/social/post), so chat can never publish something by a
// route the rest of the app doesn't use.
//
// Every descriptor carries its own CONFIRM sentence, because these two
// actions are not equal and neither has been verified end-to-end in
// production yet: publishing the site makes every page public at once,
// and a social post is instantly visible to followers. The button asks
// first, in words that say exactly what is about to happen.

export type PublishAction = {
  target: "website" | "social_post";
  /** The button. */
  label: string;
  /** Shown after the button is pressed, before anything happens. */
  confirm: string;
  /** An existing endpoint — never a chat-only publish path. */
  endpoint: string;
  method: "POST" | "PATCH";
  payload: Record<string, unknown>;
  /** What the card says once it worked. */
  done: string;
  /** How to throw the draft away, when there's a saved row to throw away. */
  discard?: { endpoint: string; method: "DELETE"; payload: Record<string, unknown>; done: string };
};

/** Content types that are a post someone publishes, not a document they keep. */
export const SOCIAL_POST_TYPES = new Set(["instagram_post", "facebook_post", "threads_post"]);

/**
 * Publishing the whole site.
 *
 * There is no per-page publish in the product — `websites.published` is
 * one flag for the whole site — so the confirm says that plainly rather
 * than implying this page alone goes live.
 */
export function websitePublishAction(): PublishAction {
  return {
    target: "website",
    label: "Approve & Publish",
    confirm:
      "This publishes your ENTIRE live site — every page, not just this one — and anyone with the link can see it straight away. You can unpublish again from Website Builder.",
    endpoint: "/api/website-builder/publish",
    method: "PATCH",
    payload: { published: true },
    done: "✅ Published to your live site",
  };
}

/**
 * Posting a generated caption.
 *
 * Instagram needs a picture — its API has no text-only post — so a
 * caption with no image is Facebook-only, and the confirm says which
 * channels are actually about to receive it rather than promising both.
 */
export function socialPublishAction(opts: { caption: string; imageUrl?: string | null; draftId?: string | null }): PublishAction | null {
  const caption = (opts.caption ?? "").trim();
  if (!caption) return null;

  const imageUrl = opts.imageUrl ?? null;
  const channels = imageUrl ? "Facebook and Instagram" : "Facebook";

  return {
    target: "social_post",
    label: "Approve & Publish",
    confirm: imageUrl
      ? "This posts live to your Facebook Page and Instagram right now, where your followers will see it. It can be deleted afterwards, but not unseen."
      : "This posts live to your Facebook Page right now, where your followers will see it. There's no image on this one, so Instagram is skipped — ask me to generate an image first if you want it there too.",
    endpoint: "/api/social/post",
    method: "POST",
    payload: { caption, image_url: imageUrl, post_to_instagram: Boolean(imageUrl) },
    done: `✅ Posted to ${channels}`,
    ...(opts.draftId
      ? {
          discard: {
            endpoint: "/api/content-marketing/generate",
            method: "DELETE" as const,
            payload: { id: opts.draftId },
            done: "❌ Rejected — draft discarded",
          },
        }
      : {}),
  };
}

/** The caption out of a generated content result, whatever shape the model returned. */
export function captionFrom(result: any): string {
  if (!result || typeof result !== "object") return "";
  for (const key of ["text", "caption", "post", "content"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const firstString = Object.entries(result).find(([k, v]) => !k.startsWith("_") && typeof v === "string" && (v as string).trim());
  return firstString ? (firstString[1] as string).trim() : "";
}

/**
 * A caption generated in the same turn as an image belongs with it.
 *
 * The two come from separate tool calls (generate_content and
 * generate_graphic), so neither knows about the other — this pairs them
 * once the turn's artifacts are all in, which is also what decides
 * whether Instagram is offered at all.
 */
export function attachTurnImages<T extends { kind: string; type?: string; url?: string; publish?: PublishAction }>(artifacts: T[]): T[] {
  const image = artifacts.find((a) => a.kind === "visual" && a.type === "image" && typeof a.url === "string")?.url;
  if (!image) return artifacts;
  for (const artifact of artifacts) {
    const publish = artifact.publish;
    if (publish?.target === "social_post" && !publish.payload.image_url) {
      publish.payload = { ...publish.payload, image_url: image, post_to_instagram: true };
      publish.confirm = socialPublishAction({ caption: String(publish.payload.caption ?? ""), imageUrl: image })!.confirm;
      publish.done = "✅ Posted to Facebook and Instagram";
    }
  }
  return artifacts;
}
