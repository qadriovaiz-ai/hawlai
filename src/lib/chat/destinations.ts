// Where a post would actually go, checked BEFORE the button exists.
//
// THE LIVE INCIDENT (8 Oct 2026). The owner asked for "an Instagram
// caption". The card was titled "Instagram Post" and carried
// Approve & Publish. The button posted to a Facebook Page — publicly,
// with a generated image — and only afterwards did Hawlai mention that
// no Instagram account was connected.
//
// Every one of those checks existed. They ran inside
// /api/social/post, AFTER the press: fb_page_id at line 46,
// getConnectedInstagramAccountId at line 103 — and the Facebook post is
// sent before the Instagram attempt, so the discovery came after the
// post was public. A check that runs after an irreversible action is not
// a check.
//
// So this resolves the destinations first, and the card is built from
// the answer: a platform that cannot receive a post gets no button.

import { readMetaPageToken } from "@/lib/crypto/oauthSecrets";
// The type and the confirmation sentence live in a module with no
// server imports, so the chat card can use them without dragging the
// token decryption into the browser bundle. Re-exported here so every
// existing caller keeps working.
export { publicPostConfirm, type Destination } from "./postConfirm";
import { type Destination } from "./postConfirm";

export type Destinations = {
  facebook: Destination;
  instagram: Destination;
  /** True when at least one platform can receive a post. */
  anyConnected: boolean;
};

const NOT_CONNECTED_FB =
  "Your Facebook Page isn't connected, so there's nowhere to post. Connect it in Settings → Integrations.";

/**
 * What the Instagram DM connection is NOT.
 *
 * Settings shows "Instagram DM Auto-Reply: Connected", which is true and
 * has nothing to do with publishing. That connection is Instagram Login
 * with instagram_business_basic / manage_messages / manage_comments —
 * no instagram_content_publish — and it is stored on its own columns the
 * publish path never reads. Publishing needs an Instagram Professional
 * account LINKED TO THE FACEBOOK PAGE, which is a different thing the
 * owner sets up in a different place.
 */
const NOT_CONNECTED_IG =
  "Posting to Instagram isn't connected. The Instagram connection in Settings handles DM replies only — publishing needs an Instagram professional account linked to your Facebook Page.";

/**
 * Resolve both destinations.
 *
 * One Graph call, and only when a Page token exists: asking Meta whether
 * an Instagram account is linked is the only way to know, and it is the
 * question that went unasked until after the post.
 */
export async function readDestinations(
  supabase: any,
  dealershipId: string,
  deps: { fetchImpl?: typeof fetch } = {}
): Promise<Destinations> {
  const { data: row } = await supabase
    .from("dealerships")
    .select("fb_page_id, fb_page_name, fb_page_access_token, fb_page_access_token_encrypted")
    .eq("id", dealershipId)
    .maybeSingle();

  const pageId = row?.fb_page_id ?? null;
  const pageName = row?.fb_page_name ?? null;
  const token = row ? readMetaPageToken(row) ?? process.env.META_PAGE_ACCESS_TOKEN ?? null : null;

  const facebook: Destination = pageId && token
    ? { platform: "facebook", name: pageName, connected: true, why: null }
    : { platform: "facebook", name: pageName, connected: false, why: NOT_CONNECTED_FB };

  let instagram: Destination = { platform: "instagram", name: null, connected: false, why: NOT_CONNECTED_IG };
  if (pageId && token) {
    try {
      const { getConnectedInstagramAccountId } = await import("@/lib/agents/socialMediaAgent");
      const igId = await getConnectedInstagramAccountId(pageId, token);
      if (igId) instagram = { platform: "instagram", name: null, connected: true, why: null };
    } catch {
      // Could not ask Meta. Unknown is NOT connected here, deliberately:
      // offering a publish button on a maybe is how the live post
      // happened. The owner can retry.
      instagram = {
        platform: "instagram",
        name: null,
        connected: false,
        why: "I couldn't check your Instagram connection just now, so I'm not offering to post there — try again in a moment.",
      };
    }
  }

  return { facebook, instagram, anyConnected: facebook.connected || instagram.connected };
}
