import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { tokenWrite } from "@/lib/crypto/oauthSecrets";
import { listSites, matchProperty } from "@/lib/seo/searchConsole";
import { siteBase } from "@/lib/claims/businessFacts";

const BACK = "/dashboard/settings/integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dealershipId = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const origin = url.origin;

  // The owner pressed Cancel on Google's screen. Not an error worth a
  // stack trace — say what happened and leave everything as it was.
  if (denied) return NextResponse.redirect(`${origin}${BACK}?search_console_error=${encodeURIComponent("Connection cancelled — nothing was changed.")}`);
  if (!code || !dealershipId) return NextResponse.redirect(`${origin}${BACK}?search_console_error=missing_code`);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${origin}/api/auth/search-console/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData?.error_description ?? tokenData?.error ?? "Token exchange failed");

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!refresh_token) {
      throw new Error(
        "Google didn't send a refresh token, so the daily read wouldn't keep working. Remove Hawlai at myaccount.google.com/permissions and connect again."
      );
    }

    const service = createServiceClient();

    // Whose account this is, so the owner can see it on the card.
    let email: string | null = null;
    try {
      const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
      if (who.ok) email = (await who.json())?.email ?? null;
    } catch {
      // Not worth failing a working connection over.
    }

    // Which property to read. Matched against this business's own site
    // rather than assuming the first one — see matchProperty: an agency
    // account can hold a dozen, and reading the wrong client's search
    // data would be a privacy failure, not a convenience.
    let siteUrl: string | null = null;
    let propertyNote = "";
    try {
      const { data: website } = await service.from("websites").select("slug").eq("dealership_id", dealershipId).maybeSingle();
      const sites = await listSites(access_token);
      siteUrl = matchProperty(sites, website?.slug ? `${siteBase()}/site/${website.slug}` : null);
      if (!siteUrl) {
        propertyNote = sites.length
          ? "&search_console_note=" +
            encodeURIComponent(
              `Connected, but none of the ${sites.length} propert${sites.length === 1 ? "y" : "ies"} in that Google account matches this business's site. Add and verify it in Search Console, then reconnect.`
            )
          : "&search_console_note=" +
            encodeURIComponent("Connected, but that Google account has no verified Search Console properties yet. Add your site in Search Console first.");
      }
    } catch (e: any) {
      // A connection that works but couldn't list properties is still
      // worth keeping — say so instead of throwing it away.
      propertyNote = "&search_console_note=" + encodeURIComponent(`Connected, but the property list couldn't be read: ${e?.message ?? "unknown error"}`);
    }

    await service
      .from("dealerships")
      .update({
        search_console_email: email,
        search_console_site_url: siteUrl,
        search_console_token_expiry: new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString(),
        ...tokenWrite("search_console", "access_token", access_token),
        ...tokenWrite("search_console", "refresh_token", refresh_token),
      })
      .eq("id", dealershipId);

    return NextResponse.redirect(`${origin}${BACK}?search_console=connected${propertyNote}`);
  } catch (err: any) {
    return NextResponse.redirect(`${origin}${BACK}?search_console_error=${encodeURIComponent(err.message)}`);
  }
}
