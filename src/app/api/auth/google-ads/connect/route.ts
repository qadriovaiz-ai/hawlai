import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Full Google Ads management scope — needed for campaign creation,
// management and reporting per the Basic Access application.
const SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.redirect(new URL("/dashboard", request.url));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google-ads/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId ?? "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", dealershipId);

  return NextResponse.redirect(authUrl.toString());
}
