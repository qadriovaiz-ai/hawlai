import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?snapchat_error=missing_code`);
  }

  try {
    const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? origin).replace(/\/$/, "")}/api/auth/snapchat/callback`;

    const tokenRes = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SNAPCHAT_CLIENT_ID ?? "",
        client_secret: process.env.SNAPCHAT_CLIENT_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.error_description ?? tokenData?.error ?? "Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;

    // Which organization and ad account to spend from. Best-effort:
    // a connection that succeeds but can't resolve an ad account is
    // still worth saving — launching reports a clear error until one
    // exists, rather than the whole connect flow failing.
    let orgId: string | null = null;
    let adAccountId: string | null = null;
    try {
      const meRes = await fetch("https://adsapi.snapchat.com/v1/me/organizations", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const me = await meRes.json();
      orgId = me?.organizations?.[0]?.organization?.id ?? null;

      if (orgId) {
        const acctRes = await fetch(`https://adsapi.snapchat.com/v1/organizations/${orgId}/adaccounts`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const acct = await acctRes.json();
        adAccountId = acct?.adaccounts?.[0]?.adaccount?.id ?? null;
      }
    } catch (e) {
      console.error("[snapchat-callback] account lookup failed:", e);
    }

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        snapchat_org_id: orgId,
        snapchat_ad_account_id: adAccountId,
        snapchat_access_token: access_token,
        snapchat_refresh_token: refresh_token ?? null,
        snapchat_token_expiry: new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?snapchat=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?snapchat_error=${encodeURIComponent(err.message)}`);
  }
}
