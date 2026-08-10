import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Receives Instagram's redirect after the person logs in and clicks
// Allow. Exchanges the code for a short-lived token, then a
// long-lived one (60 days), fetches the real Instagram Business
// Account ID, and saves both automatically — the person never sees
// or handles a token directly.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const dealershipId = searchParams.get("state");
  const error = searchParams.get("error");

  const integrationsUrl = new URL("/dashboard/settings/integrations", process.env.NEXT_PUBLIC_SITE_URL);

  if (error || !code || !dealershipId) {
    integrationsUrl.searchParams.set("instagram_error", error ?? "Connection was cancelled or incomplete");
    return NextResponse.redirect(integrationsUrl);
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    integrationsUrl.searchParams.set("instagram_error", "Instagram app credentials not configured");
    return NextResponse.redirect(integrationsUrl);
  }

  try {
    const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/api/auth/instagram/callback`;

    // Step 1: exchange the authorization code for a short-lived token.
    const tokenForm = new URLSearchParams();
    tokenForm.set("client_id", appId);
    tokenForm.set("client_secret", appSecret);
    tokenForm.set("grant_type", "authorization_code");
    tokenForm.set("redirect_uri", redirectUri);
    tokenForm.set("code", code);

    const shortLivedRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: tokenForm,
    });
    const shortLivedData = await shortLivedRes.json();
    if (!shortLivedRes.ok || !shortLivedData.access_token) {
      throw new Error(shortLivedData?.error_message ?? "Failed to get access token from Instagram");
    }

    // Step 2: exchange for a long-lived token (60 days instead of 1 hour).
    const longLivedUrl = new URL("https://graph.instagram.com/access_token");
    longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set("access_token", shortLivedData.access_token);
    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedRes.json();
    const finalToken = longLivedRes.ok && longLivedData.access_token ? longLivedData.access_token : shortLivedData.access_token;

    // Step 3: fetch the real Instagram Business Account ID this token represents.
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${finalToken}`);
    const meData = await meRes.json();
    if (!meRes.ok || !meData.id) throw new Error("Couldn't verify the connected Instagram account");

    const service = createServiceClient();
    const { error: dbError } = await service.from("dealerships").update({
      instagram_business_id: meData.id,
      instagram_access_token: finalToken,
    }).eq("id", dealershipId);
    if (dbError) throw new Error(dbError.message);

    integrationsUrl.searchParams.set("instagram_connected", meData.username ?? "1");
    return NextResponse.redirect(integrationsUrl);
  } catch (err: any) {
    integrationsUrl.searchParams.set("instagram_error", err.message);
    return NextResponse.redirect(integrationsUrl);
  }
}
