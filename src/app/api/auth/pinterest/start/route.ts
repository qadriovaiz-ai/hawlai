import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Real OAuth start — same shape as the Instagram/Google Ads connect
// flows: this redirects to Pinterest's own login/consent screen, and
// the callback exchanges the code for a token server-side. The person
// never sees or types a token.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.redirect(new URL("/dashboard", request.url));

  const clientId = process.env.PINTEREST_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "PINTEREST_CLIENT_ID not configured yet" }, { status: 500 });
  }

  const redirectUri = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/api/auth/pinterest/callback`;

  // Same debug helper as the Instagram flow — confirms the exact
  // redirect_uri byte-for-byte against what's whitelisted in the
  // Pinterest app settings, rather than guessing.
  const { searchParams } = new URL(request.url);
  if (searchParams.get("debug") === "1") {
    return NextResponse.json({ redirectUri, siteUrlEnvVar: process.env.NEXT_PUBLIC_SITE_URL ?? null });
  }

  const authorizeUrl = new URL("https://www.pinterest.com/oauth/");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  // ads:read/ads:write for campaigns, boards+pins:write to create the
  // Pin an ad has to reference.
  authorizeUrl.searchParams.set("scope", "ads:read,ads:write,boards:read,boards:write,pins:read,pins:write");
  authorizeUrl.searchParams.set("state", profile.dealership_id);

  return NextResponse.redirect(authorizeUrl.toString());
}
