import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { tokenWrite } from "@/lib/crypto/oauthSecrets";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?youtube_error=missing_code`);
  }

  try {
    const redirectUri = `${origin}/api/auth/youtube/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.error_description ?? tokenData?.error ?? "Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!refresh_token) {
      throw new Error("Didn't receive a refresh token — remove Hawlai's access at myaccount.google.com/permissions and try connecting again.");
    }

    // Find the channel this account owns — YouTube uploads always go
    // to "the authenticated user's own channel," so we fetch it now
    // to show the dealer which channel got connected, not just an
    // opaque "connected" state.
    const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const channelData = await channelRes.json();
    const channel = channelData?.items?.[0];

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        youtube_channel_id: channel?.id ?? null,
        youtube_channel_title: channel?.snippet?.title ?? null,
        ...tokenWrite("youtube", "access_token", access_token),
        ...(refresh_token ? tokenWrite("youtube", "refresh_token", refresh_token) : {}),
        youtube_token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?youtube=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?youtube_error=${encodeURIComponent(err.message)}`);
  }
}
