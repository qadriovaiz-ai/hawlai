import { createClient } from "@/lib/supabase/server";
import { getValidYoutubeAccessToken, uploadVideoToYouTube } from "@/lib/agents/youtubeAgent";
import { NextResponse } from "next/server";

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

  const { data: dealership } = await supabase.from("dealerships").select("youtube_access_token, youtube_refresh_token, youtube_token_expiry").eq("id", dealershipId).single();
  if (!dealership?.youtube_refresh_token) {
    return NextResponse.json({ error: "YouTube isn't connected yet — connect it from Business → Integrations first." }, { status: 400 });
  }

  try {
    const { accessToken, refreshed } = await getValidYoutubeAccessToken({
      accessToken: dealership.youtube_access_token,
      refreshToken: dealership.youtube_refresh_token,
      tokenExpiry: dealership.youtube_token_expiry,
    });
    if (refreshed) {
      await supabase.from("dealerships").update({ youtube_access_token: refreshed.accessToken, youtube_token_expiry: refreshed.expiry }).eq("id", dealershipId);
    }

    const result = await uploadVideoToYouTube(accessToken, video.video_url, title || video.prompt.slice(0, 90), description || video.prompt);
    await supabase.from("video_generations").update({ youtube_video_id: result.videoId, youtube_url: result.url, youtube_publish_error: null }).eq("id", id);

    return NextResponse.json({ success: true, url: result.url });
  } catch (err: any) {
    await supabase.from("video_generations").update({ youtube_publish_error: err.message }).eq("id", id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
