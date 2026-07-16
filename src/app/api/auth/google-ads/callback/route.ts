import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?google_ads_error=missing_code`);
  }

  try {
    const redirectUri = `${origin}/api/auth/google-ads/callback`;

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

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Best-effort: find which Google Ads accounts this user can access.
    // Doesn't block the connection if it fails (e.g. developer token
    // still on Test Account Access, or no accounts linked yet) — the
    // dealer can still be "connected" and pick/link an account later.
    let customerId: string | null = null;
    try {
      const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (devToken) {
        const listRes = await fetch("https://googleads.googleapis.com/v19/customers:listAccessibleCustomers", {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "developer-token": devToken,
          },
        });
        const listData = await listRes.json();
        const first = listData?.resourceNames?.[0]; // e.g. "customers/1234567890"
        if (first) customerId = first.replace("customers/", "");
      }
    } catch (e) {
      console.error("[google-ads-callback] listAccessibleCustomers failed:", e);
    }

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        google_ads_email: userInfo.email ?? null,
        google_ads_access_token: access_token,
        google_ads_refresh_token: refresh_token,
        google_ads_token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
        google_ads_customer_id: customerId,
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?google_ads=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?google_ads_error=${encodeURIComponent(err.message)}`);
  }
}
