import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { tokenWrite } from "@/lib/crypto/oauthSecrets";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?pinterest_error=missing_code`);
  }

  try {
    const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? origin).replace(/\/$/, "")}/api/auth/pinterest/callback`;
    const basic = Buffer.from(`${process.env.PINTEREST_CLIENT_ID ?? ""}:${process.env.PINTEREST_CLIENT_SECRET ?? ""}`).toString("base64");

    const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.message ?? tokenData?.error_description ?? "Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;

    // Who this is, and which ad account to spend from. Both are
    // best-effort: a connection that succeeds but can't yet resolve an
    // ad account is still worth saving (the person may need to create
    // one, or the app may still be on trial access) — launching just
    // reports a clear error until it's set.
    let accountId: string | null = null;
    let adAccountId: string | null = null;
    try {
      const meRes = await fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${access_token}` } });
      const me = await meRes.json();
      if (meRes.ok) accountId = me?.id ?? me?.username ?? null;

      const adAccountsRes = await fetch("https://api.pinterest.com/v5/ad_accounts?page_size=1", { headers: { Authorization: `Bearer ${access_token}` } });
      const adAccounts = await adAccountsRes.json();
      if (adAccountsRes.ok) adAccountId = adAccounts?.items?.[0]?.id ?? null;
    } catch (e) {
      console.error("[pinterest-callback] account lookup failed:", e);
    }

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        pinterest_account_id: accountId,
        pinterest_ad_account_id: adAccountId,
        ...tokenWrite("pinterest", "access_token", access_token),
        ...(refresh_token ? tokenWrite("pinterest", "refresh_token", refresh_token) : {}),
        pinterest_token_expiry: new Date(Date.now() + (expires_in ?? 2592000) * 1000).toISOString(),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?pinterest=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?pinterest_error=${encodeURIComponent(err.message)}`);
  }
}
