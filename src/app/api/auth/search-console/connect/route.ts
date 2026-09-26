import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Read-only, and nothing else. Hawlai only ever reads this data; asking
// for write access to a business's Search Console property would be
// asking for permission it has no use for.
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url));

  const { data: profile } = await supabase.from("profiles").select("dealership_id").eq("id", user.id).single();
  const dealershipId = profile?.dealership_id;
  if (!dealershipId) return NextResponse.redirect(new URL("/dashboard", request.url));

  // The same Google app Gmail, YouTube and Ads already use — one more
  // scope, no new credentials.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/integrations?search_console_error=Google%20sign-in%20isn%27t%20configured%20on%20this%20deployment%20yet", request.url)
    );
  }

  const origin = new URL(request.url).origin;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/auth/search-console/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  // offline + consent, so a refresh token comes back and the daily read
  // keeps working without the owner signing in again every hour.
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", dealershipId);

  return NextResponse.redirect(authUrl.toString());
}
