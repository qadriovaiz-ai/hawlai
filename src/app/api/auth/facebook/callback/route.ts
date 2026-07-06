import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

const GRAPH_VERSION = "v23.0";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const origin = url.origin;

  if (!code || !dealershipId) {
    return NextResponse.redirect(`${origin}/dashboard/settings/connect-facebook?error=missing_code`);
  }

  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${origin}/api/auth/facebook/callback`;

    // Step 1: exchange the code for a short-lived user token
    const shortRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    );
    const shortData = await shortRes.json();
    if (!shortRes.ok) throw new Error(shortData?.error?.message ?? "Token exchange failed");

    // Step 2: exchange for a long-lived user token (~60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortData.access_token}`
    );
    const longData = await longRes.json();
    if (!longRes.ok) throw new Error(longData?.error?.message ?? "Long-lived token exchange failed");
    const userToken = longData.access_token;

    // Step 3: fetch the Pages this user manages, with a page-specific access token for each
    const pagesRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token&access_token=${userToken}`
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData?.data ?? [];

    // Step 4: fetch the Ad Accounts this user has access to
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts?fields=id,name,account_status,currency&access_token=${userToken}`
    );
    const adAccountsData = await adAccountsRes.json();
    const adAccounts = adAccountsData?.data ?? [];

    // Step 5: for each page, fetch its lead forms (if any) using that page's own token
    const pagesWithForms = await Promise.all(
      pages.map(async (page: any) => {
        try {
          const formsRes = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${page.id}/leadgen_forms?fields=id,name,status&access_token=${page.access_token}`
          );
          const formsData = await formsRes.json();
          return { ...page, leadForms: formsData?.data ?? [] };
        } catch {
          return { ...page, leadForms: [] };
        }
      })
    );

    const serviceClient = createServiceClient();
    await serviceClient
      .from("dealerships")
      .update({
        fb_connect_pending: {
          pages: pagesWithForms,
          adAccounts,
          fetchedAt: new Date().toISOString(),
        },
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}/dashboard/settings/connect-facebook`);
  } catch (err: any) {
    return NextResponse.redirect(
      `${origin}/dashboard/settings/connect-facebook?error=${encodeURIComponent(err.message)}`
    );
  }
}
