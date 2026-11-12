import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// WHAT THE PRODUCT ACTUALLY NEEDS, and the three that were missing.
//
// The DM and comment auto-reply toggles were on in production with zero
// replies ever sent, and this list is half of why (the other half was
// that nothing subscribed the Page — lib/webhooks/subscribeWebhooks.ts).
//
// Added 12 November 2026:
//
//   pages_messaging          send a DM reply AT ALL. Without it
//                            sendDmReply is rejected, so even a
//                            delivered webhook produced nothing.
//   pages_manage_metadata    install the app on the Page via its
//                            subscribed_apps edge — which is what makes
//                            Meta deliver `messages` and `feed` for it.
//                            Without this the webhook never arrives.
//   pages_manage_engagement  post a comment reply.
//
// AN EXISTING CONNECTION CANNOT GAIN THESE. A token is issued with the
// permissions that were asked for when it was granted, so every owner
// connected before this change must RECONNECT. There is nothing the
// server can do about that on their behalf.
//
// AND pages_messaging NEEDS APP REVIEW on a live Meta app. Until it is
// granted, DM replies work only for people with a role on the app.
// That is a queue to join before a pilot, not during one.
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "pages_manage_posts",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_manage_engagement",
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
