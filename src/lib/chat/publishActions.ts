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

import { publicPostConfirm, type Destination } from "./destinations";

export type PublishAction = {
  target: "website" | "social_post" | "email" | "image";
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

/**
 * Sending a marketing email chat wrote to a lead or customer.
 *
 * Chat shows the email exactly as it will arrive and sends nothing until
 * the owner confirms. The endpoint is the same one a lead's page sends
 * from, and it runs every rule again at send time — on record, not
 * unsubscribed, business address present — so a confirm can't bypass them.
 */
export function emailSendAction(opts: { to: string; businessName: string; payload: Record<string, unknown> }): PublishAction {
  return {
    target: "email",
    label: "Send email",
    confirm: `This sends the email to ${opts.to} now, from ${opts.businessName}, with your business address and an unsubscribe link in the footer. It can't be unsent.`,
    endpoint: "/api/email/send",
    method: "POST",
    payload: { to: opts.to, ...opts.payload },
    done: `✅ Sent to ${opts.to} — accepted for delivery, not yet confirmed in their inbox`,
  };
}

/**
 * Spending money on an image, with the price said first.
 *
 * THE LIVE INCIDENT (8 Oct 2026). "MAKE POST AND WRITE A INSTAGRAM
 * CAPTION FOR LAVENDER CANDLE" ran Generate Graphic. One sentence, a
 * paid Gemini call, no mention of cost, no agreement to spend anything
 * — while Graphic Design was on hold for exactly that reason.
 *
 * The chat tool no longer generates. It quotes, and this button is what
 * spends: it calls the SAME endpoint the Graphic Design page uses, which
 * runs the plan's monthly image cap again at generation time, so the
 * quote cannot bypass it.
 */
export function imageGenerateAction(opts: {
  designType: string;
  prompt: string;
  costInr: number;
  /** Said plainly when there is no photo of the product to build around. */
  depictionNote?: string | null;
}): PublishAction {
  const price = `about ₹${opts.costInr.toFixed(2)}`;
  return {
    target: "image",
    label: `Generate the image (${price})`,
    confirm: `This makes one AI image now. It costs ${price} and counts against your plan's monthly image allowance.${
      opts.depictionNote ? ` ${opts.depictionNote}` : ""
    }`,
    endpoint: "/api/graphic-design/generate",
    method: "POST",
    payload: { designType: opts.designType, prompt: opts.prompt },
    done: "✅ Image generated — saved to Graphic Design",
  };
}

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
 * Posting a generated caption — to a named destination.
 *
 * THE LIVE INCIDENT (8 Oct 2026). The owner asked for an Instagram
 * caption, the card said "Instagram Post", and the button published
 * PUBLICLY to a Facebook Page with a generated image. The label came
 * from the content TYPE and the button came from here, and nothing
 * reconciled the two. The owner pressed a button that did not say where
 * it was going.
 *
 * So the destination is resolved first (src/lib/chat/destinations.ts)
 * and passed in. The button says the Page's name, the confirmation says
 * what will be public, and a destination that is not connected gets no
 * button at all — the caller offers Copy caption instead.
 */
export function socialPublishAction(opts: {
  /** The exact text the card is showing — composePost, not a second pass. */
  text: string;
  to: Destination;
  imageUrl?: string | null;
  /** Where the picture came from, so the card can say so. */
  imageSource?: "uploaded" | "site" | "ai" | null;
  draftId?: string | null;
}): PublishAction | null {
  const text = (opts.text ?? "").trim();
  if (!text) return null;
  // No button for somewhere we cannot post. This is the check that ran
  // after the press instead of before it.
  if (!opts.to.connected) return null;

  const imageUrl = opts.imageUrl ?? null;
  const toInstagram = opts.to.platform === "instagram";
  const where = toInstagram ? "Instagram" : `Facebook Page${opts.to.name ? `: ${opts.to.name}` : ""}`;

  return {
    target: "social_post",
    label: `Publish to your ${where}`,
    confirm: publicPostConfirm(opts.to, { hasImage: Boolean(imageUrl) }),
    endpoint: "/api/social/post",
    method: "POST",
    payload: {
      // THE SAME TEXT THE CARD SHOWED. `captionFrom` used to recompute
      // it here and dropped the hashtags on the way.
      caption: text,
      image_url: imageUrl,
      post_to_instagram: toInstagram,
      // WHICH platform, not "Facebook plus maybe Instagram". The
      // endpoint posts to Facebook first and treats Instagram as an
      // extra; naming the destination is what stops an Instagram card
      // publishing to a Facebook Page.
      destination: opts.to.platform,
      image_source: opts.imageSource ?? null,
      destination_name: opts.to.name ?? null,
      content_piece_id: opts.draftId ?? null,
      // The endpoint reads the post back and compares against this.
      expect_text: text,
    },
    done: `✅ Posted to your ${where}`,
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
      // THE IMAGE IS ATTACHED. THE DESTINATION IS NOT CHANGED.
      //
      // This used to set `post_to_instagram: true` here, which sent the
      // post to a second public platform the confirmation had never
      // named — the owner approved "your Facebook Page" and Instagram
      // was added by a function that only knew an image existed.
      publish.payload = { ...publish.payload, image_url: image };
      // The confirmation does have to mention the image now that there
      // is one. Rebuilt from the destination this action already
      // carries, so the Page's name does not quietly disappear.
      publish.confirm = publicPostConfirm(
        {
          platform: (publish.payload.destination as "facebook" | "instagram") ?? "facebook",
          name: (publish.payload.destination_name as string | null) ?? null,
          connected: true,
          why: null,
        },
        { hasImage: true }
      );
    }
  }
  return artifacts;
}
