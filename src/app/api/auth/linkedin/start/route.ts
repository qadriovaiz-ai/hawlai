import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Real OAuth start — same shape as the other ad-platform connect
// flows: redirects to LinkedIn's own login/consent screen; the
// callback exchanges the code server-side.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.redirect(new URL("/dashboard", request.url));

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "LINKEDIN_CLIENT_ID not configured yet" }, { status: 500 });
  }

  const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/api/auth/linkedin/callback`;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("debug") === "1") {
    return NextResponse.json({ redirectUri, siteUrlEnvVar: process.env.NEXT_PUBLIC_SITE_URL ?? null });
  }

  const authorizeUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  // Ad management + the organization scopes the creative step needs
  // (a LinkedIn ad's post is authored by a company page, not a person).
  authorizeUrl.searchParams.set("scope", "r_ads rw_ads r_organization_admin w_organization_social");
  authorizeUrl.searchParams.set("state", profile.dealership_id);

  return NextResponse.redirect(authorizeUrl.toString());
}
