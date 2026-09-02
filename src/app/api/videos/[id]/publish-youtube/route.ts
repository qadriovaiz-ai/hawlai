import { createClient } from "@/lib/supabase/server";
import { getValidYoutubeAccessToken, uploadVideoToYouTube } from "@/lib/agents/youtubeAgent";
import { NextResponse } from "next/server";
import { readToken, tokenWrite } from "@/lib/crypto/oauthSecrets";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.json({ error: "No dealership" }, { status: 400 });

  const { title, description } = await request.json();

  const { data: video } = await supabase.from("video_generations").select("id, video_url, prompt, status").eq("id", id).eq("dealership_id", dealershipId).single();
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (video.status !== "ready" || !video.video_url) return NextResponse.json({ error: "This video isn't ready yet" }, { status: 400 });

  const { data: dealership } = await supabase.from("dealerships").select("youtube_access_token, youtube_access_token_encrypted, youtube_refresh_token, youtube_refresh_token_encrypted, youtube_token_expiry").eq("id", dealershipId).single();

  // Encrypted column first, plaintext fallback while the backfill is
  // pending. Null means "not connected" — never a decryption error
  // thrown at a caller that only wanted to publish a video.
  const accessTokenValue = readToken(dealership, "youtube", "access_token");
  const refreshTokenValue = readToken(dealership, "youtube", "refresh_token");
  if (!refreshTokenValue) {
    return NextResponse.json({ error: "YouTube isn't connected yet — connect it from Business → Integrations first." }, { status: 400 });
  }

  try {
    const { accessToken, refreshed } = await getValidYoutubeAccessToken({
      // "" not null: an absent access token means "refresh it", which
      // is exactly what the refresh token below is for. The guard
      // above already rejected the genuinely-not-connected case.
      accessToken: accessTokenValue ?? "",
      refreshToken: refreshTokenValue,
      tokenExpiry: dealership?.youtube_token_expiry ?? null,
    });
    if (refreshed) {
      await supabase.from("dealerships").update({ ...tokenWrite("youtube", "access_token", refreshed.accessToken), youtube_token_expiry: refreshed.expiry }).eq("id", dealershipId);
    }

    const result = await uploadVideoToYouTube(accessToken, video.video_url, title || video.prompt.slice(0, 90), description || video.prompt);
    await supabase.from("video_generations").update({ youtube_video_id: result.videoId, youtube_url: result.url, youtube_publish_error: null }).eq("id", id);

    return NextResponse.json({ success: true, url: result.url });
  } catch (err: any) {
    await supabase.from("video_generations").update({ youtube_publish_error: err.message }).eq("id", id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
