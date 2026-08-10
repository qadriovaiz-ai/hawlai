import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Real OAuth start — the actual "Connect with Instagram" experience:
// clicking this redirects to Instagram's own login/consent page,
// where the person logs in with their own Instagram credentials and
// clicks Allow. No token is ever seen or typed by them — the callback
// route below exchanges the authorization code for the real token
// server-side.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  if (!profile?.dealership_id) return NextResponse.redirect(new URL("/dashboard", request.url));

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured yet" }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/instagram/callback`;
  // dealershipId is passed as `state` — read back in the callback to
  // know which dealership to save the connection against. The real
  // security boundary here is Instagram's own login+consent screen
  // (the person has to actually authenticate as themselves), not the
  // state value itself.
  const authorizeUrl = new URL("https://api.instagram.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", profile.dealership_id);

  return NextResponse.redirect(authorizeUrl.toString());
}
