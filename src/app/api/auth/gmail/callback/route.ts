import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/connect-facebook?gmail_error=missing_code`);
  }

  try {
    const redirectUri = `${origin}/api/auth/gmail/callback`;

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
      // Google only returns a refresh_token the FIRST time a user
      // consents (or if prompt=consent forces re-consent). If this
      // fires, they likely already granted access previously without
      // us storing it — ask them to revoke access in their Google
      // Account and reconnect.
      throw new Error("Didn't receive a refresh token — remove Hawlai's access at myaccount.google.com/permissions and try connecting again.");
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        gmail_email: userInfo.email ?? null,
        gmail_access_token: access_token,
        gmail_refresh_token: refresh_token,
        gmail_token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/connect-facebook?gmail=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/connect-facebook?gmail_error=${encodeURIComponent(err.message)}`);
  }
}
