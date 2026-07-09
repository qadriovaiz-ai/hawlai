import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "pages_manage_posts",
  "ads_management",
  "ads_read",
  "leads_retrieval",
].join(",");

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.redirect(new URL("/dashboard", request.url));

  const appId = process.env.FACEBOOK_APP_ID;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  const authUrl = new URL("https://www.facebook.com/v23.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId ?? "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", dealershipId);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
