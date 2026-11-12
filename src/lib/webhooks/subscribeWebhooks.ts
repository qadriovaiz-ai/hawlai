// Asking Meta to actually send us the webhooks.
//
// THE BUG THIS FIXES. The DM and comment auto-reply toggles were on in
// production and `auto_reply_log` had zero rows, ever — because nothing
// in this codebase had ever subscribed a Page or an Instagram account to
// the app. Meta does not deliver `messages` or `feed` for a Page that is
// not subscribed, so the handler's gates were never even reached. The
// product was waiting for a call nobody had asked for.
//
// A PAGE IS SUBSCRIBED PER PAGE, NOT PER APP. Configuring the webhook
// product in the Meta App dashboard is necessary and NOT sufficient:
// every Page must additionally be installed on the app through its own
// `subscribed_apps` edge, with the Page's own token. That second step is
// the one that was missing, and it is invisible from the dashboard.
//
// WHICH FIELDS, AND WHY EXACTLY THESE TWO:
//
//   messages   the customer DM the auto-reply answers
//   feed       a Page's posts and comments — `handleAutoReplyEntry`
//              reads `change.field === "feed"` with
//              `value.item === "comment"`, so this is the field that
//              carries a comment, not a field called "comments"
//
// Instagram's edge takes `comments` instead of `feed`, because Instagram
// comments arrive on their own field. These are not interchangeable
// names for one thing, and asking for the wrong one subscribes
// successfully and then delivers nothing.
//
// TWO DIFFERENT API SURFACES, the same split `autoReplyHandler` already
// lives with: a Facebook Page goes through graph.facebook.com with the
// token as a query parameter, and an Instagram Business Login account
// goes through graph.instagram.com with a Bearer header.
//
// NEVER THROWS. A failed subscription must not break the connection
// flow the owner is in the middle of — it is recorded so they can be
// told, and retried.

const FB_GRAPH_VERSION = "v19.0";
const IG_GRAPH_VERSION = "v26.0";

/** The Page fields the auto-reply needs. `feed` is what carries a comment. */
export const FB_WEBHOOK_FIELDS = ["messages", "feed"] as const;

/** The Instagram fields. `comments` here, NOT `feed`. */
export const IG_WEBHOOK_FIELDS = ["messages", "comments"] as const;

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: string };

function failed(message: unknown, fallback: string): SubscribeResult {
  const text = String(message ?? "").replace(/\s+/g, " ").trim();
  return { ok: false, reason: (text || fallback).slice(0, 300) };
}

/**
 * Install the app on a Facebook Page, so Meta delivers its webhooks.
 *
 * NEEDS `pages_manage_metadata` ON THE TOKEN. Without it this call is
 * rejected, which is why the connect route had to start asking for it —
 * and why an owner connected before that change must reconnect: an old
 * token cannot grant itself a permission it was never given.
 */
export async function subscribeFacebookPage(
  pageId: string | null | undefined,
  pageAccessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<SubscribeResult> {
  const id = String(pageId ?? "").trim();
  const token = String(pageAccessToken ?? "").trim();
  if (!id) return { ok: false, reason: "no Facebook page id to subscribe" };
  if (!token) return { ok: false, reason: "no Facebook page access token to subscribe with" };

  try {
    const url = new URL(`https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(id)}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", FB_WEBHOOK_FIELDS.join(","));
    url.searchParams.set("access_token", token);
    const res = await fetchImpl(url.toString(), { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) return failed(data?.error?.message, `Facebook returned ${res.status}`);
    // Meta answers { success: true }. Anything else is not a
    // subscription, however encouraging the status code was.
    if (data?.success !== true) return failed(data?.error?.message, "Facebook did not confirm the subscription");
    return { ok: true };
  } catch (err: any) {
    return failed(err?.message, "could not reach Facebook");
  }
}

/** The same, for an Instagram Business Login account. */
export async function subscribeInstagramAccount(
  igBusinessId: string | null | undefined,
  accessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<SubscribeResult> {
  const id = String(igBusinessId ?? "").trim();
  const token = String(accessToken ?? "").trim();
  if (!id) return { ok: false, reason: "no Instagram business id to subscribe" };
  if (!token) return { ok: false, reason: "no Instagram access token to subscribe with" };

  try {
    const url = new URL(`https://graph.instagram.com/${IG_GRAPH_VERSION}/${encodeURIComponent(id)}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", IG_WEBHOOK_FIELDS.join(","));
    const res = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return failed(data?.error?.message, `Instagram returned ${res.status}`);
    if (data?.success !== true) return failed(data?.error?.message, "Instagram did not confirm the subscription");
    return { ok: true };
  } catch (err: any) {
    return failed(err?.message, "could not reach Instagram");
  }
}

/**
 * Subscribe and record the answer (migration 227).
 *
 * THE RECORD IS THE POINT. The previous version of this problem was
 * silent in both directions: nothing subscribed, and nothing said so.
 * A subscription that fails now leaves a sentence on the business, so
 * the Integrations page can say "connected, but Meta is not sending
 * messages, because X" instead of looking fine while nothing arrives.
 *
 * NEVER THROWS, so a failure here cannot break the connect flow the
 * owner is standing in.
 */
export async function subscribeAndRecord(
  supabase: any,
  dealershipId: string,
  channel: "facebook" | "instagram",
  ids: { id: string | null | undefined; token: string | null | undefined },
  opts: { fetcher?: typeof fetch; now?: Date } = {}
): Promise<SubscribeResult> {
  const result = channel === "facebook"
    ? await subscribeFacebookPage(ids.id, ids.token, opts.fetcher)
    : await subscribeInstagramAccount(ids.id, ids.token, opts.fetcher);

  const at = channel === "facebook" ? "fb_webhook_subscribed_at" : "ig_webhook_subscribed_at";
  const err = channel === "facebook" ? "fb_webhook_error" : "ig_webhook_error";

  try {
    await supabase
      .from("dealerships")
      .update({
        // ON SUCCESS THE ERROR IS CLEARED, and on failure the timestamp
        // is: a stale "subscribed at" beside a live error would read as
        // "it worked once", which is exactly the ambiguity that cost
        // eight days last time.
        [at]: result.ok ? (opts.now ?? new Date()).toISOString() : null,
        [err]: result.ok ? null : result.reason,
      })
      .eq("id", dealershipId);
  } catch (e: any) {
    console.error(`[webhook-subscribe] ${dealershipId}: could not record the ${channel} subscription: ${e?.message ?? e}`);
  }

  if (!result.ok) {
    console.error(`[webhook-subscribe] ${dealershipId}: ${channel} subscription failed: ${result.reason}`);
  }
  return result;
}
