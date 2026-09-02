import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { tokenWrite } from "@/lib/crypto/oauthSecrets";

const LINKEDIN_VERSION = "202405";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?linkedin_error=missing_code`);
  }

  try {
    const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? origin).replace(/\/$/, "")}/api/auth/linkedin/callback`;

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.error_description ?? tokenData?.error ?? "Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;

    const headers = {
      Authorization: `Bearer ${access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_VERSION,
    };

    // Which ad account to spend from, and which company page authors
    // the ad post. Both best-effort — a connection that succeeds but
    // can't resolve one is still saved; launching reports a clear
    // error until both exist, rather than failing the whole connect.
    let adAccountId: string | null = null;
    let organizationId: string | null = null;
    try {
      const acctRes = await fetch("https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))", { headers });
      const acct = await acctRes.json();
      const firstAccount = acct?.elements?.[0];
      if (firstAccount) adAccountId = String(firstAccount.id ?? "").replace("urn:li:sponsoredAccount:", "");

      const orgRes = await fetch("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers });
      const org = await orgRes.json();
      const firstOrg = org?.elements?.[0]?.organization;
      if (firstOrg) organizationId = String(firstOrg).replace("urn:li:organization:", "");
    } catch (e) {
      console.error("[linkedin-callback] account/org lookup failed:", e);
    }

    const supabase = createServiceClient();
    await supabase
      .from("dealerships")
      .update({
        linkedin_ad_account_id: adAccountId,
        linkedin_organization_id: organizationId,
        ...tokenWrite("linkedin", "access_token", access_token),
        ...(refresh_token ? tokenWrite("linkedin", "refresh_token", refresh_token) : {}),
        linkedin_token_expiry: new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?linkedin=connected`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/dashboard/settings/integrations?linkedin_error=${encodeURIComponent(err.message)}`);
  }
}
