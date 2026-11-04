// PUBLISHING A VIDEO — a Dispatch, moved out of the approvals route in
// S6/P1 unchanged.
//
// A PUBLIC VIDEO IS THE CLEAREST CASE FOR THE FAMILY. publish/ asks
// "what was the value before, and does it still hold?" — for a YouTube
// upload there is no before. It can be deleted afterwards, but not
// unseen, and `cannotBeTakenBack` says exactly that rather than
// implying a tidy undo.

import type { DispatchContext, DispatchPreview, DispatchResult, Dispatcher } from "@/lib/dispatch/types";

async function youtubeRow(ctx: DispatchContext) {
  const { data } = await ctx.service
    .from("dealerships")
    .select(
      "youtube_access_token, youtube_refresh_token, youtube_access_token_encrypted, youtube_refresh_token_encrypted, youtube_token_expiry"
    )
    .eq("id", ctx.dealershipId)
    .maybeSingle();
  return data;
}

async function videoFor(ctx: DispatchContext, videoId: string) {
  const { data } = await ctx.service
    .from("video_generations")
    .select("id, video_url, prompt")
    .eq("id", videoId)
    .eq("dealership_id", ctx.dealershipId)
    .maybeSingle();
  return data;
}

export const videoDispatcher: Dispatcher = {
  key: "publish_video",
  undoable: false,
  // WHAT CANNOT BE TAKEN BACK, AND NOTHING ELSE — see the call
  // dispatcher's note. The wording is `publicPostConfirm`'s, which has
  // said this about a public post since September.
  cannotBeTakenBack:
    "It can be deleted afterwards, but not unseen.",

  async preview(ctx, details): Promise<DispatchPreview | { error: string }> {
    const video = await videoFor(ctx, String(details?.video_id ?? ""));
    if (!video?.video_url) return { error: "That video is no longer available, so there is nothing to publish." };
    const { readToken } = await import("@/lib/crypto/oauthSecrets");
    const warnings: string[] = [];
    if (!readToken(await youtubeRow(ctx), "youtube", "refresh_token")) {
      warnings.push("YouTube is not connected any more, so this cannot go out.");
    }
    return {
      summary: `"${details?.title ?? video.prompt}" published on YouTube`,
      to: "your YouTube channel — anyone can watch it",
      warnings,
    };
  },

  async execute(ctx, details, once): Promise<DispatchResult> {
    const dealership = await youtubeRow(ctx);
    const { readToken, tokenWrite } = await import("@/lib/crypto/oauthSecrets");
    const refresh = readToken(dealership, "youtube", "refresh_token");
    if (!refresh) return { ok: false, error: "YouTube isn't connected any more, so nothing was published.", status: 400 };

    // RE-READ, NOT THE ROW: a video can be gone by the time the card is
    // approved.
    const video = await videoFor(ctx, String(details?.video_id ?? ""));
    if (!video?.video_url) {
      return { ok: false, error: "That video is no longer available, so nothing was published.", status: 400 };
    }

    const { getValidYoutubeAccessToken, uploadVideoToYouTube } = await import("@/lib/agents/youtubeAgent");
    const { accessToken, refreshed } = await getValidYoutubeAccessToken({
      accessToken: readToken(dealership, "youtube", "access_token") ?? "",
      refreshToken: refresh,
      tokenExpiry: dealership?.youtube_token_expiry,
    });
    if (refreshed) {
      await ctx.service
        .from("dealerships")
        .update({ ...tokenWrite("youtube", "access_token", refreshed.accessToken), youtube_token_expiry: refreshed.expiry })
        .eq("id", ctx.dealershipId);
    }

    // NO IDEMPOTENCY KEY AT THE PLATFORM. YouTube's upload takes no
    // claim, so `once` cannot be handed on; the route's refusal of a
    // decided card is what stops a second upload (S6/P1a).
    void once;

    try {
      const uploaded = await uploadVideoToYouTube(accessToken, video.video_url, details?.title, details?.description ?? video.prompt);
      await ctx.service
        .from("video_generations")
        .update({ youtube_video_id: uploaded.videoId, youtube_url: uploaded.url })
        .eq("id", video.id);
      return { ok: true, note: `Published on YouTube: ${uploaded.url}`, verified: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "YouTube refused the upload, so nothing was published.", status: 500 };
    }
  },
};
